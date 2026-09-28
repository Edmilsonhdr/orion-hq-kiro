"""Autenticação por sessão em cookie assinado (HMAC).

Só Dimi e Jullyana usam o Orion HQ. A sessão é um cookie `orion_sessao`
`httpOnly`, `SameSite=Lax`, assinado com HMAC-SHA256 usando `ORION_SESSION_SECRET`
(Requirement 1.1). Não há estado de sessão no banco: o próprio token carrega o
usuário e a expiração, e a assinatura garante que não foi adulterado.

Formato do token (design.md, seção "Sessão"):

    usuario.expira_epoch.assinatura

onde `assinatura = HMAC-SHA256(ORION_SESSION_SECRET, "usuario.expira_epoch")`
em hexadecimal. A verificação de assinatura e a comparação de senha usam
`hmac.compare_digest` (tempo constante — Requirement 1.5), e as falhas de
credencial não revelam qual campo errou (Requirement 1.2).

Convenção do projeto (tech.md): toda leitura de variável de ambiente acontece
dentro de funções, nunca no import. Reutilizamos os helpers de `config.py`.
"""

from __future__ import annotations

import hmac
import time
from hashlib import sha256
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request, Response, status

from . import config

# Nome do cookie de sessão (superfície pública, mantido estável).
NOME_COOKIE = "orion_sessao"

# Validade da sessão: 30 dias em segundos (Requirement 1.1).
DURACAO_SESSAO = 30 * 24 * 60 * 60


# --- Assinatura e token ---


def _assinar(mensagem: str) -> str:
    """HMAC-SHA256 da mensagem com o segredo de sessão, em hexadecimal.

    O segredo vem de `ORION_SESSION_SECRET` (lido dentro da função).
    """
    segredo = config.session_secret().encode("utf-8")
    return hmac.new(segredo, mensagem.encode("utf-8"), sha256).hexdigest()


def criar_token(usuario: str, agora_epoch: Optional[int] = None) -> str:
    """Monta o token de sessão `usuario.expira_epoch.assinatura`.

    `expira_epoch` é o instante de expiração (agora + 30 dias) em segundos.
    `agora_epoch` permite fixar o "agora" nos testes; se None, usa o relógio.
    """
    base = int(agora_epoch if agora_epoch is not None else time.time())
    expira = base + DURACAO_SESSAO
    corpo = f"{usuario}.{expira}"
    return f"{corpo}.{_assinar(corpo)}"


def verificar_token(
    token: str, agora_epoch: Optional[int] = None
) -> Optional[str]:
    """Valida o token e devolve o usuário, ou None se inválido/expirado.

    Confere, em tempo constante, se a assinatura bate com o corpo
    `usuario.expira_epoch` e se ainda não expirou. Qualquer formato inesperado
    resulta em None (sem lançar), para o chamador tratar como 401.
    """
    if not token:
        return None
    partes = token.rsplit(".", 1)
    if len(partes) != 2:
        return None
    corpo, assinatura = partes

    # Compara a assinatura em tempo constante (Requirement 1.5).
    esperada = _assinar(corpo)
    if not hmac.compare_digest(assinatura, esperada):
        return None

    # Corpo = "usuario.expira_epoch". O usuário pode conter ".", então
    # separamos a expiração pela direita.
    corpo_partes = corpo.rsplit(".", 1)
    if len(corpo_partes) != 2:
        return None
    usuario, expira_str = corpo_partes
    if not usuario:
        return None
    try:
        expira = int(expira_str)
    except ValueError:
        return None

    agora = int(agora_epoch if agora_epoch is not None else time.time())
    if agora >= expira:
        return None
    return usuario


# --- Credenciais ---


def autenticar(usuario: str, senha: str) -> bool:
    """Confere usuário e senha contra `ORION_USERS`, em tempo constante.

    Requirement 1.2: não revela qual campo errou. Para não vazar por tempo se o
    usuário existe, sempre comparamos a senha informada com alguma senha de
    referência (a do usuário, se existir, ou uma placeholder de mesmo papel) e
    combinamos os dois resultados no fim.
    """
    tabela = config.usuarios()
    esperada = tabela.get(usuario)

    # Se o usuário não existe, comparamos contra um valor fixo só para gastar um
    # tempo semelhante ao da comparação real; o resultado será descartado.
    alvo = esperada if esperada is not None else ""
    senha_ok = hmac.compare_digest(senha, alvo)

    return esperada is not None and senha_ok


# --- Cookie ---


def _em_localhost(request: Optional[Request]) -> bool:
    """True se a requisição veio de localhost (para não exigir `secure`).

    Em produção (Vercel) o host é o domínio real e o cookie sai `secure`.
    Sem request (ou host desconhecido), assumimos produção (mais seguro).
    """
    if request is None:
        return False
    host = (request.url.hostname or "").lower()
    return host in ("localhost", "127.0.0.1", "::1")


def definir_cookie_sessao(
    response: Response, usuario: str, request: Optional[Request] = None
) -> None:
    """Grava o cookie de sessão assinado na resposta.

    `httpOnly`, `SameSite=Lax`, `secure` exceto em localhost, validade de 30
    dias (Requirement 1.1).
    """
    token = criar_token(usuario)
    response.set_cookie(
        key=NOME_COOKIE,
        value=token,
        max_age=DURACAO_SESSAO,
        httponly=True,
        samesite="lax",
        secure=not _em_localhost(request),
        path="/",
    )


def limpar_cookie_sessao(
    response: Response, request: Optional[Request] = None
) -> None:
    """Remove o cookie de sessão (logout)."""
    response.delete_cookie(
        key=NOME_COOKIE,
        httponly=True,
        samesite="lax",
        secure=not _em_localhost(request),
        path="/",
    )


# --- Dependências FastAPI ---


def usuario_atual(
    orion_sessao: Optional[str] = Cookie(default=None, alias=NOME_COOKIE),
) -> str:
    """Dependência: devolve o usuário logado ou responde 401.

    Lê o cookie `orion_sessao`, valida assinatura e expiração e retorna o nome
    do usuário. Ausente ou inválido → 401 (Requirement 1.3).
    """
    usuario = verificar_token(orion_sessao or "")
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        )
    return usuario


def exigir_aprovador(usuario: str = Depends(usuario_atual)) -> str:
    """Dependência: exige que o usuário esteja em `ORION_APPROVERS`.

    Reaproveita `usuario_atual` (portanto já garante 401 sem sessão) e, se o
    usuário não for aprovador, responde 403.
    """
    if usuario not in config.aprovadores():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não autorizado a aprovar.",
        )
    return usuario
