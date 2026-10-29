"""Propostas de documentos feitas pelos agentes (spec `.kiro/specs/docs-escrita`).

Os agentes NUNCA gravam em `documentos`: `propor_*` só registra uma aprovação `pendente` (tipos
`criar_documento` / `editar_documento`). Quando um sócio aprovador decide, `execucao` chama `aplicar`.
Essas aprovações são independentes do grafo do LangGraph (o run de origem já terminou), então decidir
uma delas não retoma nenhum run.

Convenções (tech.md): reuso de `db`/`documentos`, conexão curta, `atividades.emitir()` que nunca lança,
domínio em português. Mensagens devolvidas ao agente são texto (erro vira texto, não exceção).
"""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import Any, Optional

from psycopg.types.json import Json

from . import db, documentos
from .atividades import emitir

TIPO_CRIAR = "criar_documento"
TIPO_EDITAR = "editar_documento"
TIPOS = (TIPO_CRIAR, TIPO_EDITAR)

# Quantas propostas de documento um mesmo run pode gerar.
LIMITE_POR_RUN = 3

_AVISO = (
    "Isto é só uma PROPOSTA: nada foi gravado. Um sócio precisa aprovar na tela de Aprovações. "
    "Não diga que o documento foi criado ou alterado."
)


def _propostas_do_run(run_id: str) -> int:
    linha = db.um(
        "select count(*) as n from aprovacoes where run_id = %s and tipo = any(%s)",
        (run_id, list(TIPOS)),
    )
    return int(linha["n"]) if linha else 0


def _registrar(
    agente: str, run_id: Optional[str], tipo: str, proposta: dict, descricao: str
) -> str:
    """Insere a aprovação pendente e emite a atividade; devolve a resposta para o agente."""
    if not run_id:
        return "Não consegui registrar a proposta: não há um pedido em andamento."
    if _propostas_do_run(run_id) >= LIMITE_POR_RUN:
        return (
            f"Limite de {LIMITE_POR_RUN} propostas de documento por pedido atingido. "
            "Avise os sócios e peça um novo pedido para o restante."
        )

    nova = db.um(
        """
        insert into aprovacoes (run_id, chave, tipo, proposta, pedido_por)
        values (%s, %s, %s, %s, %s)
        returning id
        """,
        (run_id, f"{run_id}:doc:{secrets.token_hex(4)}", tipo, Json(proposta), agente),
    )
    assert nova is not None
    # Só título e ids no log: o conteúdo do documento não vai para as atividades.
    emitir(
        run_id,
        agente,
        "aguardando_aprovacao",
        f"Aguardando aprovação: {descricao}.",
        dados={"aprovacao_id": nova["id"]},
    )
    return f"Proposta registrada (aprovação #{nova['id']}): {descricao}. {_AVISO}"


def propor_criacao(
    agente: str,
    run_id: Optional[str],
    titulo: str,
    conteudo: str = "",
    pasta: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> str:
    """Propõe criar um documento (não grava)."""
    try:
        dados = documentos.validar_campos(
            {"titulo": titulo, "conteudo": conteudo, "pasta": pasta, "tags": tags or []}
        )
    except ValueError as erro:
        return f"Proposta recusada: {erro}"

    proposta = {"acao": "criar", **dados}
    return _registrar(
        agente, run_id, TIPO_CRIAR, proposta, f'criar o documento "{dados["titulo"]}"'
    )


def propor_edicao(
    agente: str,
    run_id: Optional[str],
    documento_id: int,
    titulo: Optional[str] = None,
    conteudo: Optional[str] = None,
    pasta: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> str:
    """Propõe editar um documento existente (não grava).

    Só os campos informados (não `None`) entram na proposta. Para limpar a pasta, mande string vazia.
    `conteudo` é o texto COMPLETO novo (substitui o atual).
    """
    try:
        documento_id = int(documento_id)
    except (TypeError, ValueError):
        return "Proposta recusada: informe o número (id) do documento, como aparece na busca."

    atual = documentos.obter(documento_id)
    if atual is None:
        return f"Proposta recusada: não existe documento com o id {documento_id}."
    if atual["arquivado"]:
        return f'Proposta recusada: o documento #{documento_id} ("{atual["titulo"]}") está arquivado.'

    pedidos = {
        k: v
        for k, v in (("titulo", titulo), ("conteudo", conteudo), ("pasta", pasta), ("tags", tags))
        if v is not None
    }
    try:
        campos = documentos.validar_campos(pedidos)
    except ValueError as erro:
        return f"Proposta recusada: {erro}"

    campos = {k: v for k, v in campos.items() if v != atual[k]}
    if not campos:
        return "Proposta recusada: nenhuma mudança em relação ao documento atual."

    proposta = {
        "acao": "editar",
        "documento_id": documento_id,
        "documento_titulo": atual["titulo"],
        "base_atualizado_em": atual["atualizado_em"].isoformat(),
        "campos": campos,
    }
    return _registrar(
        agente,
        run_id,
        TIPO_EDITAR,
        proposta,
        f'editar o documento #{documento_id} "{atual["titulo"]}"',
    )


def descricao(tipo: str, proposta: dict) -> str:
    """Texto curto da ação, para as mensagens do chat."""
    if tipo == TIPO_CRIAR:
        return f'criar o documento "{proposta.get("titulo", "")}"'
    return f'editar o documento #{proposta.get("documento_id")} "{proposta.get("documento_titulo", "")}"'


def _marcar_aplicado(aprovacao_id: int, documento_id: int) -> None:
    db.executar(
        "update aprovacoes set proposta = proposta || %s::jsonb where id = %s",
        (Json({"aplicado_documento_id": documento_id}), aprovacao_id),
    )


def aplicar(aprovacao: dict, aprovador: str) -> dict[str, Any]:
    """Aplica uma proposta aprovada. Devolve `{"resultado", "mensagem", "documento_id"}`.

    `resultado` é `aplicada` ou `obsoleta` (edição sobre documento que mudou, foi arquivado ou sumiu).
    Exceções (falha de banco etc.) sobem para quem chamou, que marca a aprovação como `erro`.
    Idempotente: se a proposta já guarda `aplicado_documento_id`, não aplica de novo.
    """
    proposta = aprovacao["proposta"] or {}
    tipo = aprovacao["tipo"]
    agente = aprovacao.get("pedido_por") or "agente"
    quem = f"{agente} (aprovado por {aprovador})"

    ja = proposta.get("aplicado_documento_id")
    if ja:
        return _aplicada(tipo, proposta, int(ja))

    if tipo == TIPO_CRIAR:
        criado = documentos.criar(
            proposta.get("titulo", ""),
            proposta.get("conteudo", ""),
            proposta.get("pasta"),
            proposta.get("tags") or [],
            autor=quem,
        )
        _marcar_aplicado(aprovacao["id"], criado["id"])
        return _aplicada(tipo, proposta, criado["id"])

    documento_id = int(proposta["documento_id"])
    atual = documentos.obter(documento_id)
    motivo = None
    if atual is None:
        motivo = "o documento não existe mais"
    elif atual["arquivado"]:
        motivo = "o documento foi arquivado"
    elif atual["atualizado_em"] != datetime.fromisoformat(proposta["base_atualizado_em"]):
        motivo = "o documento foi alterado depois da proposta"
    if motivo:
        return {
            "resultado": "obsoleta",
            "documento_id": documento_id,
            "mensagem": (
                f'Não apliquei a edição do documento #{documento_id} '
                f'"{proposta.get("documento_titulo", "")}": {motivo}. '
                "Peça de novo se ainda fizer sentido."
            ),
        }

    documentos.editar(documento_id, proposta.get("campos") or {}, quem)
    _marcar_aplicado(aprovacao["id"], documento_id)
    return _aplicada(tipo, proposta, documento_id)


def _aplicada(tipo: str, proposta: dict, documento_id: int) -> dict[str, Any]:
    verbo = "criado" if tipo == TIPO_CRIAR else "atualizado"
    titulo = proposta.get("titulo") or proposta.get("documento_titulo") or ""
    return {
        "resultado": "aplicada",
        "documento_id": documento_id,
        "mensagem": f'Documento {verbo}: "{titulo}" (/docs/{documento_id}).',
    }
