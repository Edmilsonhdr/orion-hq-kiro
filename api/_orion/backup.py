"""Backup geral em JSON: tudo que os sócios escreveram (Docs, Comercial, conversas), num só arquivo.

Complementa o `pg_dump` (scripts/backup_db.py): este é legível e serve para guardar/levar os dados sem
depender do Postgres. Anexos entram em base64. Não inclui sessões nem senhas (não ficam no banco).
"""

from __future__ import annotations

import base64
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from . import config, db

# Ordem pensada para ler/restaurar: pais antes dos filhos.
TABELAS = (
    "documentos",
    "documento_versoes",
    "documento_comentarios",
    "organizacoes",
    "contatos",
    "negocios",
    "interacoes",
    "piloto_itens",
    "tarefa_colunas",
    "tarefas",
    "conversas",
    "mensagens",
    "aprovacoes",
    "anexos",
)


def _json(valor: Any) -> Any:
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(valor)).decode("ascii")
    raise TypeError(f"Sem serialização para {type(valor).__name__}")


def gerar(incluir_anexos: bool = True) -> dict[str, Any]:
    tabelas: dict[str, list[dict]] = {}
    for nome in TABELAS:
        if nome == "anexos" and not incluir_anexos:
            tabelas[nome] = db.consultar(
                "select id, entidade, entidade_id, nome, tipo, tamanho, autor, criado_em from anexos order by id"
            )
        else:
            tabelas[nome] = db.consultar(f"select * from {nome} order by 1")
    return {
        "sistema": "orion-hq",
        "gerado_em": config.agora().isoformat(),
        "anexos_incluidos": incluir_anexos,
        "contagem": {n: len(l) for n, l in tabelas.items()},
        "tabelas": tabelas,
    }


def como_json(incluir_anexos: bool = True) -> str:
    return json.dumps(gerar(incluir_anexos), default=_json, ensure_ascii=False, indent=1)
