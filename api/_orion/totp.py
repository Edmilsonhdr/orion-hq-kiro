"""Segundo fator por aplicativo autenticador (TOTP, RFC 6238), só com a biblioteca padrão.

Fluxo: `iniciar` guarda um segredo ainda INATIVO; `ativar` confirma com um código do aplicativo; daí o login passa a
exigir o código. Cada código só vale uma vez (`ultimo_passo`). Sem a tabela (banco sem o setup novo), o login segue
sem segundo fator. Para recuperar quem perdeu o aplicativo: apague a linha da pessoa em `totp`.
"""

from __future__ import annotations

import base64
import hmac
import secrets
import struct
import time
from hashlib import sha1
from typing import Optional
from urllib.parse import quote

from psycopg import errors as pg_erros

from . import db

PASSO_S = 30
DIGITOS = 6
JANELA = 1  # tolera um passo de diferença de relógio para cada lado
EMISSOR = "Orion HQ"


def novo_segredo() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _codigo(segredo: str, passo: int) -> str:
    chave = base64.b32decode(segredo + "=" * (-len(segredo) % 8))
    resumo = hmac.new(chave, struct.pack(">Q", passo), sha1).digest()
    deslocamento = resumo[-1] & 0x0F
    numero = (struct.unpack(">I", resumo[deslocamento:deslocamento + 4])[0] & 0x7FFFFFFF) % (10**DIGITOS)
    return f"{numero:0{DIGITOS}d}"


def codigo_atual(segredo: str, agora: Optional[float] = None) -> str:
    return _codigo(segredo, int((agora if agora is not None else time.time()) // PASSO_S))


def verificar(segredo: str, codigo: str, ultimo_passo: int = 0, agora: Optional[float] = None) -> Optional[int]:
    """Passo do código se for válido e ainda não usado; senão `None`."""
    texto = "".join(ch for ch in (codigo or "") if ch.isdigit())
    if len(texto) != DIGITOS:
        return None
    base = int((agora if agora is not None else time.time()) // PASSO_S)
    for passo in range(base - JANELA, base + JANELA + 1):
        if passo > ultimo_passo and hmac.compare_digest(_codigo(segredo, passo), texto):
            return passo
    return None


def uri(usuario: str, segredo: str) -> str:
    return f"otpauth://totp/{quote(EMISSOR)}:{quote(usuario)}?secret={segredo}&issuer={quote(EMISSOR)}&digits={DIGITOS}&period={PASSO_S}"


def estado(usuario: str) -> str:
    """`sem`, `pendente` (segredo criado, não confirmado) ou `ativo`."""
    linha = db.um("select ativo from totp where usuario = %s", (usuario,))
    return "sem" if linha is None else ("ativo" if linha["ativo"] else "pendente")


def exigido(usuario: str) -> bool:
    """O login dessa pessoa exige código? Banco sem a tabela nova: não."""
    try:
        return estado(usuario) == "ativo"
    except pg_erros.UndefinedTable:
        return False


def iniciar(usuario: str) -> dict:
    if estado(usuario) == "ativo":
        raise ValueError("O segundo fator já está ativo. Desative antes de configurar de novo.")
    segredo = novo_segredo()
    db.executar(
        "insert into totp (usuario, segredo, ativo, ultimo_passo) values (%s, %s, false, 0) "
        "on conflict (usuario) do update set segredo = excluded.segredo, ativo = false, ultimo_passo = 0",
        (usuario, segredo),
    )
    return {"segredo": segredo, "uri": uri(usuario, segredo)}


def _conferir_e_consumir(usuario: str, codigo: str, exigir_ativo: bool) -> bool:
    linha = db.um("select segredo, ativo, ultimo_passo from totp where usuario = %s", (usuario,))
    if linha is None or linha["ativo"] != exigir_ativo:
        return False
    passo = verificar(linha["segredo"], codigo, int(linha["ultimo_passo"]))
    if passo is None:
        return False
    # Atômico: duas tentativas com o mesmo código não passam as duas.
    gravado = db.um("update totp set ultimo_passo = %s where usuario = %s and ultimo_passo < %s returning usuario", (passo, usuario, passo))
    return gravado is not None


def ativar(usuario: str, codigo: str) -> bool:
    if not _conferir_e_consumir(usuario, codigo, exigir_ativo=False):
        return False
    db.executar("update totp set ativo = true where usuario = %s", (usuario,))
    return True


def conferir_login(usuario: str, codigo: str) -> bool:
    return _conferir_e_consumir(usuario, codigo, exigir_ativo=True)


def desativar(usuario: str, codigo: str) -> bool:
    if not _conferir_e_consumir(usuario, codigo, exigir_ativo=True):
        return False
    db.executar("delete from totp where usuario = %s", (usuario,))
    return True
