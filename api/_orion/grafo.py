"""Grafo do Orquestrador (LangGraph).

O Orquestrador (N1) é o único que fala com os humanos: entende o pedido,
delega para um especialista (N2) e consolida a resposta. Ele NÃO executa
tarefas (product.md). O fluxo é um `StateGraph`:

    START → supervisor ──► tech ────────► supervisor
                │     ├──► negocios ────► supervisor
                │     ├──► agenda ──► aprovacao (interrupt) ──► supervisor
                │     └──► responder ──► END

Regras de comportamento que este módulo materializa:
- "Sem loops" (product.md / Requirement 3.4): o supervisor conta as delegações
  em `passos` e, ao chegar a 4, vai direto para `responder`.
- "Especialistas propõem, humanos aprovam": a Agenda produz uma proposta e o nó
  `aprovacao` pausa o grafo com `interrupt()` (a lógica completa do interrupt e
  da criação da reunião é da task 6.2; aqui o nó existe e devolve o controle ao
  supervisor para o grafo ser montável e roteável de ponta a ponta).
- "Tudo é observável": o supervisor emite `delegou` (de/para) e o `responder`
  emite `resposta`.

Convenção de teste (design.md, Testing Strategy): as chamadas ao modelo ficam
isoladas em `decidir(estado)` e `redigir(estado)`, para que os testes as
substituam por fakes sem tocar na API da Anthropic. Os especialistas já vêm de
`especialistas.py` (tech, negocios, propor_reuniao), que também são
substituíveis.
"""

from __future__ import annotations

import logging
import operator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Iterator, Literal, Optional, TypedDict
from urllib.parse import quote

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from psycopg.types.json import Json
from pydantic import BaseModel, Field

from . import config, db, especialistas, llm
from .atividades import emitir

logger = logging.getLogger("orion.grafo")

# Limite de delegações por run (product.md "Sem loops" / Requirement 3.4).
MAX_PASSOS = 4

# Destinos válidos que o supervisor pode escolher.
Destino = Literal["tech", "agenda", "negocios", "responder"]


class Estado(TypedDict, total=False):
    """Estado do run, persistido no checkpointer do Postgres.

    `relatorios` usa o redutor `operator.add`: cada nó devolve uma lista de um
    item e o LangGraph as concatena ao longo do run (não sobrescreve).
    """

    run_id: str
    autor: str  # "dimi" | "jullyana"
    pedido: str
    historico: str  # últimas 12 mensagens formatadas "Autor: texto"
    relatorios: Annotated[list[dict], operator.add]  # [{"agente","texto"}]
    proxima: str  # destino escolhido pelo supervisor
    instrucao: str  # instrução autocontida para o especialista
    proposta: dict | None  # proposta de reunião aguardando aprovação
    # `passos` usa o redutor `operator.add`: cada especialista devolve `1` e o
    # LangGraph acumula (não sobrescreve), para o supervisor contar as
    # delegações até MAX_PASSOS (Requirement 3.4, "Sem loops").
    passos: Annotated[int, operator.add]  # delegações já feitas (limite MAX_PASSOS)
    resposta: str  # texto final para o chat


class Rota(BaseModel):
    """Decisão estruturada do supervisor (Requirement 3.1).

    `proximo` é um dos especialistas ou `responder`; `instrucao` é autocontida
    (o especialista não vê o histórico do supervisor) e `motivo` é curto, para
    o log/atividade `delegou`.
    """

    proximo: Destino = Field(
        description=(
            "Quem deve trabalhar agora: 'tech' (produto/código/PRs), "
            "'agenda' (reuniões e pautas), 'negocios' (custos, métricas, "
            "decisões) ou 'responder' (quando os relatórios já bastam ou é "
            "conversa simples)."
        )
    )
    instrucao: str = Field(
        description=(
            "Instrução autocontida para o especialista (ele não vê esta "
            "conversa). Vazia quando 'proximo' for 'responder'."
        ),
        default="",
    )
    motivo: str = Field(
        description="Motivo curto da escolha, para o log.", default=""
    )


# --- Chamadas ao modelo isoladas (substituíveis nos testes) ---


def _prompt_supervisor() -> str:
    """Prompt de sistema do supervisor (Orquestrador).

    A data é formatada em PT-BR com dia da semana (config.agora_formatado()),
    nunca com `%A` (que sairia em inglês).
    """
    return (
        "Você é o Orquestrador do Orion HQ, chefe de gabinete de Dimi e "
        "Jullyana. Você NÃO executa tarefas: decide quem trabalha.\n"
        "- tech = produto/código/PRs do app Orion;\n"
        "- agenda = reuniões e pautas;\n"
        "- negocios = custos, métricas, decisões de negócio;\n"
        "- responder = quando os relatórios já bastam ou é conversa simples.\n"
        "Dê ao especialista uma instrução autocontida (ele não vê esta "
        "conversa). Não repita um especialista para a mesma coisa.\n"
        f"Agora é {config.agora_formatado()} (fuso America/Sao_Paulo)."
    )


def _contexto_estado(estado: Estado) -> str:
    """Monta o texto que descreve o pedido, o histórico e os relatórios.

    Reunido num HumanMessage para o supervisor decidir o próximo passo.
    """
    partes: list[str] = []
    historico = estado.get("historico") or ""
    if historico:
        partes.append(f"Histórico recente do grupo:\n{historico}")

    partes.append(f"Pedido atual ({estado.get('autor', 'sócio')}): "
                  f"{estado.get('pedido', '')}")

    relatorios = estado.get("relatorios") or []
    if relatorios:
        linhas = "\n\n".join(
            f"[{r.get('agente', '?')}] {r.get('texto', '')}" for r in relatorios
        )
        partes.append(f"Relatórios já coletados neste pedido:\n{linhas}")
    else:
        partes.append("Ainda não há relatórios de especialistas neste pedido.")

    return "\n\n".join(partes)


def decidir(estado: Estado) -> Rota:
    """Decide o próximo passo com saída estruturada (Requirement 3.1).

    Isolada para os testes a substituírem por um fake sem chamar a Anthropic.
    Registra os tokens gastos numa atividade `pensando` do Orquestrador.
    """
    mensagens = [
        SystemMessage(content=_prompt_supervisor()),
        HumanMessage(content=_contexto_estado(estado)),
    ]
    rota, gasto = llm.estruturado(llm.principal(), Rota, mensagens)
    emitir(estado.get("run_id"), "orq", "pensando", "Decidindo o próximo passo",
           tokens=gasto)
    return rota


def _prompt_redigir() -> str:
    """Prompt de sistema para redigir a resposta final ao chat."""
    return (
        "Você é o Orquestrador do Orion HQ, respondendo a Dimi e Jullyana.\n"
        "Escreva a resposta final usando SOMENTE o conteúdo dos relatórios dos "
        "especialistas abaixo. Não invente informações. Quando um relatório "
        "citar uma fonte (PR, nota, decisão) e data, mantenha a citação.\n"
        "Se não houver relatórios (conversa simples), responda de forma breve "
        "e cordial.\n"
        f"Agora é {config.agora_formatado()} (fuso America/Sao_Paulo).\n"
        "Responda em português do Brasil, de forma direta."
    )


def redigir(estado: Estado) -> str:
    """Redige a resposta final a partir dos relatórios (Requirement 3.5).

    Isolada para os testes a substituírem por um fake.
    """
    relatorios = estado.get("relatorios") or []
    if relatorios:
        corpo = "\n\n".join(
            f"[{r.get('agente', '?')}] {r.get('texto', '')}" for r in relatorios
        )
        contexto = f"Relatórios dos especialistas:\n{corpo}"
    else:
        contexto = "Não há relatórios; é uma conversa simples."

    humano = (
        f"Pedido de {estado.get('autor', 'sócio')}: {estado.get('pedido', '')}\n\n"
        f"{contexto}"
    )
    mensagens = [
        SystemMessage(content=_prompt_redigir()),
        HumanMessage(content=humano),
    ]
    ai = llm.principal().invoke(mensagens)
    emitir(estado.get("run_id"), "orq", "pensando", "Redigindo a resposta",
           tokens=llm.tokens(ai))
    return llm.texto(ai)


# --- Nós do grafo ---


def no_supervisor(estado: Estado) -> dict:
    """Supervisor: escolhe o próximo passo ou encerra por limite de passos.

    Se `passos >= MAX_PASSOS`, roteia para `responder` (Requirement 3.4). Caso
    contrário, chama `decidir` e emite a atividade `delegou` (de/para/motivo)
    quando delega a um especialista (Requirement 3.2).
    """
    run_id = estado.get("run_id")
    passos = estado.get("passos", 0)

    if passos >= MAX_PASSOS:
        emitir(
            run_id,
            "orq",
            "pensando",
            "Limite de delegações atingido; respondendo com o que há.",
        )
        return {"proxima": "responder"}

    rota = decidir(estado)
    proximo = rota.proximo

    if proximo == "responder":
        return {"proxima": "responder"}

    # Delegação a um especialista: registra `delegou` com de/para/motivo.
    emitir(
        run_id,
        "orq",
        "delegou",
        rota.motivo or f"Delegar para {proximo}",
        dados={"de": "orq", "para": proximo, "motivo": rota.motivo},
    )
    return {"proxima": proximo, "instrucao": rota.instrucao}


def no_tech(estado: Estado) -> dict:
    """Nó Tech: roda o especialista, devolve controle ao orq e soma um passo."""
    run_id = estado.get("run_id")
    instrucao = estado.get("instrucao") or estado.get("pedido", "")
    texto = especialistas.tech(instrucao, run_id)
    emitir(run_id, "tech", "delegou", "Relatório para o Orquestrador",
           dados={"de": "tech", "para": "orq"})
    return {"relatorios": [{"agente": "tech", "texto": texto}], "passos": 1}


def no_negocios(estado: Estado) -> dict:
    """Nó Negócios: idem ao Tech, com o especialista de negócios."""
    run_id = estado.get("run_id")
    instrucao = estado.get("instrucao") or estado.get("pedido", "")
    texto = especialistas.negocios(instrucao, run_id)
    emitir(run_id, "negocios", "delegou", "Relatório para o Orquestrador",
           dados={"de": "negocios", "para": "orq"})
    return {"relatorios": [{"agente": "negocios", "texto": texto}], "passos": 1}


def no_agenda(estado: Estado) -> dict:
    """Nó Agenda: produz a proposta de reunião e soma um passo.

    A proposta segue para o nó `aprovacao`. Somamos o passo aqui (a delegação
    para a Agenda), e a aprovação em si não conta como nova delegação.
    Se o `inicio` for inválido, a Agenda devolve um relatório explicando e o
    grafo volta ao supervisor sem pausar (`proposta = None`).
    """
    run_id = estado.get("run_id")
    instrucao = estado.get("instrucao") or estado.get("pedido", "")
    proposta = especialistas.propor_reuniao(instrucao, run_id)
    problema = proposta.get("problema") or especialistas.problema_inicio(
        proposta.get("inicio")
    )
    if problema:
        titulo = proposta.get("titulo", "reunião")
        emitir(run_id, "agenda", "delegou", "Proposta inválida",
               dados={"de": "agenda", "para": "orq"})
        relatorio = (
            f'Não propus a reunião "{titulo}": {problema}. '
            "É preciso pedir outra data aos sócios."
        )
        return {
            "relatorios": [{"agente": "agenda", "texto": relatorio}],
            "proposta": None,
            "passos": 1,
        }
    emitir(run_id, "agenda", "delegou", "Proposta para aprovação",
           dados={"de": "agenda", "para": "orq"})
    return {"proposta": proposta, "passos": 1}


# --- Aprovação: links de calendário e persistência da reunião ---


def _instantes_reuniao(proposta: dict) -> tuple[datetime, datetime]:
    """Calcula (início, fim) da proposta como datetimes com tzinfo.

    O `inicio` da proposta é ISO 8601 com offset (ex.: `2026-09-29T15:00:00
    -03:00`); `datetime.fromisoformat` já lida com isso no Python 3.10. O fim é
    o início mais `duracao_min` minutos (default 60 se ausente/ inválido). Se o
    início vier sem tzinfo, assumimos o fuso do projeto (America/Sao_Paulo).
    """
    inicio = config.ler_iso(proposta.get("inicio"))
    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=config.TZ)

    try:
        duracao = int(proposta.get("duracao_min") or 60)
    except (TypeError, ValueError):
        duracao = 60

    fim = inicio + timedelta(minutes=duracao)
    return inicio, fim


def _formato_utc(momento: datetime) -> str:
    """Formata um datetime em UTC no padrão do Google Agenda: YYYYMMDDTHHMMSSZ."""
    return momento.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def link_google(proposta: dict, inicio: datetime, fim: datetime) -> str:
    """Monta o link "adicionar ao Google Agenda" (Requirement 6.4).

    Formato (design.md, "Links de calendário"):
    `.../render?action=TEMPLATE&text=<titulo>&dates=<inicioUTC>/<fimUTC>&details=<pauta>`
    com datas em UTC (YYYYMMDDTHHMMSSZ) e parâmetros URL-encoded. A pauta (lista)
    vira um texto com um item por linha.
    """
    titulo = str(proposta.get("titulo", "Reunião"))
    pauta_itens = proposta.get("pauta") or []
    if isinstance(pauta_itens, (list, tuple)):
        detalhes = "\n".join(str(item) for item in pauta_itens)
    else:
        detalhes = str(pauta_itens)

    datas = f"{_formato_utc(inicio)}/{_formato_utc(fim)}"
    return (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote(titulo)}"
        f"&dates={datas}"
        f"&details={quote(detalhes)}"
    )


def link_ics(reuniao_id: int) -> str:
    """Link do arquivo iCalendar da reunião (gerado pela rota da task 7)."""
    return f"/api/reunioes/{reuniao_id}.ics"


_CAMPOS_REUNIAO = "id, titulo, inicio, fim, participantes, pauta, criado_por, run_id, chave"


def _criar_reuniao(
    proposta: dict,
    criado_por: str,
    run_id: Optional[str],
    chave: str,
    inicio: datetime,
    fim: datetime,
) -> dict:
    """Persiste a reunião aprovada em `reunioes` e devolve a linha.

    Idempotente pela `chave` (a mesma da aprovação): se o run for retomado de
    novo depois de uma falha, reaproveita a reunião já criada em vez de
    duplicar. `participantes` e `pauta` são `text[]` no Postgres; o psycopg
    mapeia listas Python para arrays automaticamente.
    """
    participantes = list(proposta.get("participantes") or [])
    pauta = list(proposta.get("pauta") or [])

    linha = db.um(
        f"""
        insert into reunioes
            (titulo, inicio, fim, participantes, pauta, criado_por, run_id, chave)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (chave) do nothing
        returning {_CAMPOS_REUNIAO}
        """,
        (
            str(proposta.get("titulo", "Reunião")),
            inicio,
            fim,
            participantes,
            pauta,
            criado_por,
            run_id,
            chave,
        ),
    )
    if linha is None:
        linha = db.um(
            f"select {_CAMPOS_REUNIAO} from reunioes where chave = %s", (chave,)
        )
    assert linha is not None
    return linha


def no_aprovacao(estado: Estado) -> dict:
    """Nó de aprovação: pausa com `interrupt()` e cria a reunião se aprovada.

    Fluxo (design.md, "Fluxo de aprovação" / Requirements 6.3–6.5):

    1. Registra a aprovação pendente com insert idempotente pela `chave`
       (`run_id:passo`) usando `on conflict (chave) do nothing returning id`.
       Como TUDO antes do `interrupt()` reexecuta ao retomar (o nó roda de novo
       no resume), o insert só cria linha na primeira passagem; a atividade
       `aguardando_aprovacao` (com `dados.aprovacao_id`) só é emitida quando o
       insert de fato criou uma linha nova (Requirement 6.3).
    2. `interrupt()` pausa o grafo: o estado vai para o Postgres e a função HTTP
       termina. A retomada vem via `Command(resume={"aprovado":..., "por":...})`
       em `decidir_aprovacao` (task 6.3).
    3. Se aprovado, cria a reunião, gera os links (Google + .ics) e devolve um
       relatório; a atividade `concluiu` da Agenda leva `dados.google`/`dados.ics`
       (Requirement 6.4). Se recusado, não cria nada e informa quem recusou
       (Requirement 6.5).
    """
    run_id = estado.get("run_id")
    passos = estado.get("passos", 0)
    proposta = estado.get("proposta") or {}
    autor = estado.get("autor", "")
    titulo = proposta.get("titulo", "reunião")

    # 1. Registro idempotente da aprovação pendente pela `chave` = run_id:passo.
    chave = f"{run_id}:{passos}"
    nova = db.um(
        """
        insert into aprovacoes (run_id, chave, tipo, proposta, pedido_por)
        values (%s, %s, %s, %s, %s)
        on conflict (chave) do nothing
        returning id
        """,
        (run_id, chave, "criar_reuniao", Json(proposta), autor),
    )
    # `nova` só vem preenchido quando o insert criou uma linha (primeira
    # passagem). No resume, `on conflict do nothing` não retorna nada, então
    # não reemitimos a atividade (Requirement 6.3).
    if nova is not None:
        emitir(
            run_id,
            "agenda",
            "aguardando_aprovacao",
            f'Aguardando aprovação da reunião "{titulo}".',
            dados={"aprovacao_id": nova["id"]},
        )

    # 2. Pausa o grafo até a decisão humana (retoma via Command(resume=...)).
    decisao = interrupt({"tipo": "criar_reuniao", "proposta": proposta})

    aprovado = bool(decisao.get("aprovado"))
    por = decisao.get("por", "")

    # 3. Efeito da decisão.
    if aprovado:
        try:
            inicio, fim = _instantes_reuniao(proposta)
        except (TypeError, ValueError):
            detalhe = (
                f'A reunião "{titulo}" foi aprovada por {por}, mas NÃO foi '
                f'criada: a data de início "{proposta.get("inicio")}" é inválida.'
            )
            emitir(run_id, "agenda", "erro", detalhe)
            return {
                "relatorios": [{
                    "agente": "agenda",
                    "texto": f"{detalhe} É preciso pedir outra data aos sócios.",
                }],
                "proposta": None,
            }
        reuniao = _criar_reuniao(proposta, por, run_id, chave, inicio, fim)
        google = link_google(proposta, inicio, fim)
        ics = link_ics(reuniao["id"])
        emitir(
            run_id,
            "agenda",
            "concluiu",
            f'Reunião "{titulo}" criada (aprovada por {por}).',
            dados={"google": google, "ics": ics},
        )
        relatorio = (
            f'Reunião "{titulo}" criada (aprovada por {por}).\n'
            f"Adicionar ao Google Agenda: {google}\n"
            f"Arquivo .ics: {ics}"
        )
    else:
        emitir(
            run_id,
            "agenda",
            "concluiu",
            f'Reunião "{titulo}" NÃO foi criada: {por} recusou.',
        )
        relatorio = f'A reunião "{titulo}" NÃO foi criada: {por} recusou.'

    return {
        "relatorios": [{"agente": "agenda", "texto": relatorio}],
        "proposta": None,
    }


def no_responder(estado: Estado) -> dict:
    """Nó final: redige a resposta e emite a atividade `resposta`."""
    run_id = estado.get("run_id")
    resposta = redigir(estado)
    emitir(run_id, "orq", "resposta", resposta[:200])
    return {"resposta": resposta}


# --- Roteamento ---


def _rota_supervisor(estado: Estado) -> Destino:
    """Aresta condicional a partir do supervisor: usa `estado["proxima"]`."""
    proxima = estado.get("proxima", "responder")
    if proxima not in ("tech", "agenda", "negocios", "responder"):
        # Defensivo: destino inesperado encerra respondendo com o que há.
        return "responder"
    return proxima  # type: ignore[return-value]


def _rota_agenda(estado: Estado) -> str:
    """Depois da Agenda: aprovação se há proposta válida; senão, supervisor."""
    return "aprovacao" if estado.get("proposta") else "supervisor"


# --- Construção e compilação ---


def construir() -> StateGraph:
    """Monta o `StateGraph` (sem compilar).

    Arestas: START→supervisor; supervisor→(tech|negocios|agenda|responder);
    tech/negocios→supervisor; agenda→(aprovacao|supervisor);
    aprovacao→supervisor; responder→END.
    """
    grafo = StateGraph(Estado)

    grafo.add_node("supervisor", no_supervisor)
    grafo.add_node("tech", no_tech)
    grafo.add_node("negocios", no_negocios)
    grafo.add_node("agenda", no_agenda)
    grafo.add_node("aprovacao", no_aprovacao)
    grafo.add_node("responder", no_responder)

    grafo.add_edge(START, "supervisor")
    grafo.add_conditional_edges(
        "supervisor",
        _rota_supervisor,
        {
            "tech": "tech",
            "negocios": "negocios",
            "agenda": "agenda",
            "responder": "responder",
        },
    )
    grafo.add_edge("tech", "supervisor")
    grafo.add_edge("negocios", "supervisor")
    grafo.add_conditional_edges(
        "agenda",
        _rota_agenda,
        {"aprovacao": "aprovacao", "supervisor": "supervisor"},
    )
    grafo.add_edge("aprovacao", "supervisor")
    grafo.add_edge("responder", END)

    return grafo


@contextmanager
def grafo_com_checkpoint() -> Iterator[Any]:
    """Compila o grafo com o checkpointer do Postgres (Neon).

    Conexão curta (design.md, "Execução de um run"): abre o `PostgresSaver`
    via `db.checkpointer()`, compila e entrega o grafo pronto; fecha ao sair
    do contexto.
    """
    with db.checkpointer() as checkpointer:
        yield construir().compile(checkpointer=checkpointer)
