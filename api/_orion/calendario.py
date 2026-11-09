"""Calendário do HQ: reúne, só para leitura, as datas que já existem nas outras telas.

Três fontes, sem tabela nova:
- tarefas com `prazo` (as que estão na coluna de "feito" aparecem como concluídas);
- negócios em aberto com `proximo_passo_em` (o próximo passo do Comercial);
- reuniões aprovadas (agente Agenda), no horário de Brasília.

Cada item: `tipo` (tarefa | negocio | reuniao), `id`, `titulo`, `data` (AAAA-MM-DD), `hora` (HH:MM ou nulo),
`detalhe`, `responsavel`, `feito`, `href` (tela de origem; nulo na reunião) e `ics` (só na reunião).
"""

from __future__ import annotations

import hmac
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from . import auth, config, db

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


TITULO_MAX = 120


def _lista(valor: Any) -> list[str]:
    if valor is None:
        return []
    if isinstance(valor, str):
        valor = valor.split(",")
    return [" ".join(str(v).split()) for v in valor if str(v).strip()]


def criar_reuniao(titulo: Any, data: Any, hora_inicio: Any, hora_fim: Any, participantes: Any,
                  pauta: Any, usuario: str) -> dict:
    """Cria um compromisso à mão (sem passar pela IA/aprovação). Horários no fuso de Brasília."""
    if not isinstance(titulo, str) or not titulo.strip():
        raise ValueError("Dê um título para o compromisso.")
    titulo = " ".join(titulo.split())
    if len(titulo) > TITULO_MAX:
        raise ValueError(f"Título grande demais (máximo {TITULO_MAX} caracteres).")
    try:
        dia = date.fromisoformat(str(data))
        h_ini = datetime.strptime(str(hora_inicio), "%H:%M").time()
        h_fim = datetime.strptime(str(hora_fim), "%H:%M").time()
    except ValueError:
        raise ValueError("Informe a data (AAAA-MM-DD) e os horários de início e fim (HH:MM).") from None
    inicio = datetime.combine(dia, h_ini, tzinfo=config.TZ)
    fim = datetime.combine(dia, h_fim, tzinfo=config.TZ)
    if fim <= inicio:
        raise ValueError("O horário final precisa ser depois do inicial.")
    linha = db.um(
        """
        insert into reunioes (titulo, inicio, fim, participantes, pauta, criado_por)
        values (%s, %s, %s, %s, %s, %s)
        returning id
        """,
        (titulo, inicio, fim, _lista(participantes), _lista(pauta), usuario),
    )
    assert linha is not None
    return next(i for i in _reunioes(dia, dia) if i["id"] == linha["id"])


def excluir_reuniao(reuniao_id: int) -> bool:
    return db.executar("delete from reunioes where id = %s", (reuniao_id,)) > 0


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


# --- Feed .ics assinável (Google Agenda, Apple Calendar, Outlook) ---

FEED_ANTES_DIAS = 30
FEED_DEPOIS_DIAS = 180


def _contexto_feed(usuario: str) -> str:
    return f"ics-feed:{usuario}"


def token_feed(usuario: str) -> str:
    """Token estável por pessoa para a URL do feed (apps de agenda não enviam cookie). Troca se o segredo da sessão mudar."""
    return f"{usuario}.{auth._assinar(_contexto_feed(usuario))[:40]}"


def usuario_do_token(token: str) -> Optional[str]:
    usuario, _, assinatura = (token or "").rpartition(".")
    if not usuario or usuario not in config.usuarios():
        return None
    esperado = auth._assinar(_contexto_feed(usuario))[:40]
    return usuario if hmac.compare_digest(assinatura, esperado) else None


def url_feed(usuario: str) -> str:
    return f"{config.base_url()}/api/calendario/feed.ics?token={token_feed(usuario)}"


def _escapar(texto: str) -> str:
    return (texto or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _dobrar(linha: str) -> list[str]:
    """Dobra a linha em 75 octetos (RFC 5545), sem cortar caractere no meio."""
    partes, atual, tamanho = [], "", 0
    for ch in linha:
        n = len(ch.encode("utf-8"))
        if tamanho + n > (75 if not partes else 74):
            partes.append(atual)
            atual, tamanho = ch, n
        else:
            atual += ch
            tamanho += n
    partes.append(atual)
    return [partes[0], *(" " + p for p in partes[1:])]


def montar_ics(hoje: Optional[date] = None) -> str:
    """Calendário iCalendar com reuniões (com hora) e prazos/próximos passos (dia inteiro)."""
    hoje = hoje or config.agora().date()
    de, ate = hoje - timedelta(days=FEED_ANTES_DIAS), hoje + timedelta(days=FEED_DEPOIS_DIAS)
    agora = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orion HQ//Calendario//PT-BR", "CALSCALE:GREGORIAN",
              "X-WR-CALNAME:Orion HQ", "X-WR-TIMEZONE:America/Sao_Paulo"]
    for r in db.consultar("select id, titulo, inicio, fim, participantes from reunioes "
                          "where (inicio at time zone 'America/Sao_Paulo')::date between %s and %s order by inicio", (de, ate)):
        linhas += ["BEGIN:VEVENT", f"UID:reuniao-{r['id']}@orion-hq", f"DTSTAMP:{agora}",
                   f"DTSTART:{r['inicio'].astimezone(timezone.utc):%Y%m%dT%H%M%SZ}",
                   f"DTEND:{r['fim'].astimezone(timezone.utc):%Y%m%dT%H%M%SZ}",
                   f"SUMMARY:{_escapar(r['titulo'])}"]
        if r["participantes"]:
            linhas.append(f"DESCRIPTION:{_escapar('Participantes: ' + ', '.join(r['participantes']))}")
        linhas.append("END:VEVENT")
    for i in [*_tarefas(de, ate, so_abertas=True), *_negocios(de, ate)]:
        dia = date.fromisoformat(i["data"])
        rotulo = "Tarefa" if i["tipo"] == "tarefa" else "Comercial"
        linhas += ["BEGIN:VEVENT", f"UID:{i['tipo']}-{i['id']}@orion-hq", f"DTSTAMP:{agora}",
                   f"DTSTART;VALUE=DATE:{dia:%Y%m%d}", f"DTEND;VALUE=DATE:{dia + timedelta(days=1):%Y%m%d}",
                   f"SUMMARY:{_escapar(f'[{rotulo}] ' + i['titulo'])}", "TRANSP:TRANSPARENT", "END:VEVENT"]
    linhas.append("END:VCALENDAR")
    return "\r\n".join(parte for linha in linhas for parte in _dobrar(linha)) + "\r\n"
