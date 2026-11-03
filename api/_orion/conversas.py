"""Conversas do chat: várias conversas além da "Geral" (mensagens sem `conversa_id`).

Cada conversa tem seu histórico, e é só ele que entra no contexto dos agentes (`db.historico_recente`).
A conversa "Geral" é virtual: não tem linha na tabela e reúne as mensagens com `conversa_id` nulo
(inclusive os avisos automáticos do Vigia, do GitHub e o resumo semanal).
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

from . import db

logger = logging.getLogger("orion.conversas")

TITULO_MAX = 80
TITULO_PADRAO = "Nova conversa"


def _titulo(valor: Any) -> str:
    if not isinstance(valor, str) or not valor.strip():
        raise ValueError("Dê um título para a conversa.")
    titulo = " ".join(valor.split())
    if len(titulo) > TITULO_MAX:
        raise ValueError(f"Título grande demais (máximo {TITULO_MAX} caracteres).")
    return titulo


def listar() -> list[dict]:
    """Conversas ativas, a mais recente primeiro (pela última mensagem ou pela criação)."""
    return db.consultar(
        """
        select c.id, c.titulo, c.criado_por, c.criado_em,
               coalesce(max(m.criado_em), c.criado_em) as ultima_em,
               count(m.id)::int as mensagens
        from conversas c left join mensagens m on m.conversa_id = c.id
        where not c.arquivada
        group by c.id
        order by ultima_em desc, c.id desc
        """
    )


def obter(conversa_id: int) -> Optional[dict]:
    return db.um("select * from conversas where id = %s", (conversa_id,))


def ativa(conversa_id: int) -> bool:
    linha = db.um("select 1 as ok from conversas where id = %s and not arquivada", (conversa_id,))
    return linha is not None


def criar(titulo: Any, usuario: str) -> dict:
    """Cria a conversa. Sem título, reaproveita uma "Nova conversa" vazia da própria pessoa (não acumula)."""
    sem_titulo = titulo is None or titulo == ""
    if sem_titulo:
        vazia = db.um(
            """
            select c.* from conversas c
            where not c.arquivada and c.titulo = %s and c.criado_por = %s
              and not exists (select 1 from mensagens m where m.conversa_id = c.id)
            order by c.id desc limit 1
            """,
            (TITULO_PADRAO, usuario),
        )
        if vazia is not None:
            return vazia
    nome = TITULO_PADRAO if sem_titulo else _titulo(titulo)
    linha = db.um(
        "insert into conversas (titulo, criado_por) values (%s, %s) returning *", (nome, usuario)
    )
    assert linha is not None
    return linha


def renomear(conversa_id: int, titulo: Any) -> Optional[dict]:
    return db.um(
        "update conversas set titulo = %s where id = %s returning *", (_titulo(titulo), conversa_id)
    )


def arquivar(conversa_id: int) -> Optional[dict]:
    return db.um("update conversas set arquivada = true where id = %s returning *", (conversa_id,))


def _provisorio(texto: str) -> str:
    """Título provisório: o começo da primeira mensagem."""
    if texto.startswith("/nota "):
        texto = texto[len("/nota "):]
    return " ".join(texto.split())[:50].strip()


def titular_se_nova(conversa_id: int, texto: str) -> None:
    """Primeira mensagem de uma conversa sem título próprio: usa o começo do texto."""
    resumo = _provisorio(texto)
    if not resumo:
        return
    db.executar(
        "update conversas set titulo = %s where id = %s and titulo = %s",
        (resumo, conversa_id, TITULO_PADRAO),
    )


_PROMPT_TITULO = (
    "Dê um título curto (de 2 a 6 palavras, em português) para esta conversa de trabalho. "
    "Responda só com o título, sem aspas e sem ponto final."
)


def _gerar_titulo(pergunta: str, resposta: str) -> str:
    """Pede ao worker um título curto. Isolada para os testes a trocarem por um fake."""
    from langchain_core.messages import HumanMessage, SystemMessage

    from . import llm

    conteudo = f"Pergunta: {pergunta[:500]}\n\nResposta: {resposta[:800]}"
    return llm.texto(llm.worker().invoke([SystemMessage(content=_PROMPT_TITULO), HumanMessage(content=conteudo)]))


def titular_com_ia(conversa_id: Optional[int], gerar: Optional[Callable[[str, str], str]] = None) -> Optional[str]:
    """Depois da primeira resposta, troca o título provisório (começo da pergunta) por um resumo curto.

    Só age se a conversa tem exatamente a pergunta e a resposta e o título ainda é o provisório (quem
    renomeou à mão não é sobrescrito). Nunca lança: falha do modelo deixa o título provisório.
    """
    if not conversa_id:
        return None
    try:
        conversa = obter(conversa_id)
        mensagens = db.listar_mensagens(0, conversa_id)
        if conversa is None or len(mensagens) != 2:
            return None
        pergunta, resposta = mensagens[0]["texto"], mensagens[1]["texto"]
        if conversa["titulo"] != _provisorio(pergunta):
            return None
        bruto = (gerar or _gerar_titulo)(pergunta, resposta)
        novo = " ".join((bruto or "").split()).strip(" \"'“”.")[:TITULO_MAX]
        if not novo:
            return None
        db.executar(
            "update conversas set titulo = %s where id = %s and titulo = %s",
            (novo, conversa_id, conversa["titulo"]),
        )
        return novo
    except Exception:  # noqa: BLE001 — título é só um enfeite
        logger.exception("Não foi possível titular a conversa %s", conversa_id)
        return None
