"""Auditoria: registra quem fez cada mudança no HQ (método, caminho e status; nunca o conteúdo).

Nunca lança: se a tabela ainda não existe (banco sem o setup novo) ou o banco falha, a requisição segue.
"""

from __future__ import annotations

import logging
from typing import Optional

from . import db

logger = logging.getLogger("orion.auditoria")
RETENCAO_DIAS = 180
METODOS = {"POST", "PUT", "PATCH", "DELETE"}
# Caminhos que não são ação de uma pessoa: batimentos e rotinas automáticas.
IGNORAR = ("/api/presenca", "/api/cron/", "/api/github/")


def deve_registrar(metodo: str, caminho: str) -> bool:
    return metodo in METODOS and caminho.startswith("/api/") and not caminho.startswith(IGNORAR)


def registrar(usuario: Optional[str], metodo: str, caminho: str, status: int) -> None:
    try:
        db.executar(
            "insert into auditoria (usuario, metodo, caminho, status) values (%s, %s, %s, %s)",
            (usuario, metodo, caminho[:300], status),
        )
    except Exception:  # noqa: BLE001 — auditar nunca derruba a requisição
        logger.warning("Não foi possível registrar a auditoria", exc_info=True)


def listar(limite: int = 200, usuario: Optional[str] = None) -> list[dict]:
    limite = max(1, min(int(limite), 500))
    return db.consultar(
        "select id, usuario, metodo, caminho, status, criado_em from auditoria "
        "where (%s::text is null or usuario = %s) order by id desc limit %s",
        (usuario, usuario, limite),
    )


def limpar(dias: int = RETENCAO_DIAS) -> None:
    try:
        db.executar("delete from auditoria where criado_em < now() - make_interval(days => %s)", (dias,))
    except Exception:  # noqa: BLE001
        logger.warning("Não foi possível limpar a auditoria", exc_info=True)
