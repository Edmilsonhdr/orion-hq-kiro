"""Cadastro de agentes (tela Agentes): leitura, validação e escrita na tabela `agentes`.

- Os agentes **nativos** (`sistema = true`: orq, tech, agenda, negocios, vigia, work) têm código próprio.
  Neles só se edita nome, cor, sala, descrição (como o Orquestrador roteia), instruções adicionais
  (somadas ao prompt do sistema, só em tech/agenda/negocios), posição e ativo.
- Os **criados na tela** rodam pelo especialista genérico (`especialistas.dinamico`) com instruções
  próprias, o modelo escolhido e as ferramentas do `CATALOGO`.

Guardas (product.md, "Sem loops" e "Especialistas propõem, humanos aprovam"):
- o catálogo é uma lista fechada, definida aqui: o usuário escolhe, não escreve ferramentas;
- toda ferramenta com efeito externo é uma `propor_*`, que só cria uma aprovação pendente; por isso
  `exige_aprovacao` é sempre verdadeiro quando há ferramenta com efeito (o servidor força);
- há um teto de agentes criados ativos e as voltas do especialista genérico são limitadas.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional

from pydantic import BaseModel, Field

from . import db, ferramentas, llm

NATIVOS: tuple[str, ...] = ("orq", "tech", "agenda", "negocios", "work", "vigia")
# Nativos para os quais o Orquestrador pode delegar (têm nó próprio no grafo).
ROTEAVEIS_NATIVOS: tuple[str, ...] = ("tech", "agenda", "negocios", "vigia")
# Nativos cujo prompt aceita instruções adicionais.
ACEITAM_INSTRUCOES: tuple[str, ...] = ("tech", "agenda", "negocios")
# Nativos que não podem ser pausados.
FIXOS: tuple[str, ...] = ("orq", "work")

MAX_DINAMICOS_ATIVOS = 10
MAX_VOLTAS_DINAMICO = 4
MODELOS: tuple[str, ...] = ("sonnet", "haiku")
SALAS: tuple[str, ...] = (
    "Sala do Chefe", "Engenharia", "Agenda", "Negócios", "Baia dos Workers", "Guarita", "Copa",
)

# Catálogo fechado: id -> rótulo, se tem efeito externo (só `propor_*`) e as tools do LangChain.
CATALOGO: dict[str, dict[str, Any]] = {
    "buscar_docs": {
        "rotulo": "Buscar nos Docs",
        "efeito": False,
        "tools": (ferramentas.buscar_documentos, ferramentas.ler_documento),
    },
    "ler_changelog": {
        "rotulo": "Ler o changelog",
        "efeito": False,
        "tools": (ferramentas.buscar_changelog, ferramentas.mudancas_recentes),
    },
    "consultar_comercial": {
        "rotulo": "Consultar o Comercial",
        "efeito": False,
        "tools": (
            ferramentas.resumo_funil,
            ferramentas.buscar_negocios,
            ferramentas.ver_negocio,
            ferramentas.negocios_parados,
            ferramentas.agenda_comercial,
        ),
    },
    "ler_agenda": {
        "rotulo": "Ler a agenda",
        "efeito": False,
        "tools": (ferramentas.proximas_reunioes,),
    },
    "propor_doc": {
        "rotulo": "Propor criar/editar documento",
        "efeito": True,
        "tools": (ferramentas.propor_documento, ferramentas.propor_edicao_documento),
    },
    "propor_negocio": {
        "rotulo": "Propor alteração no CRM",
        "efeito": True,
        "tools": (
            ferramentas.propor_novo_negocio,
            ferramentas.propor_atualizacao_negocio,
            ferramentas.propor_interacao,
        ),
    },
}

_COR = re.compile(r"^#[0-9a-fA-F]{6}$")

_CAMPOS = (
    "id, nome, papel, cor, sala, modelo, descricao, instrucoes, ferramentas, exige_aprovacao, "
    "ativo, sistema, pos_x, pos_y, criado_por, criado_em, atualizado_em"
)


class ErroAgente(ValueError):
    """Dado inválido do cadastro (vira 422 na rota)."""


class AgenteNaoEncontrado(LookupError):
    """Agente inexistente (vira 404 na rota)."""


# --- Leitura ---


def catalogo() -> list[dict]:
    """Catálogo para a tela: id, rótulo e se a ferramenta tem efeito externo."""
    return [
        {"id": cid, "rotulo": c["rotulo"], "efeito": c["efeito"]} for cid, c in CATALOGO.items()
    ]


def listar() -> list[dict]:
    return db.consultar(f"select {_CAMPOS} from agentes order by sistema desc, criado_em, id")


def obter(agente_id: str) -> Optional[dict]:
    return db.um(f"select {_CAMPOS} from agentes where id = %s", (agente_id,))


def roteaveis() -> list[dict]:
    """Agentes ativos para os quais o Orquestrador pode delegar (id + descrição).

    Se a tabela estiver vazia ou inacessível, cai nos nativos com a descrição padrão, para o
    roteamento nunca depender do cadastro estar de pé.
    """
    try:
        linhas = db.consultar(
            "select id, descricao, sistema from agentes where ativo and id <> all(%s) order by sistema desc, criado_em, id",
            (["orq", "work"],),
        )
    except Exception:  # noqa: BLE001 — o roteamento segue com o padrão
        linhas = []
    escolhidos = [
        l for l in linhas if (not l["sistema"]) or l["id"] in ROTEAVEIS_NATIVOS
    ]
    return escolhidos or [{"id": i, "descricao": _DESCRICAO_PADRAO[i], "sistema": True} for i in ROTEAVEIS_NATIVOS]


_DESCRICAO_PADRAO = {
    "tech": "produto/código/PRs do app Orion e documentação técnica",
    "agenda": "reuniões e pautas",
    "negocios": "custos, métricas, decisões, documentos de negócio e o COMERCIAL (leads, funil, propostas, clientes)",
    "vigia": "erros, falhas, instabilidade e incidentes do app ou do backend",
}


def instrucoes_extras(agente_id: str) -> str:
    """Instruções adicionais de um nativo (somadas ao prompt do sistema). Vazio se não houver."""
    if agente_id not in ACEITAM_INSTRUCOES:
        return ""
    try:
        linha = db.um("select instrucoes from agentes where id = %s and ativo", (agente_id,))
    except Exception:  # noqa: BLE001
        return ""
    texto = ((linha or {}).get("instrucoes") or "").strip()
    return f"\n\nInstruções adicionais dos sócios:\n{texto}" if texto else ""


def ferramentas_do(cfg: dict) -> list[Any]:
    """Tools do LangChain das ferramentas marcadas (ignora ids fora do catálogo)."""
    tools: list[Any] = []
    for fid in cfg.get("ferramentas") or []:
        item = CATALOGO.get(fid)
        if item:
            tools.extend(item["tools"])
    return tools


# --- Escrita ---


def _slug(nome: str) -> str:
    base = unicodedata.normalize("NFD", nome).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")[:24]
    return base or "agente"


def _id_livre(nome: str) -> str:
    base = _slug(nome)
    candidato, n = base, 2
    while candidato in NATIVOS or obter(candidato):
        candidato = f"{base[:20]}_{n}"
        n += 1
    return candidato


def _texto(dados: dict, campo: str, maximo: int, obrigatorio: bool = False) -> Optional[str]:
    if campo not in dados:
        return None
    valor = str(dados[campo] or "").strip()
    if obrigatorio and not valor:
        raise ErroAgente(f"O campo {campo} não pode ficar vazio.")
    if len(valor) > maximo:
        raise ErroAgente(f"O campo {campo} passa de {maximo} caracteres.")
    return valor


def _validar(dados: dict, *, nativo: bool) -> dict:
    """Valida e normaliza os campos recebidos. Só devolve as chaves presentes e permitidas."""
    saida: dict[str, Any] = {}
    for campo, maximo, obrig in (
        ("nome", 40, True), ("papel", 60, True), ("descricao", 400, False), ("instrucoes", 8000, False),
    ):
        valor = _texto(dados, campo, maximo, obrig)
        if valor is not None:
            saida[campo] = valor
    if "cor" in dados:
        if not _COR.match(str(dados["cor"] or "")):
            raise ErroAgente("A cor deve estar no formato #RRGGBB.")
        saida["cor"] = str(dados["cor"])
    if "sala" in dados:
        if dados["sala"] not in SALAS:
            raise ErroAgente("Sala desconhecida.")
        saida["sala"] = dados["sala"]
    for campo in ("pos_x", "pos_y"):
        if campo in dados and dados[campo] is not None:
            try:
                saida[campo] = max(0, min(int(dados[campo]), 4000))
            except (TypeError, ValueError) as exc:
                raise ErroAgente("Posição inválida.") from exc
    if "ativo" in dados:
        saida["ativo"] = bool(dados["ativo"])
    if not nativo:
        if "modelo" in dados:
            if dados["modelo"] not in MODELOS:
                raise ErroAgente("Modelo deve ser sonnet ou haiku.")
            saida["modelo"] = dados["modelo"]
        if "ferramentas" in dados:
            lista = list(dict.fromkeys(dados["ferramentas"] or []))
            desconhecidas = [f for f in lista if f not in CATALOGO]
            if desconhecidas:
                raise ErroAgente(f"Ferramenta fora do catálogo: {', '.join(desconhecidas)}.")
            saida["ferramentas"] = lista
        if "exige_aprovacao" in dados:
            saida["exige_aprovacao"] = bool(dados["exige_aprovacao"])
    return saida


def _forcar_aprovacao(cfg: dict) -> None:
    """Com ferramenta de efeito externo, a aprovação é obrigatória (decisão do servidor)."""
    if any(CATALOGO[f]["efeito"] for f in cfg.get("ferramentas") or [] if f in CATALOGO):
        cfg["exige_aprovacao"] = True


def _contar_dinamicos_ativos(excluir: Optional[str] = None) -> int:
    linha = db.um(
        "select count(*) as n from agentes where not sistema and ativo and id <> coalesce(%s, '')",
        (excluir,),
    )
    return int((linha or {}).get("n", 0))


def criar(dados: dict, usuario: str) -> dict:
    cfg = _validar(dados, nativo=False)
    for obrigatorio in ("nome", "papel"):
        if not cfg.get(obrigatorio):
            raise ErroAgente(f"O campo {obrigatorio} é obrigatório.")
    if not cfg.get("instrucoes"):
        raise ErroAgente("Escreva as instruções do agente.")
    if not cfg.get("descricao"):
        raise ErroAgente("Diga em uma frase quando o Orquestrador deve chamar este agente (descrição).")
    cfg.setdefault("ativo", True)
    if cfg["ativo"] and _contar_dinamicos_ativos() >= MAX_DINAMICOS_ATIVOS:
        raise ErroAgente(f"Limite de {MAX_DINAMICOS_ATIVOS} agentes ativos criados na tela.")
    cfg.setdefault("ferramentas", [])
    cfg.setdefault("exige_aprovacao", True)
    cfg.setdefault("modelo", "sonnet")
    cfg.setdefault("cor", "#E5C07B")
    cfg.setdefault("sala", "Copa")
    _forcar_aprovacao(cfg)
    agente_id = _id_livre(cfg["nome"])
    colunas = ["id", *cfg.keys(), "criado_por"]
    valores = [agente_id, *cfg.values(), usuario]
    linha = db.um(
        f"insert into agentes ({', '.join(colunas)}) values ({', '.join(['%s'] * len(colunas))}) "
        f"returning {_CAMPOS}",
        tuple(valores),
    )
    assert linha is not None
    return linha


def atualizar(agente_id: str, dados: dict) -> dict:
    atual = obter(agente_id)
    if atual is None:
        raise AgenteNaoEncontrado(agente_id)
    nativo = bool(atual["sistema"])
    cfg = _validar(dados, nativo=nativo)
    if nativo:
        if "instrucoes" in cfg and agente_id not in ACEITAM_INSTRUCOES:
            raise ErroAgente("Este agente não aceita instruções adicionais.")
        if cfg.get("ativo") is False and agente_id in FIXOS:
            raise ErroAgente("Este agente não pode ser pausado.")
    else:
        junto = {**atual, **cfg}
        if cfg.get("ativo") and not atual["ativo"] and _contar_dinamicos_ativos(agente_id) >= MAX_DINAMICOS_ATIVOS:
            raise ErroAgente(f"Limite de {MAX_DINAMICOS_ATIVOS} agentes ativos criados na tela.")
        _forcar_aprovacao(junto)
        if "exige_aprovacao" in cfg or junto["exige_aprovacao"] != atual["exige_aprovacao"]:
            cfg["exige_aprovacao"] = junto["exige_aprovacao"]
        for obrig in ("instrucoes", "descricao"):
            if obrig in cfg and not cfg[obrig]:
                raise ErroAgente(f"O campo {obrig} não pode ficar vazio.")
    if not cfg:
        return atual
    atribuicoes = ", ".join(f"{c} = %s" for c in cfg) + ", atualizado_em = now()"
    linha = db.um(
        f"update agentes set {atribuicoes} where id = %s returning {_CAMPOS}",
        (*cfg.values(), agente_id),
    )
    assert linha is not None
    return linha


def remover(agente_id: str) -> None:
    atual = obter(agente_id)
    if atual is None:
        raise AgenteNaoEncontrado(agente_id)
    if atual["sistema"]:
        raise ErroAgente("Agentes nativos não podem ser removidos; pause-os.")
    db.executar("delete from agentes where id = %s", (agente_id,))


# --- Rascunho a partir de uma descrição (Claude preenche o formulário; os sócios revisam) ---


class RascunhoAgente(BaseModel):
    nome: str = Field(description="Primeiro nome curto e humano para o agente (ex.: Lúcio).")
    papel: str = Field(description="Função em poucas palavras (ex.: Pesquisa de mercado).")
    descricao: str = Field(
        description="Uma frase dizendo quando o Orquestrador deve chamar este agente (roteamento)."
    )
    instrucoes: str = Field(
        description="Instruções em português: quem é, o que faz, como responde e o que nunca deve fazer."
    )
    ferramentas: list[str] = Field(
        description="Ids do catálogo que ele precisa, só o necessário: " + ", ".join(CATALOGO)
    )
    modelo: str = Field(description="'sonnet' para raciocínio mais difícil; 'haiku' para tarefas simples.")


def rascunho(descricao: str) -> dict:
    """Pede ao modelo um rascunho de agente a partir da descrição e o sanitiza (catálogo fechado)."""
    from langchain_core.messages import HumanMessage, SystemMessage

    sistema = (
        "Você ajuda os sócios do Orion HQ a criar um agente de IA a partir de uma descrição. "
        "Devolva o rascunho do formulário. Use apenas ferramentas do catálogo e o mínimo necessário. "
        "O agente nunca altera nada sozinho: só propõe e um sócio aprova. "
        "Catálogo: " + "; ".join(f"{i} = {c['rotulo']}" for i, c in CATALOGO.items())
    )
    obj, _tokens = llm.estruturado(
        llm.principal(), RascunhoAgente,
        [SystemMessage(content=sistema), HumanMessage(content=descricao)],
    )
    dados = obj.model_dump()
    dados["ferramentas"] = [f for f in dict.fromkeys(dados["ferramentas"]) if f in CATALOGO]
    if dados["modelo"] not in MODELOS:
        dados["modelo"] = "sonnet"
    return dados
