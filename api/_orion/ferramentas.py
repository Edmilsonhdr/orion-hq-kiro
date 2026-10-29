"""Ferramentas (tools) dos especialistas.

Regra de produto (product.md, "Nada inventado"): os especialistas consultam o
histórico antes de responder e citam a fonte (PR ou nota + data). Estas tools
dão ao Tech e ao Negócios acesso ao changelog do projeto.

As tools são decoradas com `@tool` do `langchain_core.tools`, para serem
compatíveis com `bind_tools` no loop de ferramentas dos especialistas
(especialistas.py). A lógica de cada uma fica isolada numa função privada
(`_buscar_changelog`, `_mudancas_recentes`, `_registrar_decisao`) para que os
testes possam exercitá-la sem passar pela camada do LangChain.

Convenções (tech.md): código tipado, funções pequenas, reuso dos helpers de
`db.py` (`consultar`/`um`), Postgres via psycopg 3 com conexão curta. Domínio
em português.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

from langchain_core.tools import tool

from . import config, db, documentos, propostas_docs

# (agente, run_id) do especialista em execução. As tools do LangChain não conhecem o run, então o loop
# de `especialistas.rodar_com_ferramentas` publica aqui (usado pelas propostas de documento).
contexto: ContextVar[tuple[str, Optional[str]]] = ContextVar(
    "ferramentas_contexto", default=("agente", None)
)

# Quantos itens do changelog devolver por consulta (evita respostas enormes).
_LIMITE_BUSCA = 8
_LIMITE_RECENTES = 20
# Quanto de um documento devolver ao modelo (spec docs, Requirement 6.3).
_LIMITE_DOCUMENTO = 20_000


def _formatar_item(item: dict) -> str:
    """Formata um item do changelog citando fonte e data.

    Regra "Nada inventado": cada item precisa citar PR/nota e data. Monta uma
    linha legível para o modelo, com a referência (ex.: "PR #12") ou a fonte
    (ex.: "nota") quando não houver referência, e a data em formato PT-BR.
    """
    momento = item.get("criado_em")
    if momento is not None:
        # criado_em é timestamptz; converte para o fuso do projeto e formata.
        try:
            local = momento.astimezone(config.TZ)
            data = f"{local.day:02d}/{local.month:02d}/{local.year}"
        except (AttributeError, ValueError, TypeError):
            data = str(momento)
    else:
        data = "data desconhecida"

    referencia = item.get("referencia") or item.get("fonte") or "fonte desconhecida"
    titulo = item.get("titulo") or "(sem título)"
    resumo = item.get("resumo") or ""

    linha = f"[{referencia} · {data}] {titulo}"
    if resumo:
        linha += f"\n{resumo}"
    url = item.get("url")
    if url:
        linha += f"\n{url}"
    return linha


def _formatar_lista(itens: list[dict]) -> str:
    """Junta vários itens do changelog num texto para o modelo."""
    return "\n\n".join(_formatar_item(item) for item in itens)


def _buscar_full_text(consulta: str) -> list[dict]:
    """Full-text search em português na coluna `busca` (tsvector).

    Usa `plainto_tsquery('portuguese', ...)`, que trata a consulta como texto
    livre (sem exigir sintaxe de operadores). Ordena pela relevância
    (`ts_rank`) e, em empate, pelo mais recente.
    """
    return db.consultar(
        """
        select id, fonte, referencia, titulo, resumo, url, autor, criado_em
        from changelog
        where busca @@ plainto_tsquery('portuguese', %s)
        order by ts_rank(busca, plainto_tsquery('portuguese', %s)) desc,
                 criado_em desc
        limit %s
        """,
        (consulta, consulta, _LIMITE_BUSCA),
    )


def _buscar_ilike(consulta: str) -> list[dict]:
    """Fallback com `ILIKE` em título e resumo.

    Usado quando o full-text não devolve nada (ex.: termo sem stemming útil,
    nome próprio, sigla). Casa por substring, sem acento-sensibilidade além do
    que o ILIKE já oferece.
    """
    padrao = f"%{consulta}%"
    return db.consultar(
        """
        select id, fonte, referencia, titulo, resumo, url, autor, criado_em
        from changelog
        where titulo ilike %s or resumo ilike %s
        order by criado_em desc
        limit %s
        """,
        (padrao, padrao, _LIMITE_BUSCA),
    )


def _buscar_changelog(consulta: str) -> str:
    """Busca no changelog: full-text em português com fallback ILIKE.

    Tenta primeiro o full-text (`tsvector`/`plainto_tsquery`, config
    portuguese). Se não achar nada, cai para `ILIKE`. Se ainda assim não achar,
    diz explicitamente que não encontrou (Requirement 4.3 / product.md).

    Devolve um texto com os itens (cada um citando fonte/PR e data) pronto para
    o modelo usar na resposta.
    """
    consulta = (consulta or "").strip()
    if not consulta:
        return "Consulta vazia: informe um termo para buscar no changelog."

    itens = _buscar_full_text(consulta)
    if not itens:
        itens = _buscar_ilike(consulta)

    if not itens:
        return f'Nada encontrado no changelog para "{consulta}".'

    return _formatar_lista(itens)


def _mudancas_recentes(dias: int) -> str:
    """Mudanças do changelog nos últimos N dias.

    Filtra por `criado_em` dentro da janela e ordena do mais recente para o
    mais antigo. Se não houver mudanças no período, diz isso explicitamente.
    """
    try:
        dias = int(dias)
    except (TypeError, ValueError):
        dias = 7
    if dias <= 0:
        dias = 7

    itens = db.consultar(
        """
        select id, fonte, referencia, titulo, resumo, url, autor, criado_em
        from changelog
        where criado_em >= now() - make_interval(days => %s)
        order by criado_em desc
        limit %s
        """,
        (dias, _LIMITE_RECENTES),
    )

    if not itens:
        return f"Nenhuma mudança no changelog nos últimos {dias} dias."

    return _formatar_lista(itens)


def _registrar_decisao(titulo: str, descricao: str) -> str:
    """Registra uma decisão de negócio no changelog.

    Grava como fonte `decisao` (sem referência de PR), com o título e a
    descrição informados. Devolve uma confirmação citando a data do registro,
    para que o especialista possa reportar de volta.
    """
    titulo = (titulo or "").strip()
    descricao = (descricao or "").strip()
    if not titulo:
        return "Não registrei: a decisão precisa de um título."

    linha = db.um(
        """
        insert into changelog (fonte, referencia, titulo, resumo, autor)
        values ('decisao', null, %s, %s, null)
        returning id, criado_em
        """,
        (titulo, descricao),
    )
    assert linha is not None  # INSERT ... RETURNING sempre devolve uma linha

    momento = linha["criado_em"]
    try:
        local = momento.astimezone(config.TZ)
        data = f"{local.day:02d}/{local.month:02d}/{local.year}"
    except (AttributeError, ValueError, TypeError):
        data = str(momento)

    return f'Decisão registrada no histórico do projeto (decisao · {data}): "{titulo}".'


def _data_ptbr(momento) -> str:
    """Data dd/mm/aaaa no fuso do projeto (mesma regra de `_formatar_item`)."""
    try:
        local = momento.astimezone(config.TZ)
        return f"{local.day:02d}/{local.month:02d}/{local.year}"
    except (AttributeError, ValueError, TypeError):
        return "data desconhecida"


def _formatar_documento(item: dict) -> str:
    """Resultado de busca de documento citando id, pasta e data de atualização."""
    pasta = item.get("pasta")
    cabecalho = f"documento #{item['id']}" + (f" · {pasta}" if pasta else "")
    linha = f"[{cabecalho} · {_data_ptbr(item.get('atualizado_em'))}] {item['titulo']}"
    trecho = (item.get("trecho") or "").strip()
    if trecho:
        linha += f"\n{trecho}"
    return linha


def _buscar_documentos(consulta: str) -> str:
    """Busca nos documentos dos sócios (Docs): full-text em português com fallback ILIKE."""
    consulta = (consulta or "").strip()
    if not consulta:
        return "Consulta vazia: informe um termo para buscar nos documentos."

    itens = documentos.buscar(consulta)
    if not itens:
        return f'Nada encontrado nos documentos para "{consulta}".'
    return "\n\n".join(_formatar_documento(item) for item in itens)


def _ler_documento(documento_id: int) -> str:
    """Conteúdo de um documento, truncado em `_LIMITE_DOCUMENTO` caracteres."""
    try:
        documento_id = int(documento_id)
    except (TypeError, ValueError):
        return "Informe o número (id) do documento, como aparece na busca."

    documento = documentos.obter(documento_id)
    if documento is None:
        return f"Não existe documento com o id {documento_id}."
    if documento["arquivado"]:
        return (
            f'O documento #{documento_id} ("{documento["titulo"]}") está arquivado '
            "e não pode ser usado."
        )

    texto = documento["conteudo"]
    aviso = ""
    if len(texto) > _LIMITE_DOCUMENTO:
        texto = texto[:_LIMITE_DOCUMENTO]
        aviso = f"\n\n[Conteúdo truncado: mostrando os primeiros {_LIMITE_DOCUMENTO} caracteres.]"
    return f"{_formatar_documento(documento)}\n\n{texto}{aviso}"


# --- Tools expostas aos especialistas (compatíveis com bind_tools) ---


@tool
def buscar_changelog(consulta: str) -> str:
    """Busca no histórico do projeto (changelog) por um termo.

    Use para responder o que mudou/foi decidido no Orion. Faz busca em
    português e cita a fonte (PR ou nota) e a data de cada item. Se não achar
    nada, diz que não encontrou. Nunca invente: use só o que voltar daqui.
    """
    return _buscar_changelog(consulta)


@tool
def mudancas_recentes(dias: int = 7) -> str:
    """Lista as mudanças do projeto nos últimos N dias (padrão 7).

    Útil para montar um panorama recente ou a pauta de uma reunião. Cita fonte
    e data de cada item; diz explicitamente se não houve mudanças no período.
    """
    return _mudancas_recentes(dias)


@tool
def registrar_decisao(titulo: str, descricao: str) -> str:
    """Registra uma decisão de negócio no histórico do projeto.

    Use quando os sócios combinarem algo que deva ficar registrado (ex.: preço,
    prioridade, estratégia). Informe um título curto e uma descrição do que foi
    decidido.
    """
    return _registrar_decisao(titulo, descricao)


@tool
def buscar_documentos(consulta: str) -> str:
    """Busca nos documentos escritos pelos sócios (Docs) por um termo.

    Use para responder perguntas sobre o que os sócios documentaram: planos,
    decisões, processos, anotações. Cita o id, a pasta e a data de cada
    documento. Se não achar nada, diz que não encontrou. Para ver o texto
    completo de um resultado, use `ler_documento` com o id.
    """
    return _buscar_documentos(consulta)


@tool
def ler_documento(documento_id: int) -> str:
    """Lê o conteúdo de um documento (Docs) pelo id, como aparece na busca.

    Devolve o texto em markdown, com título, pasta e data. Nunca invente o que
    não estiver no texto retornado.
    """
    return _ler_documento(documento_id)


@tool
def propor_documento(
    titulo: str, conteudo: str, pasta: str = "", tags: Optional[list[str]] = None
) -> str:
    """PROPÕE criar um documento novo em Docs (não grava nada até um sócio aprovar).

    Use quando os sócios pedirem para registrar/escrever algo em Docs (ata, plano, anotação). Escreva o
    `conteudo` completo em markdown. Informe `pasta` e `tags` se fizer sentido. Depois de chamar, diga
    que PROPÔS e que depende de aprovação; nunca diga que já criou.
    """
    agente, run_id = contexto.get()
    return propostas_docs.propor_criacao(agente, run_id, titulo, conteudo, pasta or None, tags)


@tool
def propor_edicao_documento(
    documento_id: int,
    titulo: Optional[str] = None,
    conteudo: Optional[str] = None,
    pasta: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> str:
    """PROPÕE editar um documento existente (não grava nada até um sócio aprovar).

    Primeiro leia o documento com `ler_documento`. Informe só o que muda; `conteudo` é o texto COMPLETO
    novo (substitui o atual). Para limpar a pasta, mande string vazia. Depois de chamar, diga que PROPÔS
    e que depende de aprovação; nunca diga que já alterou.
    """
    agente, run_id = contexto.get()
    return propostas_docs.propor_edicao(
        agente, run_id, documento_id, titulo, conteudo, pasta, tags
    )


# Conjuntos de ferramentas por especialista (usados em especialistas.py).
# Tech: consulta o changelog (Requirement 4.1).
FERRAMENTAS_TECH: tuple = (
    buscar_changelog,
    mudancas_recentes,
    buscar_documentos,
    ler_documento,
    propor_documento,
    propor_edicao_documento,
)
# Negócios: consulta e registra decisões (Requirement 7.1).
FERRAMENTAS_NEGOCIOS: tuple = (
    buscar_changelog,
    mudancas_recentes,
    registrar_decisao,
    buscar_documentos,
    ler_documento,
    propor_documento,
    propor_edicao_documento,
)
