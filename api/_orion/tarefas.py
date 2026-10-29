"""Tarefas: quadro Kanban por pessoa (a fazer, fazendo, bloqueada, feito).

Cada sócia tem o seu quadro; qualquer uma pode ver e mexer no das outras. Validação por `ValueError`
(rotas → 422). `ordem` é a posição dentro da coluna (responsável + status).
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from . import config, db

STATUS = ("a_fazer", "fazendo", "bloqueada", "feito")
PRIORIDADES = ("baixa", "normal", "alta")
TITULO_MAX = 200
DESCRICAO_MAX = 5_000
DIAS_FEITAS_VISIVEIS = 14  # tarefas feitas há mais tempo saem do quadro (continuam no backup)


def _opcao(valor: Any, rotulo: str, opcoes: tuple[str, ...]) -> str:
    if valor not in opcoes:
        raise ValueError(f"{rotulo} inválido(a). Use: {', '.join(opcoes)}.")
    return valor


def _responsavel(valor: Any) -> str:
    nome = (valor or "").strip() if isinstance(valor, str) else ""
    if nome not in config.usuarios():
        raise ValueError("Responsável inválido: escolha uma das pessoas do HQ.")
    return nome


def validar(campos: dict[str, Any]) -> dict[str, Any]:
    """Valida só as chaves presentes (titulo, descricao, prioridade, responsavel, prazo)."""
    saida: dict[str, Any] = {}
    if "titulo" in campos:
        titulo = (campos["titulo"] or "").strip() if isinstance(campos["titulo"], str) else ""
        if not titulo:
            raise ValueError("Título é obrigatório.")
        if len(titulo) > TITULO_MAX:
            raise ValueError(f"Título passa de {TITULO_MAX} caracteres.")
        saida["titulo"] = titulo
    if "descricao" in campos:
        texto = (campos["descricao"] or "").strip() if isinstance(campos["descricao"], str) or campos["descricao"] is None else ""
        if len(texto) > DESCRICAO_MAX:
            raise ValueError(f"Descrição passa de {DESCRICAO_MAX} caracteres.")
        saida["descricao"] = texto or None
    if "prioridade" in campos:
        saida["prioridade"] = _opcao(campos["prioridade"], "Prioridade", PRIORIDADES)
    if "responsavel" in campos:
        saida["responsavel"] = _responsavel(campos["responsavel"])
    if "prazo" in campos:
        bruto = campos["prazo"]
        if bruto in (None, ""):
            saida["prazo"] = None
        elif isinstance(bruto, date):
            saida["prazo"] = bruto
        else:
            try:
                saida["prazo"] = date.fromisoformat(str(bruto)[:10])
            except ValueError:
                raise ValueError("Prazo inválido (use AAAA-MM-DD).") from None
    return saida


def obter(tarefa_id: int) -> Optional[dict]:
    return db.um("select * from tarefas where id = %s", (tarefa_id,))


def listar(responsavel: Optional[str] = None) -> list[dict]:
    """Tarefas do quadro: abertas e as feitas nos últimos dias; ordem da coluna e depois a mais antiga."""
    condicoes = ["(status <> 'feito' or concluida_em > now() - make_interval(days => %s))"]
    params: list[Any] = [DIAS_FEITAS_VISIVEIS]
    if responsavel:
        condicoes.append("responsavel = %s")
        params.append(responsavel)
    return db.consultar(
        f"select * from tarefas where {' and '.join(condicoes)} order by ordem, id", params
    )


def criar(campos: dict[str, Any], autor: str) -> dict:
    dados = validar({"responsavel": autor, "prioridade": "normal", **campos})
    if "titulo" not in dados:
        raise ValueError("Título é obrigatório.")
    nova = db.um(
        """
        insert into tarefas (titulo, descricao, prioridade, responsavel, criado_por, prazo, ordem)
        values (%s, %s, %s, %s, %s, %s,
          (select coalesce(max(ordem), -1) + 1 from tarefas where responsavel = %s and status = 'a_fazer'))
        returning *
        """,
        (
            dados["titulo"], dados.get("descricao"), dados["prioridade"], dados["responsavel"],
            autor, dados.get("prazo"), dados["responsavel"],
        ),
    )
    assert nova is not None
    return nova


def editar(tarefa_id: int, campos: dict[str, Any]) -> Optional[dict]:
    dados = validar(campos)
    atual = obter(tarefa_id)
    if atual is None:
        return None
    if dados:
        if "responsavel" in dados and dados["responsavel"] != atual["responsavel"]:
            # Vai para o fim da mesma coluna na fila da outra pessoa.
            dados["ordem"] = db.um(
                "select coalesce(max(ordem), -1) + 1 as n from tarefas where responsavel = %s and status = %s",
                (dados["responsavel"], atual["status"]),
            )["n"]
        sets = ", ".join(f"{c} = %s" for c in dados)
        db.executar(
            f"update tarefas set {sets}, atualizado_em = now() where id = %s",
            (*dados.values(), tarefa_id),
        )
    return obter(tarefa_id)


def mover(tarefa_id: int, status: str, posicao: Optional[int] = None) -> Optional[dict]:
    """Muda a coluna (e a posição nela; sem `posicao`, vai para o fim). `feito` grava a conclusão."""
    status = _opcao(status, "Status", STATUS)
    atual = obter(tarefa_id)
    if atual is None:
        return None
    irmas = db.consultar(
        "select id from tarefas where responsavel = %s and status = %s and id <> %s order by ordem, id",
        (atual["responsavel"], status, tarefa_id),
    )
    ids = [i["id"] for i in irmas]
    ids.insert(len(ids) if posicao is None else max(0, min(int(posicao), len(ids))), tarefa_id)
    db.executar(
        """
        update tarefas set status = %s, atualizado_em = now(),
          concluida_em = case when %s = 'feito' then coalesce(concluida_em, now()) else null end
        where id = %s
        """,
        (status, status, tarefa_id),
    )
    for novo, i in enumerate(ids):
        db.executar("update tarefas set ordem = %s where id = %s", (novo, i))
    return obter(tarefa_id)


def excluir(tarefa_id: int) -> bool:
    return db.executar("delete from tarefas where id = %s", (tarefa_id,)) > 0


def resumo_por_pessoa() -> dict[str, dict[str, int]]:
    """Por pessoa: tarefas abertas e vencidas (para as abas do quadro). Inclui quem ainda não tem nenhuma."""
    linhas = db.consultar(
        """
        select responsavel,
          count(*) filter (where status <> 'feito')::int as abertas,
          count(*) filter (where status <> 'feito' and prazo < (now() at time zone 'America/Sao_Paulo')::date)::int as vencidas
        from tarefas group by responsavel
        """
    )
    saida = {u: {"abertas": 0, "vencidas": 0} for u in config.usuarios()}
    for l in linhas:
        saida[l["responsavel"]] = {"abertas": l["abertas"], "vencidas": l["vencidas"]}
    return saida
