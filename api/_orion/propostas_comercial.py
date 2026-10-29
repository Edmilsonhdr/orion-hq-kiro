"""Propostas do Comercial feitas pelo agente Negócios (spec `.kiro/specs/comercial`, Requirement 7).

O agente NUNCA grava no CRM: `propor_*` só registra uma aprovação `pendente` (tipos `comercial_*`).
Quando um sócio aprovador decide, `execucao` chama `aplicar`. Independente do grafo (mesmo desenho de
`propostas_docs.py`): decidir não retoma nenhum run. Mensagens devolvidas ao agente são texto.
"""

from __future__ import annotations

import secrets
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from psycopg.types.json import Json

from . import comercial, db
from .atividades import emitir

TIPO_NOVO = "comercial_novo_negocio"
TIPO_ATUALIZAR = "comercial_atualizar_negocio"
TIPO_INTERACAO = "comercial_interacao"
TIPOS = (TIPO_NOVO, TIPO_ATUALIZAR, TIPO_INTERACAO)

LIMITE_POR_RUN = 5

_AVISO = (
    "Isto é só uma PROPOSTA: nada foi gravado no CRM. Um sócio precisa aprovar na tela de Aprovações. "
    "Não diga que o negócio foi criado ou alterado."
)


def _json(valor: Any) -> Any:
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, date):
        return valor.isoformat()
    return valor


def _registrar(
    agente: str, run_id: Optional[str], tipo: str, proposta: dict, descricao_curta: str
) -> str:
    if not run_id:
        return "Não consegui registrar a proposta: não há um pedido em andamento."
    n = db.um(
        "select count(*) as n from aprovacoes where run_id = %s and tipo = any(%s)",
        (run_id, list(TIPOS)),
    )
    if n and int(n["n"]) >= LIMITE_POR_RUN:
        return (
            f"Limite de {LIMITE_POR_RUN} propostas comerciais por pedido atingido. "
            "Avise os sócios e peça um novo pedido para o restante."
        )
    nova = db.um(
        """
        insert into aprovacoes (run_id, chave, tipo, proposta, pedido_por)
        values (%s, %s, %s, %s, %s) returning id
        """,
        (run_id, f"{run_id}:com:{secrets.token_hex(4)}", tipo, Json(proposta), agente),
    )
    assert nova is not None
    emitir(run_id, agente, "aguardando_aprovacao", f"Aguardando aprovação: {descricao_curta}.",
           dados={"aprovacao_id": nova["id"]})
    return f"Proposta registrada (aprovação #{nova['id']}): {descricao_curta}. {_AVISO}"


def propor_novo_negocio(
    agente: str,
    run_id: Optional[str],
    organizacao: str,
    titulo: str,
    tipo_organizacao: str = "clinica",
    **campos: Any,
) -> str:
    """Propõe criar um negócio (e a organização, se for nova). Não grava."""
    try:
        org = comercial.validar_organizacao({"nome": organizacao, "tipo": tipo_organizacao})
        dados = comercial.validar_negocio({"titulo": titulo, **{k: v for k, v in campos.items() if v is not None}})
    except ValueError as erro:
        return f"Proposta recusada: {erro}"
    proposta = {
        "acao": "novo_negocio",
        "organizacao_nome": org["nome"],
        "organizacao_tipo": org["tipo"],
        "campos": {k: _json(v) for k, v in dados.items()},
    }
    return _registrar(
        agente, run_id, TIPO_NOVO, proposta,
        f'criar o negócio "{dados["titulo"]}" ({org["nome"]})',
    )


def propor_atualizacao(
    agente: str,
    run_id: Optional[str],
    negocio_id: int,
    etapa: Optional[str] = None,
    motivo_perda: Optional[str] = None,
    **campos: Any,
) -> str:
    """Propõe mudar a etapa e/ou campos de um negócio aberto. Não grava."""
    try:
        negocio_id = int(negocio_id)
    except (TypeError, ValueError):
        return "Proposta recusada: informe o número (id) do negócio, como aparece na busca."
    atual = comercial.obter_negocio(negocio_id)
    if atual is None:
        return f"Proposta recusada: não existe negócio com o id {negocio_id}."
    if atual["etapa"] in comercial.ETAPAS_FECHADAS:
        return f'Proposta recusada: o negócio #{negocio_id} já está fechado ({atual["etapa"]}).'
    try:
        dados = comercial.validar_negocio({k: v for k, v in campos.items() if v is not None})
        if etapa:
            comercial._opcao(etapa, "Etapa", comercial.ETAPAS)
            if etapa == "perdido" and not (motivo_perda or "").strip():
                raise ValueError("Informe o motivo da perda.")
    except ValueError as erro:
        return f"Proposta recusada: {erro}"
    campos_ok = {k: _json(v) for k, v in dados.items() if _json(v) != _json(atual.get(k))}
    if etapa == atual["etapa"]:
        etapa = None
    if not etapa and not campos_ok:
        return "Proposta recusada: nenhuma mudança em relação ao negócio atual."
    proposta = {
        "acao": "atualizar", "negocio_id": negocio_id, "negocio_titulo": atual["titulo"],
        "etapa_origem": atual["etapa"], "etapa": etapa,
        "motivo_perda": (motivo_perda or "").strip() or None, "campos": campos_ok,
    }
    partes = ([f"mover para {etapa}"] if etapa else []) + (["atualizar dados"] if campos_ok else [])
    return _registrar(
        agente, run_id, TIPO_ATUALIZAR, proposta,
        f'negócio #{negocio_id} "{atual["titulo"]}": {" e ".join(partes)}',
    )


def propor_interacao(
    agente: str, run_id: Optional[str], negocio_id: int, tipo: str, resumo: str
) -> str:
    """Propõe registrar uma interação num negócio. Não grava."""
    try:
        negocio_id = int(negocio_id)
    except (TypeError, ValueError):
        return "Proposta recusada: informe o número (id) do negócio, como aparece na busca."
    atual = comercial.obter_negocio(negocio_id)
    if atual is None:
        return f"Proposta recusada: não existe negócio com o id {negocio_id}."
    try:
        tipo_ok = comercial._opcao(tipo, "Tipo", comercial.TIPOS_INTERACAO, obrigatorio=True)
        resumo_ok = comercial._texto(resumo, "Resumo", comercial.RESUMO_MAX, obrigatorio=True)
    except ValueError as erro:
        return f"Proposta recusada: {erro}"
    proposta = {
        "acao": "interacao", "negocio_id": negocio_id, "negocio_titulo": atual["titulo"],
        "tipo": tipo_ok, "resumo": resumo_ok,
    }
    return _registrar(
        agente, run_id, TIPO_INTERACAO, proposta,
        f'registrar {tipo_ok} no negócio #{negocio_id} "{atual["titulo"]}"',
    )


def descricao(tipo: str, proposta: dict) -> str:
    """Texto curto da ação, para as mensagens do chat."""
    if tipo == TIPO_NOVO:
        return f'criar o negócio "{proposta.get("campos", {}).get("titulo", "")}" ({proposta.get("organizacao_nome", "")})'
    alvo = f'#{proposta.get("negocio_id")} "{proposta.get("negocio_titulo", "")}"'
    if tipo == TIPO_INTERACAO:
        return f"registrar {proposta.get('tipo')} no negócio {alvo}"
    return f"atualizar o negócio {alvo}"


def _marcar(aprovacao_id: int, **marcas: Any) -> None:
    db.executar(
        "update aprovacoes set proposta = proposta || %s::jsonb where id = %s",
        (Json(marcas), aprovacao_id),
    )


def _obsoleta(proposta: dict, motivo: str) -> dict[str, Any]:
    return {
        "resultado": "obsoleta",
        "mensagem": (
            f'Não apliquei a mudança do negócio #{proposta.get("negocio_id")} '
            f'"{proposta.get("negocio_titulo", "")}": {motivo}. Peça de novo se ainda fizer sentido.'
        ),
    }


def aplicar(aprovacao: dict, aprovador: str) -> dict[str, Any]:
    """Aplica uma proposta aprovada: `{"resultado": "aplicada" | "obsoleta", "mensagem": ...}`.

    Exceções (falha de banco etc.) sobem para quem chamou, que marca a aprovação como `erro`.
    Idempotente: `aplicado` na proposta evita repetir; a etapa já no destino não move de novo.
    """
    proposta = aprovacao["proposta"] or {}
    tipo = aprovacao["tipo"]
    quem = f'{aprovacao.get("pedido_por") or "agente"} (aprovado por {aprovador})'
    if proposta.get("aplicado") or proposta.get("aplicado_negocio_id"):
        return _aplicada(tipo, proposta, proposta.get("aplicado_negocio_id") or proposta.get("negocio_id"))

    if tipo == TIPO_NOVO:
        org = comercial.obter_ou_criar_organizacao(
            proposta["organizacao_nome"], proposta.get("organizacao_tipo") or "clinica"
        )
        novo = comercial.criar_negocio(org["id"], proposta.get("campos") or {}, aprovador)
        _marcar(aprovacao["id"], aplicado_negocio_id=novo["id"])
        return _aplicada(tipo, proposta, novo["id"])

    negocio_id = int(proposta["negocio_id"])
    atual = comercial.obter_negocio(negocio_id)
    if atual is None:
        return _obsoleta(proposta, "o negócio não existe mais")
    destino = proposta.get("etapa")

    if tipo == TIPO_INTERACAO:
        comercial.registrar_interacao(negocio_id, proposta["tipo"], proposta["resumo"], quem)
    else:
        if atual["etapa"] in comercial.ETAPAS_FECHADAS and atual["etapa"] != destino:
            return _obsoleta(proposta, f'o negócio já foi fechado ({atual["etapa"]})')
        if destino and atual["etapa"] not in (proposta.get("etapa_origem"), destino):
            return _obsoleta(proposta, f'a etapa mudou para {atual["etapa"]} depois da proposta')
        if proposta.get("campos"):
            comercial.editar_negocio(negocio_id, proposta["campos"])
        if destino:
            comercial.mover_etapa(negocio_id, destino, quem, proposta.get("motivo_perda"))
    _marcar(aprovacao["id"], aplicado=True)
    return _aplicada(tipo, proposta, negocio_id)


def _aplicada(tipo: str, proposta: dict, negocio_id: Any) -> dict[str, Any]:
    return {
        "resultado": "aplicada",
        "negocio_id": negocio_id,
        "mensagem": f"Feito: {descricao(tipo, proposta)} (/comercial/negocios/{negocio_id}).",
    }
