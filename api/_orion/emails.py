"""Envio de e-mail pelo Resend (opcional). Sem `RESEND_API_KEY`, nada é enviado e o chat continua sendo o canal.

Nunca lança: falha de rede ou da API vira `False` e um log, para um e-mail não derrubar o job que o chamou.
"""

from __future__ import annotations

import logging

import httpx

from . import config

logger = logging.getLogger("orion.emails")
URL_API = "https://api.resend.com/emails"
TIMEOUT_S = 10.0


def configurado() -> bool:
    return bool(config.resend_key()) and bool(config.emails())


def enviar(para: str, assunto: str, texto: str) -> bool:
    chave = config.resend_key()
    if not chave or not para:
        return False
    try:
        resposta = httpx.post(
            URL_API,
            headers={"Authorization": f"Bearer {chave}"},
            json={"from": config.email_remetente(), "to": [para], "subject": assunto, "text": texto},
            timeout=TIMEOUT_S,
        )
        if resposta.status_code >= 300:
            logger.warning("Resend recusou o e-mail (status %s)", resposta.status_code)
            return False
        return True
    except Exception:  # noqa: BLE001 — e-mail é só um canal extra
        logger.exception("Falha ao enviar e-mail")
        return False
