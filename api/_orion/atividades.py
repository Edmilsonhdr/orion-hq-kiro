"""Atividades: observabilidade de cada passo de cada agente.

Regra do projeto (product.md, "Tudo é observável"): cada passo de cada agente
vira uma atividade registrada, que alimenta o escritório virtual e o log. Se
não está no log, não aconteceu.

Regra de robustez (tech.md / Error Handling do design): **registrar atividade
nunca pode derrubar o fluxo**. Por isso `emitir()` engole qualquer exceção
(try/except + log) e devolve `None` em vez de propagar o erro.

Tipos de atividade válidos (structure.md):
    inicio, pensando, delegou, ferramenta, aguardando_aprovacao, concluiu,
    resposta, erro.

Usamos os helpers de `db.py` (conexões curtas, autocommit). O campo `dados` é
`jsonb`; serializamos com `psycopg.types.json.Json` para o driver mandar o dict
como JSON de verdade.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from psycopg.types.json import Json

from . import config, db

logger = logging.getLogger("orion.atividades")

# Tipos de atividade válidos (structure.md). Mantido como referência/validação
# leve; um tipo desconhecido não impede a gravação (não queremos derrubar o
# fluxo), mas registramos um aviso.
TIPOS_VALIDOS: frozenset[str] = frozenset(
    (
        "inicio",
        "pensando",
        "delegou",
        "ferramenta",
        "aguardando_aprovacao",
        "concluiu",
        "resposta",
        "erro",
    )
)


def emitir(
    run_id: Optional[str],
    agente: str,
    tipo: str,
    detalhe: Optional[str] = None,
    dados: Optional[dict[str, Any]] = None,
    tokens: int = 0,
) -> Optional[dict]:
    """Insere uma atividade na tabela `atividades`.

    Nunca lança: qualquer erro (banco fora, DATABASE_URL inválida, etc.) é
    capturado, logado e resulta em `None`. Em caso de sucesso, devolve a linha
    inserida (com `id`, `criado_em`, etc.).

    `dados` (opcional) é gravado como `jsonb`. `tokens` conta o gasto do modelo
    naquele passo (0 quando não se aplica).
    """
    try:
        if tipo not in TIPOS_VALIDOS:
            # Não bloqueia a gravação, mas deixa rastro para depurar.
            logger.warning("Tipo de atividade desconhecido: %r", tipo)
        linha = db.um(
            """
            insert into atividades (run_id, agente, tipo, detalhe, dados, tokens)
            values (%s, %s, %s, %s, %s, %s)
            returning id, run_id, agente, tipo, detalhe, dados, tokens, criado_em
            """,
            (
                run_id,
                agente,
                tipo,
                detalhe,
                Json(dados) if dados is not None else None,
                tokens,
            ),
        )
        return linha
    except Exception:  # noqa: BLE001 — registrar atividade não pode derrubar o fluxo
        logger.exception("Falha ao emitir atividade (agente=%s tipo=%s)", agente, tipo)
        return None


def listar(desde: int = 0) -> list[dict]:
    """Atividades para o polling incremental do front.

    - `desde > 0`: todas as atividades com `id > desde`, em ordem crescente de
      id (as novas desde a última vista).
    - `desde == 0`: as últimas 80 atividades, mas devolvidas em ordem crescente
      de id (o front concatena assumindo ordem crescente).

    Cada linha segue o contrato do design.md: id, run_id, agente, tipo,
    detalhe, dados, tokens, criado_em.
    """
    if desde > 0:
        return db.consultar(
            """
            select id, run_id, agente, tipo, detalhe, dados, tokens, criado_em
            from atividades
            where id > %s
            order by id asc
            """,
            (desde,),
        )

    # desde == 0: pega as 80 mais recentes (id desc) e reinverte para asc.
    recentes = db.consultar(
        """
        select id, run_id, agente, tipo, detalhe, dados, tokens, criado_em
        from atividades
        order by id desc
        limit 80
        """
    )
    recentes.reverse()
    return recentes


def tokens_hoje() -> dict[str, int]:
    """Soma de tokens por agente no dia de hoje (fuso de São Paulo).

    "Hoje" é o dia no fuso America/Sao_Paulo, não em UTC. Filtramos por
    `criado_em` convertido para o fuso local e comparado com a data de hoje.
    Retorna `{agente: tokens}` só com os agentes que tiveram gasto hoje.
    """
    hoje = config.agora().date().isoformat()
    linhas = db.consultar(
        """
        select agente, coalesce(sum(tokens), 0) as total
        from atividades
        where (criado_em at time zone 'America/Sao_Paulo')::date = %s::date
        group by agente
        """,
        (hoje,),
    )
    return {linha["agente"]: int(linha["total"]) for linha in linhas}
