"""Acesso ao Postgres (Neon).

Restrição da Vercel (tech.md): conexões curtas — uma conexão por operação,
`autocommit=True` e `prepare_threshold=None` (necessário com o pooler do Neon).
Nada de pool de longa duração aqui.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Optional, Sequence

import psycopg
from psycopg.rows import dict_row

from . import config

# Tipo dos parâmetros aceitos nas queries.
Params = Optional[Sequence[Any]]


@contextmanager
def conexao() -> Iterator[psycopg.Connection]:
    """Abre uma conexão curta com o Postgres e fecha ao sair.

    Usa `autocommit=True` e `prepare_threshold=None` (obrigatório com o pooler
    do Neon) e `row_factory=dict_row` para que as consultas retornem dicts.
    """
    conn = psycopg.connect(
        config.database_url(),
        autocommit=True,
        prepare_threshold=None,
        row_factory=dict_row,
    )
    try:
        yield conn
    finally:
        conn.close()


def consultar(sql: str, params: Params = None) -> list[dict]:
    """Executa uma consulta e retorna todas as linhas como lista de dicts."""
    with conexao() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def um(sql: str, params: Params = None) -> Optional[dict]:
    """Executa uma consulta e retorna a primeira linha (ou None)."""
    with conexao() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def executar(sql: str, params: Params = None) -> int:
    """Executa um comando (insert/update/delete) e retorna o rowcount.

    Para comandos com `RETURNING`, prefira `um`/`consultar`.
    """
    with conexao() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount


def salvar_mensagem(
    autor: str, texto: str, run_id: Optional[str] = None
) -> dict:
    """Insere uma mensagem no chat do grupo e devolve a linha inserida.

    Colunas conforme `db/schema.sql`: autor, texto, run_id.
    """
    linha = um(
        """
        insert into mensagens (autor, texto, run_id)
        values (%s, %s, %s)
        returning id, autor, texto, run_id, criado_em
        """,
        (autor, texto, run_id),
    )
    # `um` só retorna None quando não há linha; um INSERT ... RETURNING sempre
    # devolve uma. O assert deixa isso explícito para o verificador de tipos.
    assert linha is not None
    return linha


def historico_recente(limite: int = 12) -> str:
    """Últimas N mensagens do grupo, formatadas "Autor: texto".

    Uma mensagem por linha, em ordem cronológica (mais antiga primeiro).
    Requirement 2.6 pede as últimas 12 mensagens como contexto do Orquestrador.
    Buscamos as mais recentes por `id desc` e invertemos para ordem crescente.
    """
    linhas = consultar(
        """
        select autor, texto
        from mensagens
        order by id desc
        limit %s
        """,
        (limite,),
    )
    linhas.reverse()  # volta para ordem cronológica (mais antiga primeiro)
    return "\n".join(f"{m['autor']}: {m['texto']}" for m in linhas)


def listar_mensagens(desde: int = 0) -> list[dict]:
    """Mensagens do chat para o polling incremental do front (Requirement 2.3).

    Espelha `atividades.listar`:
    - `desde > 0`: todas as mensagens com `id > desde`, em ordem crescente de id.
    - `desde == 0`: as últimas 50, devolvidas em ordem crescente de id (o front
      concatena assumindo ordem crescente).

    Cada linha traz id, autor, texto, run_id, criado_em.
    """
    if desde > 0:
        return consultar(
            """
            select id, autor, texto, run_id, criado_em
            from mensagens
            where id > %s
            order by id asc
            """,
            (desde,),
        )

    recentes = consultar(
        """
        select id, autor, texto, run_id, criado_em
        from mensagens
        order by id desc
        limit 50
        """
    )
    recentes.reverse()
    return recentes


def listar_aprovacoes(status: Optional[str] = None) -> list[dict]:
    """Aprovações para a fila de decisão (Requirement 9.1).

    - `status` informado: filtra por ele (ex.: 'pendente', 'aprovada', 'recusada').
    - `status` ausente: devolve todas, com as pendentes primeiro e, dentro de
      cada grupo, as mais recentes antes (pendentes + histórico das decididas).

    Retorna campos legíveis: id, tipo, proposta, pedido_por, status,
    decidido_por, criado_em, decidido_em.
    """
    campos = (
        "id, tipo, proposta, pedido_por, status, decidido_por, "
        "criado_em, decidido_em"
    )
    if status is not None:
        return consultar(
            f"""
            select {campos}
            from aprovacoes
            where status = %s
            order by id desc
            """,
            (status,),
        )

    # Sem filtro: pendentes primeiro (ordem estável), depois as decididas.
    return consultar(
        f"""
        select {campos}
        from aprovacoes
        order by (status = 'pendente') desc, id desc
        """
    )


def proximas_reunioes() -> list[dict]:
    """Próximas reuniões (início a partir de agora), em ordem crescente de início.

    Requirement 6.4/agenda: lista as reuniões futuras para o front. Usa `now()`
    do Postgres para comparar no mesmo relógio da gravação.
    """
    return consultar(
        """
        select id, titulo, inicio, fim, participantes, pauta, criado_por, run_id
        from reunioes
        where inicio >= now()
        order by inicio asc
        """
    )


def reuniao(reuniao_id: int) -> Optional[dict]:
    """Uma reunião pelo id (ou None), para gerar o arquivo .ics."""
    return um(
        """
        select id, titulo, inicio, fim, participantes, pauta, criado_por, run_id
        from reunioes
        where id = %s
        """,
        (reuniao_id,),
    )
