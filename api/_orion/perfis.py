"""Perfis das pessoas do HQ: o nome completo para exibir (menções, comentários, notificações).

O login vem de `ORION_USERS`; aqui fica só o nome que a própria pessoa escolhe em Configurações.
Sem nome salvo, mostra o login com a primeira letra maiúscula.
"""

from __future__ import annotations

from typing import Any

from . import config, db

NOME_MAX = 80


def _padrao(usuario: str) -> str:
    return usuario[:1].upper() + usuario[1:]


def listar() -> list[dict]:
    """Todas as pessoas do HQ, em ordem de nome: [{usuario, nome}]."""
    salvos = {l["usuario"]: l["nome"] for l in db.consultar("select usuario, nome from perfis")}
    pessoas = [{"usuario": u, "nome": salvos.get(u) or _padrao(u)} for u in config.usuarios()]
    return sorted(pessoas, key=lambda p: p["nome"].lower())


def definir_nome(usuario: str, nome: Any) -> dict:
    texto = " ".join(nome.split()) if isinstance(nome, str) else ""
    if not texto:
        raise ValueError("Escreva o seu nome.")
    if len(texto) > NOME_MAX:
        raise ValueError(f"Nome passa de {NOME_MAX} caracteres.")
    db.executar(
        """
        insert into perfis (usuario, nome) values (%s, %s)
        on conflict (usuario) do update set nome = excluded.nome, atualizado_em = now()
        """,
        (usuario, texto),
    )
    return {"usuario": usuario, "nome": texto}
