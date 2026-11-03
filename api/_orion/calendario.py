"""Calendário do HQ: reúne, só para leitura, as datas que já existem nas outras telas.

Três fontes, sem tabela nova:
- tarefas com `prazo` (as que estão na coluna de "feito" aparecem como concluídas);
- negócios em aberto com `proximo_passo_em` (o próximo passo do Comercial);
- reuniões aprovadas (agente Agenda), no horário de Brasília.

Cada item: `tipo` (tarefa | negocio | reuniao), `id`, `titulo`, `data` (AAAA-MM-DD), `hora` (HH:MM ou nulo),
`detalhe`, `responsavel`, `feito`, `href` (tela de origem; nulo na reunião) e `ics` (só na reunião).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from . import config, db

INTERVALO_MAX_DIAS = 62  # um mês com folga para as semanas das pontas
DIAS_PROXIMOS = 7
TIPOS = ("tarefa", "negocio", "reuniao")


def _tarefas(de: date, ate: date, so_abertas: bool = False) -> list[dict]:
    linhas = db.consultar(
        """
        select t.id, t.titulo, t.prazo, t.responsavel, t.prioridade,
               coalesce(c.concluida, false) as feita
        from tarefas t left join tarefa_colunas c on c.chave = t.status
        where t.prazo between %s and %s and (%s = false or coalesce(c.concluida, false) = false)
        order by t.prazo, t.id
        """,
        (de, ate, so_abertas),
    )
    return [
        {
            "tipo": "tarefa", "id": r["id"], "titulo": r["titulo"], "data": r["prazo"].isoformat(), "hora": None,
            "detalhe": "Prioridade alta" if r["prioridade"] == "alta" else None,
            "responsavel": r["responsavel"], "feito": r["feita"], "href": "/tarefas", "ics": None,
        }
        for r in linhas
    ]


def _negocios(de: date, ate: date) -> list[dict]:
    linhas = db.consultar(
        """
        select n.id, n.titulo, n.proximo_passo, n.proximo_passo_em, n.responsavel, n.etapa, o.nome as organizacao
        from negocios n join organizacoes o on o.id = n.organizacao_id
        where n.proximo_passo_em between %s and %s and n.etapa not in ('ganho', 'perdido')
        order by n.proximo_passo_em, n.id
        """,
        (de, ate),
    )
    return [
        {
            "tipo": "negocio", "id": r["id"], "titulo": f"{r['organizacao']}: {r['proximo_passo'] or r['titulo']}",
            "data": r["proximo_passo_em"].isoformat(), "hora": None, "detalhe": r["etapa"],
            "responsavel": r["responsavel"], "feito": False, "href": f"/comercial/negocios/{r['id']}", "ics": None,
        }
        for r in linhas
    ]


def _reunioes(de: date, ate: date) -> list[dict]:
    linhas = db.consultar(
        """
        select id, titulo, inicio, fim, participantes
        from reunioes
        where (inicio at time zone 'America/Sao_Paulo')::date between %s and %s
        order by inicio, id
        """,
        (de, ate),
    )
    saida = []
    for r in linhas:
        inicio = r["inicio"].astimezone(config.TZ)
        fim = r["fim"].astimezone(config.TZ)
        saida.append({
            "tipo": "reuniao", "id": r["id"], "titulo": r["titulo"], "data": inicio.date().isoformat(),
            "hora": f"{inicio:%H:%M}–{fim:%H:%M}",
            "detalhe": ", ".join(r["participantes"] or []) or None,
            "responsavel": None, "feito": False, "href": None, "ics": f"/api/reunioes/{r['id']}.ics",
        })
    return saida


def _ordenar(itens: list[dict]) -> list[dict]:
    return sorted(itens, key=lambda i: (i["data"], i["hora"] or "99:99", i["tipo"], i["id"]))


def validar_intervalo(de: date, ate: date) -> None:
    if ate < de:
        raise ValueError("A data final não pode ser antes da inicial.")
    if (ate - de).days > INTERVALO_MAX_DIAS:
        raise ValueError(f"Período grande demais (máximo {INTERVALO_MAX_DIAS} dias).")


def itens(de: date, ate: date) -> list[dict]:
    """Tudo que cai entre `de` e `ate` (inclusive), em ordem de data e hora."""
    validar_intervalo(de, ate)
    return _ordenar([*_tarefas(de, ate), *_negocios(de, ate), *_reunioes(de, ate)])


def agenda(hoje: Optional[date] = None) -> dict[str, Any]:
    """Resumo para o Início: atrasados (ainda abertos), hoje e os próximos `DIAS_PROXIMOS` dias."""
    hoje = hoje or config.agora().date()
    inicio_antigo = hoje - timedelta(days=365)
    ontem = hoje - timedelta(days=1)
    atrasados = _ordenar([*_tarefas(inicio_antigo, ontem, so_abertas=True), *_negocios(inicio_antigo, ontem)])
    futuro = _ordenar([*_tarefas(hoje, hoje + timedelta(days=DIAS_PROXIMOS), so_abertas=True),
                       *_negocios(hoje, hoje + timedelta(days=DIAS_PROXIMOS)),
                       *_reunioes(hoje, hoje + timedelta(days=DIAS_PROXIMOS))])
    hoje_iso = hoje.isoformat()
    return {
        "hoje": hoje_iso,
        "atrasados": atrasados,
        "de_hoje": [i for i in futuro if i["data"] == hoje_iso],
        "proximos": [i for i in futuro if i["data"] != hoje_iso],
    }
