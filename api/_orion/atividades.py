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
from datetime import timedelta
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
    - `desde == 0`: as atividades das últimas 7 horas (no mínimo as últimas
      80), em ordem crescente de id (o front concatena assumindo ordem
      crescente). O escritório deriva copa e turnos de uma janela de 6 horas;
      a folga garante que uma tela recém-aberta tenha o mesmo histórico que
      uma aberta há horas e mostre a mesma cena.

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

    # desde == 0: janela recente (id desc, com teto) e reinverte para asc.
    recentes = db.consultar(
        """
        select id, run_id, agente, tipo, detalhe, dados, tokens, criado_em
        from atividades
        where criado_em > now() - interval '7 hours'
           or id > (select coalesce(max(id), 0) - 80 from atividades)
        order by id desc
        limit 3000
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


def uso_por_agente(dias: int = 30) -> dict:
    """Tokens, execuções e última atividade por agente nos últimos `dias`, com a série diária de tokens."""
    dias = max(1, min(int(dias), 90))
    totais = db.consultar(
        """
        select agente, coalesce(sum(tokens), 0)::int as tokens, count(distinct run_id)::int as execucoes,
               max(criado_em) as ultima_em
        from atividades where criado_em > now() - make_interval(days => %s)
        group by agente
        """,
        (dias,),
    )
    diarios = db.consultar(
        """
        select agente, (criado_em at time zone 'America/Sao_Paulo')::date as dia, sum(tokens)::int as tokens
        from atividades where criado_em > now() - make_interval(days => %s) and tokens > 0
        group by 1, 2
        """,
        (dias,),
    )
    hoje = config.agora().date()
    janela = [hoje - timedelta(days=dias - 1 - n) for n in range(dias)]
    serie: dict[str, list[int]] = {}
    for d in diarios:
        linha = serie.setdefault(d["agente"], [0] * dias)
        if d["dia"] in janela:
            linha[janela.index(d["dia"])] = d["tokens"]
    return {
        "dias": dias,
        "agentes": {
            t["agente"]: {"tokens": t["tokens"], "execucoes": t["execucoes"], "ultima_em": t["ultima_em"],
                          "serie": serie.get(t["agente"], [0] * dias)}
            for t in totais
        },
    }


def execucoes_do_agente(agente: str, limite: int = 10) -> list[dict]:
    """Últimas execuções (um `run_id` cada) do agente: início, duração, tokens, primeiro detalhe e se deu erro."""
    return db.consultar(
        """
        select run_id, min(criado_em) as inicio, max(criado_em) as fim, coalesce(sum(tokens), 0)::int as tokens,
               (array_agg(detalhe order by id) filter (where detalhe is not null))[1] as detalhe,
               bool_or(tipo = 'erro') as erro, count(*)::int as eventos
        from atividades where agente = %s and run_id is not null
        group by run_id order by max(id) desc limit %s
        """,
        (agente, max(1, min(int(limite), 30))),
    )
