"""Vigia (Rui): diagnóstico de erros de produção do Orion.

Este módulo materializa o diagnóstico do Vigia (design.md, "Diagnóstico"): o
Rui (agente `vigia`) investiga um incidente com ferramentas SOMENTE leitura e,
quando precisa olhar o código do repositório do Orion, delega ao Tobias
(agente `tech`) via `pedir_ao_tobias`.

Esta parte (tasks 4.1 e 4.2) cobre:

- as **ferramentas do Rui** (Requirement 3.2), todas somente leitura, montadas
  por uma factory `ferramentas_do_rui(incidente_id, run_id)` — as ferramentas
  que precisam do contexto do run (`detalhe_incidente`, `pedir_ao_tobias`) são
  fechadas (closures) sobre esse contexto;
- `pedir_ao_tobias(pergunta)` (Requirements 3.3, 7.3), que emite atividades
  `delegou` de `vigia` para `tech` e de volta, roda o Tobias com a ferramenta
  `ler_arquivo_repo` (além de `buscar_changelog` e `commits_recentes`) e devolve
  o texto do Tobias;
- `diagnosticar(incidente_id)` (task 4.2): o loop do Rui (máx. 8 voltas), a saída
  estruturada `Diagnostico`, o registro de tokens, a mudança de status para
  `diagnosticado`, o resumo do Orquestrador no chat e o tratamento de falha
  (Requirements 3.1, 3.5, 3.7, 3.8, 3.9, 4.3, 4.4).

As áreas proibidas por código (task 4.3) e o limite por hora com aviso de fila
(task 4.4, `dentro_do_limite`/`avisar_fila_uma_vez_por_hora`) já estão
implementadas. A ligação do webhook ao diagnóstico (task 4.5) ainda é uma
"costura" que a próxima task preenche.

Convenções (tech.md): módulos em `api/_orion/`, código tipado, funções
pequenas, env lida dentro das funções, `atividades.emitir` nunca derruba o
fluxo. As ferramentas `@tool` têm a lógica isolada em funções privadas
testáveis. A chamada ao modelo com saída estruturada fica isolada em
`estruturar()`, para os testes a substituírem sem tocar na Anthropic. Não
usamos chains/agents prontos do LangChain: o loop de ferramentas é o
`rodar_com_ferramentas` de `especialistas.py`.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from psycopg.types.json import Json
from pydantic import BaseModel, Field

from . import config, db, github_leitura, llm
from . import especialistas
from . import ferramentas as ferramentas_mod
from .atividades import emitir

logger = logging.getLogger("orion.vigia")

# Autor das mensagens escritas no chat: só o Orquestrador escreve (product.md,
# "Especialistas propõem, humanos aprovam"; Requirement 3.6/3.8). Mantido igual
# a execucao.AUTOR_ORQ / github.AUTOR_ORQ.
AUTOR_ORQ = "Orquestrador"

# Máximo de voltas do Rui no diagnóstico (Requirement 4.4).
MAX_VOLTAS_RUI = 8

# Máximo de voltas do Tobias quando o Rui pede ajuda (Requirement 4.4).
MAX_VOLTAS_TOBIAS = 6

# Nº máximo de commits recentes listados pela ferramenta (evita respostas enormes).
_LIMITE_COMMITS_TEXTO = 30


# --- Prompts de sistema ---


def _prompt_tech_codigo() -> str:
    """Prompt do Tobias (tech) no contexto de leitura de código.

    O Rui chama `pedir_ao_tobias` para que o Tobias leia arquivos do repositório
    do Orion e ajude a localizar a causa de um erro. Aqui o Tobias NÃO fala de
    changelog em primeiro lugar: ele lê o código real com `ler_arquivo_repo` e
    cruza com commits recentes. Vale a regra "nada inventado".
    """
    return (
        "Você é o Tobias, o Tech do Orion HQ, ajudando o Rui (vigia de plantão) "
        "a diagnosticar um erro de produção do app Orion.\n"
        "Sua tarefa é LER o código do repositório do Orion para localizar a "
        "provável causa do erro descrito pelo Rui.\n\n"
        "Ferramentas disponíveis (todas somente leitura):\n"
        "- ler_arquivo_repo(caminho, ref): lê um arquivo do repositório do "
        "Orion. Use nos arquivos que aparecem no stack trace.\n"
        "- commits_recentes(dias): lista os commits recentes, para cruzar com a "
        "primeira ocorrência do erro.\n"
        "- buscar_changelog(consulta): busca no histórico do projeto (PRs, "
        "notas, decisões).\n\n"
        "Regras inegociáveis:\n"
        "- Nada inventado. Só afirme o que vier das ferramentas. Se um arquivo "
        "não existir ou não puder ser lido, diga isso.\n"
        "- Nunca invente arquivos, linhas, PRs ou números.\n"
        "- Responda de forma direta, em português do Brasil, apontando arquivo, "
        "trecho e por que ele pode causar o erro."
    )


# `especialistas.py` importa este prompt pelo nome combinado no design/tasks.
SISTEMA_TECH_CODIGO = _prompt_tech_codigo()


def _prompt_vigia() -> str:
    """Prompt de sistema do Rui (vigia) no diagnóstico de um incidente.

    Resume as regras do design/Requirements: investigar a causa provável usando
    SÓ as ferramentas (stack, commits/PRs recentes perto da primeira
    ocorrência, e o Tobias para ler os arquivos do stack), nunca inventar, e —
    se não tiver certeza — dizer o que falta investigar com confiança baixa
    (Requirements 3.7, 3.10). O Rui não corrige nada. Inclui a data/hora atual
    (config.agora_formatado()), lida dentro da função (tech.md).
    """
    return (
        "Você é o Rui, vigia de plantão do Orion. Recebeu um erro de produção. "
        "Descubra a causa provável usando SÓ as ferramentas: veja o stack, os "
        "commits e PRs recentes perto da primeira ocorrência e peça ao Tobias "
        "para ler os arquivos do stack. Nunca invente arquivos, PRs ou números. "
        "Se não tiver certeza, diga o que falta investigar (confiança baixa). "
        "Você não corrige nada.\n"
        f"Data e hora atual: {config.agora_formatado()} (fuso America/Sao_Paulo)."
    )


# Prompt do Rui, recomposto a cada diagnóstico (para a data/hora ficar atual).
# Exposto como constante para os testes e o `diagnosticar` reutilizarem o nome
# combinado no design; a função `_prompt_vigia()` é reavaliada em `diagnosticar`.
SISTEMA_VIGIA = _prompt_vigia()


def _prompt_vigia_chat() -> str:
    """Prompt do Rui na rota `vigia` do chat (Requirements 5.2, 5.3).

    Aqui o Rui NÃO inicia um diagnóstico novo: ele responde a partir dos
    incidentes e diagnósticos JÁ registrados, usando só as ferramentas de
    leitura (`incidentes_abertos`, `detalhe_incidente`). Vale a regra "nada
    inventado" — e, se não houver incidentes abertos, ele diz isso claramente
    (Requirement 5.3). Inclui a data/hora atual, lida dentro da função (tech.md).
    """
    return (
        "Você é o Rui, vigia de plantão do Orion, respondendo a Dimi e "
        "Jullyana no chat sobre a saúde do app.\n"
        "Responda SOMENTE a partir dos incidentes e diagnósticos já "
        "registrados. Use as ferramentas de leitura: incidentes_abertos para "
        "ver o que está aberto ou diagnosticado e detalhe_incidente para os "
        "detalhes de um incidente específico.\n"
        "NÃO inicie um novo diagnóstico e NÃO invente incidentes, arquivos, PRs "
        "ou números. Se não houver incidentes abertos, diga isso claramente.\n"
        f"Data e hora atual: {config.agora_formatado()} (fuso America/Sao_Paulo)."
    )


# --- Funções privadas testáveis das ferramentas do Rui ---


def _frame_para_texto(frame: dict) -> str:
    """Formata um frame de stack (já filtrado pela whitelist) em uma linha."""
    arquivo = frame.get("arquivo") or "?"
    funcao = frame.get("funcao") or "?"
    linha = frame.get("linha")
    modulo = frame.get("modulo")
    parte = f"{arquivo}:{linha}" if linha is not None else arquivo
    texto = f"  - {parte} em {funcao}"
    if modulo:
        texto += f" ({modulo})"
    return texto


def _detalhe_incidente(incidente_id: int) -> str:
    """Lê um incidente do banco e devolve um texto legível para o Rui.

    Traz título, projeto, nível, culpado, release, ambiente, url, ocorrências,
    usuários afetados, o stack (frames já filtrados pela whitelist) e o
    diagnóstico se já houver. Nunca inventa: só usa o que está no banco. Se o
    incidente não existir, diz isso explicitamente.
    """
    incidente = db.um(
        """
        select id, sentry_issue_id, projeto, titulo, nivel, culpado, release,
               ambiente, url, stack, ocorrencias, usuarios_afetados,
               primeira_vez, ultima_vez, status, diagnostico
        from incidentes
        where id = %s
        """,
        (incidente_id,),
    )
    if incidente is None:
        return f"Incidente {incidente_id} não encontrado."

    linhas = [
        f"Incidente #{incidente['id']} — {incidente.get('titulo') or '(sem título)'}",
        f"Projeto: {incidente.get('projeto') or 'desconhecido'}",
        f"Nível: {incidente.get('nivel') or '-'}",
        f"Culpado: {incidente.get('culpado') or '-'}",
        f"Release: {incidente.get('release') or '-'}",
        f"Ambiente: {incidente.get('ambiente') or '-'}",
        f"URL no Sentry: {incidente.get('url') or '-'}",
        f"Ocorrências: {incidente.get('ocorrencias')}",
        f"Usuários afetados: {incidente.get('usuarios_afetados')}",
        f"Status: {incidente.get('status')}",
    ]

    stack = incidente.get("stack")
    if isinstance(stack, list) and stack:
        linhas.append("Stack (frames filtrados):")
        linhas.extend(_frame_para_texto(f) for f in stack if isinstance(f, dict))
    else:
        linhas.append("Stack: indisponível.")

    diagnostico = incidente.get("diagnostico")
    if diagnostico:
        try:
            texto_diag = json.dumps(diagnostico, ensure_ascii=False, indent=2)
        except (TypeError, ValueError):
            texto_diag = str(diagnostico)
        linhas.append("Diagnóstico já registrado:")
        linhas.append(texto_diag)

    return "\n".join(linhas)


def _incidentes_abertos() -> str:
    """Lista os incidentes com status `aberto` ou `diagnosticado`.

    Usada tanto no diagnóstico quanto na rota `vigia` do chat. Ordena os mais
    recentes primeiro (por `ultima_vez`). Se não houver nenhum, diz isso
    claramente (Requirement 5.3).
    """
    incidentes = db.consultar(
        """
        select id, projeto, titulo, nivel, ocorrencias, usuarios_afetados,
               ultima_vez, status
        from incidentes
        where status in ('aberto', 'diagnosticado')
        order by ultima_vez desc
        """
    )
    if not incidentes:
        return "Nenhum incidente aberto ou diagnosticado no momento."

    linhas = []
    for inc in incidentes:
        linhas.append(
            f"#{inc['id']} [{inc.get('status')}] {inc.get('projeto')} · "
            f"{inc.get('nivel') or '-'} · {inc.get('titulo') or '(sem título)'} "
            f"— {inc.get('ocorrencias')} ocorrências, "
            f"{inc.get('usuarios_afetados')} usuários"
        )
    return "\n".join(linhas)


def _commits_recentes_texto(dias: int) -> str:
    """Formata os commits recentes do repositório do Orion em texto.

    Embrulha `github_leitura.commits_recentes` (que devolve uma lista de dicts)
    num texto legível para o modelo. Se não houver commits (ou faltar
    configuração/token), diz isso — nunca inventa.
    """
    try:
        dias = int(dias)
    except (TypeError, ValueError):
        dias = 7
    if dias <= 0:
        dias = 7

    commits = github_leitura.commits_recentes(dias)
    if not commits:
        return f"Nenhum commit recente encontrado nos últimos {dias} dias."

    linhas = []
    for commit in commits[:_LIMITE_COMMITS_TEXTO]:
        sha = commit.get("sha") or "?"
        mensagem = commit.get("mensagem") or ""
        autor = commit.get("autor") or "?"
        data = commit.get("data") or "?"
        linhas.append(f"{sha} · {data} · {autor}: {mensagem}")
    return "\n".join(linhas)


# --- pedir_ao_tobias (Requirements 3.3, 7.3) ---


@tool
def ler_arquivo_repo(caminho: str, ref: Optional[str] = None) -> str:
    """Lê um arquivo do repositório do Orion (somente leitura).

    Informe o `caminho` relativo ao repo e, opcionalmente, um `ref` (branch,
    tag ou sha). Recusa arquivos de ambiente/chaves e trunca arquivos muito
    grandes. Use nos arquivos que aparecem no stack trace do erro.
    """
    return github_leitura.ler_arquivo_repo(caminho, ref)


@tool
def commits_recentes(dias: int = 7) -> str:
    """Lista os commits recentes do repositório do Orion (padrão 7 dias).

    Use para cruzar a primeira ocorrência do erro com o que mudou por perto.
    Cita sha, data, autor e a primeira linha da mensagem de cada commit.
    """
    return _commits_recentes_texto(dias)


def _pedir_ao_tobias(pergunta: str, run_id: str | None) -> str:
    """Delega ao Tobias (tech) a leitura do código, com atividades de ida e volta.

    Emite `delegou` de `vigia` para `tech`, roda o Tobias com as ferramentas de
    leitura de código (`ler_arquivo_repo`, `buscar_changelog`, `commits_recentes`)
    pelo loop próprio `rodar_com_ferramentas`, emite `delegou` de volta e devolve
    o texto do Tobias (Requirements 3.3, 7.3).
    """
    emitir(run_id, "vigia", "delegou", pergunta, dados={"de": "vigia", "para": "tech"})

    resposta = especialistas.rodar_com_ferramentas(
        "tech",
        SISTEMA_TECH_CODIGO,
        pergunta,
        [ler_arquivo_repo, ferramentas_mod.buscar_changelog, commits_recentes],
        run_id,
        max_voltas=MAX_VOLTAS_TOBIAS,
    )

    emitir(
        run_id,
        "tech",
        "delegou",
        resposta[:200],
        dados={"de": "tech", "para": "vigia"},
    )
    return resposta


# --- Factory das ferramentas do Rui (Requirement 3.2) ---


def ferramentas_do_rui(incidente_id: int, run_id: str | None) -> list:
    """Monta a lista de ferramentas SOMENTE leitura do Rui para um diagnóstico.

    As ferramentas que precisam do contexto do run (`detalhe_incidente` e
    `pedir_ao_tobias`) são fechadas sobre `incidente_id`/`run_id` por closures,
    já que `@tool` não recebe esse contexto pela assinatura exposta ao modelo.
    As demais (`incidentes_abertos`, `buscar_changelog`, `mudancas_recentes`,
    `commits_recentes`) são reaproveitadas sem duplicação.
    """

    @tool
    def detalhe_incidente() -> str:
        """Mostra os detalhes do incidente em diagnóstico.

        Traz título, projeto, nível, culpado, release, ambiente, URL no Sentry,
        contagens, o stack trace (frames filtrados) e o diagnóstico se já
        existir. É a primeira ferramenta a usar para entender o erro.
        """
        return _detalhe_incidente(incidente_id)

    @tool
    def incidentes_abertos() -> str:
        """Lista os incidentes abertos ou já diagnosticados.

        Útil para ver se há erros parecidos ou relacionados ao atual.
        """
        return _incidentes_abertos()

    @tool
    def pedir_ao_tobias(pergunta: str) -> str:
        """Pede ao Tobias (Tech) para ler o código do repositório do Orion.

        Descreva o que quer investigar (ex.: "leia o arquivo X e diga se a
        função Y pode causar este erro"). O Tobias lê os arquivos do repo e
        responde. Use quando precisar olhar o código-fonte do stack trace.
        """
        return _pedir_ao_tobias(pergunta, run_id)

    return [
        detalhe_incidente,
        incidentes_abertos,
        ferramentas_mod.buscar_changelog,
        ferramentas_mod.mudancas_recentes,
        commits_recentes,
        pedir_ao_tobias,
    ]


# --- Modelo do diagnóstico (Requirement 3.5) ---


class ArquivoSuspeito(BaseModel):
    """Um arquivo apontado pelo Rui como provável origem do erro."""

    caminho: str = Field(description="Caminho do arquivo no repositório do Orion.")
    motivo: str = Field(description="Por que este arquivo é suspeito.")


class Diagnostico(BaseModel):
    """Diagnóstico estruturado do Rui para um incidente (design.md / Req. 3.5).

    Campos em português (snake_case). É salvo como `jsonb` em
    `incidentes.diagnostico`. `corrigivel_automaticamente` é uma decisão do
    modelo, mas a task 4.3 pode forçá-la para `False` por código quando o
    incidente tocar áreas protegidas (`aplicar_areas_proibidas`).
    """

    resumo: str = Field(description="Resumo curto do erro e do diagnóstico.")
    causa_provavel: str = Field(description="A causa mais provável do erro.")
    confianca: Literal["baixa", "media", "alta"] = Field(
        description="Confiança no diagnóstico: baixa, media ou alta."
    )
    arquivos_suspeitos: list[ArquivoSuspeito] = Field(
        default_factory=list,
        description="Arquivos suspeitos, com o motivo de cada um.",
    )
    pr_relacionado: str | None = Field(
        default=None, description="PR provavelmente relacionado (ex.: PR #12), se houver."
    )
    impacto: str = Field(description="Impacto do erro para os usuários do Orion.")
    proximo_passo: str = Field(
        description="Próximo passo recomendado (o que investigar ou fazer)."
    )
    corrigivel_automaticamente: bool = Field(
        description="Se o erro parece corrigível automaticamente no futuro."
    )
    motivo: str = Field(
        description="Motivo de ser (ou não) corrigível automaticamente."
    )


# --- Chamada ao modelo isolada para os testes (Requirement 3.5) ---


def _instrucao_estruturar(relatorio: str, incidente: dict) -> str:
    """Monta a instrução do passo de estruturação a partir do relatório do Rui.

    Junta o relatório livre da investigação com os campos-chave do incidente,
    para o modelo produzir o `Diagnostico` sem inventar (Requirements 3.5, 3.7).
    """
    return (
        "Com base na investigação abaixo, produza o diagnóstico estruturado do "
        "incidente. Use apenas o que foi apurado; não invente arquivos, PRs nem "
        "números. Se a causa não ficou clara, use confiança 'baixa' e diga no "
        "proximo_passo o que ainda falta investigar.\n\n"
        f"Incidente: {incidente.get('titulo') or '(sem título)'} "
        f"(projeto {incidente.get('projeto') or 'desconhecido'}, "
        f"nível {incidente.get('nivel') or '-'}).\n\n"
        f"Investigação do Rui:\n{relatorio}"
    )


def estruturar(relatorio: str, incidente: dict) -> tuple[Diagnostico, int]:
    """Transforma o relatório livre do Rui num `Diagnostico` estruturado.

    Isolada para os testes a substituírem sem chamar a Anthropic. Usa
    `llm.estruturado` (que já pede `include_raw` e devolve `(objeto, tokens)`),
    então os tokens do passo de estruturação também são contabilizados
    (Requirement 4.3). Devolve `(Diagnostico, tokens)`.
    """
    mensagens = [
        SystemMessage(content=_prompt_vigia()),
        HumanMessage(content=_instrucao_estruturar(relatorio, incidente)),
    ]
    return llm.estruturado(llm.principal(), Diagnostico, mensagens)


# --- Limite por hora e aviso de fila (task 4.4, Requirement 4) ---

# Marcador do aviso de fila. Como `atividades` não tem um tipo próprio para
# "fila" (structure.md fixa os tipos válidos), usamos uma atividade `pensando`
# do agente `vigia` com este `detalhe` reconhecível. A janela de 60 min é
# consultada por `agente='vigia'` + `tipo='pensando'` + `detalhe` = este valor.
DETALHE_AVISO_FILA = "aviso_fila"

# Mensagem do Orquestrador no chat quando há incidentes na fila (Req. 4.2).
MSG_FILA = (
    "Há incidentes na fila aguardando diagnóstico (limite por hora atingido)."
)


def dentro_do_limite() -> bool:
    """Diz se ainda há orçamento de diagnósticos na janela móvel de 60 min.

    Requirement 4.1: conta os incidentes com `diagnostico_iniciado_em` na última
    hora (janela via `now() - interval '60 minutes'` no Postgres, para bater com
    o relógio do banco) e devolve True se esse total for MENOR que
    `config.max_diagnosticos_hora()` (padrão 5). Ou seja, com 5 diagnósticos já
    iniciados na hora, o 6º fica de fora (retorna False).
    """
    linha = db.um(
        """
        select count(*) as n
        from incidentes
        where diagnostico_iniciado_em > now() - interval '60 minutes'
        """
    )
    n = int(linha["n"]) if linha is not None else 0
    return n < config.max_diagnosticos_hora()


def _houve_aviso_fila_na_ultima_hora() -> bool:
    """Diz se já houve um aviso de fila do `vigia` na janela de 60 min.

    Consulta a tabela `atividades` pelo marcador do aviso (`agente='vigia'`,
    `tipo='pensando'`, `detalhe=DETALHE_AVISO_FILA`) com `criado_em` na última
    hora (janela via `now() - interval '60 minutes'`, relógio do Postgres).
    """
    linha = db.um(
        """
        select count(*) as n
        from atividades
        where agente = 'vigia'
          and tipo = 'pensando'
          and detalhe = %s
          and criado_em > now() - interval '60 minutes'
        """,
        (DETALHE_AVISO_FILA,),
    )
    return linha is not None and int(linha["n"]) > 0


def avisar_fila_uma_vez_por_hora() -> None:
    """Avisa no chat, no máximo uma vez por hora, que há incidentes na fila.

    Requirement 4.2: acima do limite, o incidente fica `aberto` sem diagnóstico
    e o chat recebe NO MÁXIMO um aviso por hora. Se já houver uma atividade de
    aviso de fila do `vigia` na última hora, não posta de novo (apenas retorna).
    Senão, posta a mensagem do Orquestrador no chat e registra a atividade
    marcadora (`pensando` do `vigia` com `detalhe=DETALHE_AVISO_FILA`), nessa
    ordem, para que o marcador reflita um aviso efetivamente enviado.
    """
    if _houve_aviso_fila_na_ultima_hora():
        return None

    try:
        db.salvar_mensagem(AUTOR_ORQ, MSG_FILA, None)
    except Exception:  # noqa: BLE001 — avisar não pode derrubar o fluxo
        logger.exception("Falha ao avisar no chat sobre incidentes na fila")
    emitir(None, "vigia", "pensando", DETALHE_AVISO_FILA)
    return None


def _glob_para_regex(padrao: str) -> re.Pattern[str]:
    """Traduz um glob de área proibida (com `**`) para uma regex previsível.

    `fnmatch` NÃO trata `**` como o glob recursivo do shell: nele `*` já casa
    qualquer caractere (inclusive `/`), então `**/prisma/**` exige literalmente
    um `/` antes de `prisma` e NÃO casa `prisma/schema.prisma`. Para os padrões
    do design (`**/prisma/**`, `**/*auth*/**`, `**/*auth*.*`, `**/*revenuecat*`…)
    precisamos que:

    - `**` case qualquer coisa, inclusive `/` e o vazio;
    - um `**/` no começo case também quando não há nenhum diretório antes (ou
      seja, `prisma/schema.prisma` deve casar `**/prisma/**`);
    - `/**` no fim case quando ainda há algo depois da barra;
    - `*` (simples) case qualquer coisa (mantemos permissivo: casar segmentos
      como `*auth*` no caminho inteiro).

    A escolha: converter o glob em regex tratando `**` como `.*`, `*` como `.*`
    e `?` como `.`, e tornar as barras vizinhas de `**` opcionais para que o
    `**/` inicial e o `/**` final também casem quando a barra não existe. O
    casamento é feito contra o caminho inteiro (`fullmatch`).
    """
    resultado: list[str] = []
    i = 0
    n = len(padrao)
    while i < n:
        c = padrao[i]
        if c == "*":
            # `**` (opcionalmente cercado de `/`) vira `.*` com as barras
            # vizinhas opcionais, para casar o `**/` inicial e o `/**` final
            # mesmo quando não há diretório antes/depois.
            if i + 1 < n and padrao[i + 1] == "*":
                i += 2
                barra_depois = ""
                if i < n and padrao[i] == "/":
                    barra_depois = "/?"
                    i += 1
                # Remove uma barra imediatamente anterior já emitida, tornando-a opcional.
                if resultado and resultado[-1] == re.escape("/"):
                    resultado[-1] = "/?"
                resultado.append(".*")
                if barra_depois:
                    resultado.append(barra_depois)
                continue
            # `*` simples: casa qualquer coisa (inclusive `/`), permissivo.
            resultado.append(".*")
            i += 1
            continue
        if c == "?":
            resultado.append(".")
            i += 1
            continue
        resultado.append(re.escape(c))
        i += 1
    return re.compile("".join(resultado) + r"\Z")


def _casa_area_proibida(caminho: str, padroes: tuple[str, ...]) -> Optional[str]:
    """Devolve o primeiro padrão de área proibida que casa `caminho`, ou None.

    Testa cada padrão traduzido por `_glob_para_regex` contra o caminho inteiro
    e também contra o basename (para padrões como `**/*auth*.*` pegarem tanto
    `src/auth/login.ts` quanto um culpado simples como `authService.validate`).
    """
    if not caminho:
        return None
    caminho = caminho.strip()
    base = caminho.rsplit("/", 1)[-1]
    for padrao in padroes:
        regex = _glob_para_regex(padrao)
        if regex.match(caminho) or regex.match(base):
            return padrao
    return None


def aplicar_areas_proibidas(diag: Diagnostico, incidente: dict) -> Diagnostico:
    """Força `corrigivel_automaticamente=False` em áreas protegidas por código.

    Requirement 3.6: a decisão de "corrigível automaticamente" NUNCA confia no
    modelo quando o incidente toca uma área sensível. Por código, se o `culpado`
    do incidente OU qualquer `arquivos_suspeitos[].caminho` do diagnóstico casar
    com um dos globs de `config.areas_proibidas()` (env lida aqui dentro), o
    diagnóstico é ajustado: `corrigivel_automaticamente=False` e
    `motivo="Toca em área protegida: <padrão>"` (o primeiro padrão que casou).

    Se nada casar, devolve o diagnóstico como está — respeitando o que o modelo
    decidiu (não força nada).

    Sobre `**`: `fnmatch` puro não trata `**` como o glob recursivo do shell, o
    que faria `**/prisma/**` NÃO casar `prisma/schema.prisma`. Por isso usamos o
    helper `_casa_area_proibida`/`_glob_para_regex`, que traduz o glob para
    regex tornando as barras vizinhas de `**` opcionais e testando também o
    basename. Assim `prisma/schema.prisma`, `apps/api/prisma/schema.prisma`,
    `src/auth/login.ts` e um culpado como `authService.validate` são todos
    pegos.
    """
    padroes = config.areas_proibidas()

    candidatos: list[str] = []
    culpado = incidente.get("culpado")
    if culpado:
        candidatos.append(culpado)
    for arquivo in diag.arquivos_suspeitos:
        if arquivo.caminho:
            candidatos.append(arquivo.caminho)

    for caminho in candidatos:
        padrao = _casa_area_proibida(caminho, padroes)
        if padrao is not None:
            return diag.model_copy(
                update={
                    "corrigivel_automaticamente": False,
                    "motivo": f"Toca em área protegida: {padrao}",
                }
            )

    return diag


# --- Persistência e resumo do diagnóstico ---


def marcar_inicio(incidente_id: int) -> None:
    """Marca o início do diagnóstico gravando `diagnostico_iniciado_em = now()`.

    Esse carimbo é o que a task 4.4 vai contar na janela de 60 min (Req. 4.1).
    """
    db.executar(
        "update incidentes set diagnostico_iniciado_em = now() where id = %s",
        (incidente_id,),
    )


def salvar(incidente_id: int, diag: Diagnostico) -> None:
    """Salva o diagnóstico e muda o status para `diagnosticado` (Req. 3.5, 3.8).

    Grava `diagnostico` como `jsonb` (via `psycopg.types.json.Json`) e carimba
    `diagnosticado_em = now()`.
    """
    db.executar(
        """
        update incidentes
           set diagnostico = %s,
               status = 'diagnosticado',
               diagnosticado_em = now()
         where id = %s
        """,
        (Json(diag.model_dump()), incidente_id),
    )


def _resumo_para_chat(incidente: dict, diag: Diagnostico) -> str:
    """Monta o resumo de 1–3 frases do Orquestrador para o chat (Req. 3.8).

    Inclui projeto, usuários afetados, causa provável e o ponteiro para a tela
    de Incidentes. Curto e direto, sem inventar nada além do diagnóstico.
    """
    projeto = incidente.get("projeto") or "desconhecido"
    afetados = incidente.get("usuarios_afetados") or 0
    titulo = incidente.get("titulo") or "(sem título)"
    return (
        f"Novo incidente diagnosticado no {projeto}: {titulo}. "
        f"{afetados} usuário(s) afetado(s). "
        f"Causa provável: {diag.causa_provavel} "
        f"(confiança {diag.confianca}). "
        "Detalhes em Incidentes."
    )


def postar_resumo_no_chat(incidente: dict, diag: Diagnostico, run_id: str | None) -> None:
    """Posta no chat o resumo do Orquestrador e emite a atividade de resposta.

    Só o Orquestrador escreve no chat (autor "Orquestrador", Req. 3.8). Emite
    uma atividade `resposta` do `vigia` com o texto, para aparecer no escritório
    e no log.
    """
    resumo = _resumo_para_chat(incidente, diag)
    db.salvar_mensagem(AUTOR_ORQ, resumo, run_id)
    emitir(run_id, "vigia", "resposta", resumo[:200])


# --- Tratamento de falha (Requirement 3.9) ---

# Aviso curto no chat quando o diagnóstico falha (sem stack trace ao usuário).
MSG_FALHA_DIAGNOSTICO = (
    "Tive um problema para diagnosticar um erro de produção. "
    "O incidente segue aberto em Incidentes."
)


def _tratar_falha(incidente_id: int, run_id: str | None) -> dict:
    """Lida com uma falha no diagnóstico (Requirement 3.9).

    O incidente NÃO muda de status (segue `aberto`); registra uma atividade
    `erro` do `vigia` e posta um aviso curto no chat. Nunca propaga a exceção:
    o traceback completo já foi logado por quem chamou. Salvar a mensagem, por
    sua vez, não pode derrubar o tratamento de erro.
    """
    emitir(run_id, "vigia", "erro", "Falha ao diagnosticar o incidente.")
    try:
        db.salvar_mensagem(AUTOR_ORQ, MSG_FALHA_DIAGNOSTICO, run_id)
    except Exception:  # noqa: BLE001 — não deixa o tratamento de erro derrubar o fluxo
        logger.exception(
            "Falha ao avisar no chat sobre diagnóstico com erro (incidente=%s)",
            incidente_id,
        )
    return {"status": "erro", "id": incidente_id}


# --- Fluxo principal do diagnóstico (task 4.2) ---


def diagnosticar(incidente_id: int) -> dict:
    """Diagnostica um incidente com o Rui, de ponta a ponta (Req. 3.1, 3.5–3.9).

    Fluxo (design.md, "Diagnóstico"):

    1. Se não houver orçamento na janela de 60 min (`dentro_do_limite`), avisa
       no chat no máximo uma vez por hora (`avisar_fila_uma_vez_por_hora`) e
       devolve `{"status": "fila"}` sem chamar o modelo (Requirement 4.1/4.2).
    2. Marca `diagnostico_iniciado_em` (conta no limite) e emite `inicio`.
    3. Carrega o incidente; se não tiver stack, tenta buscar o último evento no
       Sentry (best-effort) e atualiza o incidente com o stack, se vier.
    4. Roda o Rui (`rodar_com_ferramentas`, máx. 8 voltas — Req. 4.4).
    5. Estrutura o relatório em `Diagnostico` e registra os tokens numa
       atividade `pensando` do `vigia` (Req. 4.3).
    6. Aplica as áreas proibidas (costura da task 4.3, pass-through por ora).
    7. Salva (status `diagnosticado`) e posta o resumo do Orquestrador no chat.

    Qualquer exceção no miolo cai em `_tratar_falha`: o incidente segue `aberto`,
    uma atividade `erro` é registrada e o chat recebe um aviso curto — sem
    propagar a exceção (Requirement 3.9). Sempre devolve um dict com `status`.
    """
    run_id = f"inc-{incidente_id}"

    # 1. Limite por hora (Requirement 4.1/4.2).
    if not dentro_do_limite():
        avisar_fila_uma_vez_por_hora()
        return {"status": "fila", "id": incidente_id}

    # 2. Marca o início (conta no limite) — fora do try para o carimbo persistir
    #    mesmo se o miolo falhar; a falha não altera o status do incidente.
    try:
        marcar_inicio(incidente_id)
    except Exception:  # noqa: BLE001 — carimbo best-effort, não derruba o diagnóstico
        logger.exception("Falha ao marcar início do diagnóstico (incidente=%s)", incidente_id)

    try:
        incidente = db.um(
            """
            select id, sentry_issue_id, projeto, titulo, nivel, culpado, release,
                   ambiente, url, stack, ocorrencias, usuarios_afetados,
                   primeira_vez, ultima_vez, status
            from incidentes
            where id = %s
            """,
            (incidente_id,),
        )
        if incidente is None:
            # Nada a diagnosticar; trata como falha (aviso curto, sem exceção).
            logger.warning("Incidente %s não encontrado para diagnóstico.", incidente_id)
            return _tratar_falha(incidente_id, run_id)

        titulo = incidente.get("titulo") or "(sem título)"
        emitir(run_id, "vigia", "inicio", f"investigando: {titulo}")

        # 3. Busca best-effort do stack se o incidente não tiver (Req. 3.10).
        _garantir_stack(incidente)

        # 4. Loop do Rui (máx. 8 voltas — Requirement 4.4).
        instrucao = (
            "Investigue o incidente em diagnóstico. Comece por detalhe_incidente, "
            "olhe o stack, cruze com commits recentes e, se precisar ler o código, "
            "peça ao Tobias. Ao final, descreva a causa provável e os arquivos "
            "suspeitos. Se não tiver certeza, diga o que falta investigar."
        )
        relatorio = especialistas.rodar_com_ferramentas(
            "vigia",
            _prompt_vigia(),
            instrucao,
            ferramentas_do_rui(incidente_id, run_id),
            run_id,
            max_voltas=MAX_VOLTAS_RUI,
        )

        # 5. Estruturação + tokens (Requirements 3.5, 4.3).
        diag, tokens = estruturar(relatorio, incidente)
        emitir(run_id, "vigia", "pensando", "Diagnóstico estruturado.", tokens=tokens)

        # 6. Áreas proibidas (costura da task 4.3).
        diag = aplicar_areas_proibidas(diag, incidente)

        # 7. Persiste e avisa no chat (Requirements 3.5, 3.8).
        salvar(incidente_id, diag)
        postar_resumo_no_chat(incidente, diag, run_id)
        emitir(run_id, "vigia", "concluiu", f"Incidente #{incidente_id} diagnosticado.")

        return {
            "status": "diagnosticado",
            "id": incidente_id,
            "confianca": diag.confianca,
        }
    except Exception:  # noqa: BLE001 — falha no diagnóstico não propaga (Req. 3.9)
        logger.exception("Falha ao diagnosticar o incidente %s", incidente_id)
        return _tratar_falha(incidente_id, run_id)


def _garantir_stack(incidente: dict) -> None:
    """Busca o stack no Sentry (best-effort) se o incidente não tiver frames.

    O payload de `issue.created` costuma não trazer frames; se `SENTRY_AUTH_TOKEN`
    e `SENTRY_ORG` estiverem configurados, `github_leitura.ultimo_evento_stack`
    busca o último evento e aplica a mesma whitelist. Se vier stack, atualiza o
    incidente (banco e o dict em memória). Nunca derruba o diagnóstico: sem
    stack, o Rui segue com o que houver, com confiança baixa (Requirement 3.10).
    """
    stack = incidente.get("stack")
    if isinstance(stack, list) and stack:
        return

    try:
        frames = github_leitura.ultimo_evento_stack(incidente.get("sentry_issue_id"))
    except Exception:  # noqa: BLE001 — busca best-effort
        logger.exception("Falha ao buscar stack do incidente %s", incidente.get("id"))
        return

    if not frames:
        return

    incidente["stack"] = frames
    try:
        db.executar(
            "update incidentes set stack = %s where id = %s",
            (Json(frames), incidente.get("id")),
        )
    except Exception:  # noqa: BLE001 — atualização best-effort
        logger.exception("Falha ao gravar stack do incidente %s", incidente.get("id"))


# --- Rota `vigia` do chat (task 5, Requirements 5.1–5.3) ---


def ferramentas_de_leitura_do_rui(run_id: str | None) -> list:
    """Ferramentas do Rui na rota do chat: só `incidentes_abertos` e `detalhe_incidente`.

    Diferente de `ferramentas_do_rui` (usada no diagnóstico), aqui o Rui NÃO
    recebe `pedir_ao_tobias`, `buscar_changelog`, `mudancas_recentes` nem
    `commits_recentes`: ele apenas LÊ os incidentes já registrados (Requirement
    5.2), sem iniciar diagnóstico. Como não há um incidente em foco, o
    `detalhe_incidente` aqui recebe o id por argumento (o Rui escolhe qual olhar
    a partir da lista de `incidentes_abertos`).
    """

    @tool
    def incidentes_abertos() -> str:
        """Lista os incidentes abertos ou já diagnosticados.

        Use primeiro, para ver o que está quebrado. Se não houver nenhum,
        a resposta diz isso.
        """
        return _incidentes_abertos()

    @tool
    def detalhe_incidente(incidente_id: int) -> str:
        """Mostra os detalhes de um incidente específico pelo id.

        Traz título, projeto, nível, culpado, release, ambiente, URL no Sentry,
        contagens, o stack (frames filtrados) e o diagnóstico se já existir.
        """
        return _detalhe_incidente(incidente_id)

    return [incidentes_abertos, detalhe_incidente]


def responder_sobre_incidentes(instrucao: str, run_id: str | None) -> str:
    """Rota `vigia` do chat: o Rui responde a partir dos incidentes registrados.

    Requirements 5.2 e 5.3: roda o Rui pelo loop próprio `rodar_com_ferramentas`
    com APENAS as ferramentas de leitura (`incidentes_abertos`,
    `detalhe_incidente`), sem iniciar diagnóstico nem delegar ao Tobias. Se não
    houver incidentes abertos, o próprio prompt + a ferramenta garantem uma
    resposta clara. Devolve o texto do relatório do Rui para o Orquestrador.
    """
    return especialistas.rodar_com_ferramentas(
        "vigia",
        _prompt_vigia_chat(),
        instrucao,
        ferramentas_de_leitura_do_rui(run_id),
        run_id,
        max_voltas=MAX_VOLTAS_RUI,
    )
