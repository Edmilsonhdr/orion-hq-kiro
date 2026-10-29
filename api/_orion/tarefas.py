"""Tarefas: quadro Kanban por pessoa, com colunas personalizáveis e vínculo com Docs e Comercial.

Cada sócia tem o seu quadro; qualquer uma pode ver e mexer no das outras. As colunas são as mesmas para
todas (a primeira recebe as tarefas novas; as marcadas como "concluída" registram a conclusão). Validação
por `ValueError` (rotas → 422). `ordem` é a posição dentro da coluna (responsável + status).
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from typing import Any, Optional

from . import config, db

PRIORIDADES = ("baixa", "normal", "alta")
TITULO_MAX = 200
DESCRICAO_MAX = 5_000
NOME_COLUNA_MAX = 30
COLUNAS_MAX = 10
DIAS_FEITAS_VISIVEIS = 14  # tarefas concluídas há mais tempo saem do quadro (continuam no backup)

COLUNAS_PADRAO = (
    ("a_fazer", "A fazer", False),
    ("fazendo", "Fazendo", False),
    ("bloqueada", "Bloqueada", False),
    ("feito", "Feito", True),
)

_SELECT = """
  select t.*, d.titulo as documento_titulo, n.titulo as negocio_titulo, o.nome as organizacao_nome,
    coalesce(c.concluida, false) as coluna_concluida
  from tarefas t
  left join tarefa_colunas c on c.chave = t.status
  left join documentos d on d.id = t.documento_id
  left join negocios n on n.id = t.negocio_id
  left join organizacoes o on o.id = n.organizacao_id
"""


# --- colunas ---


def colunas() -> list[dict]:
    """Colunas do quadro, em ordem. Recria as padrão se a tabela estiver vazia."""
    linhas = db.consultar("select * from tarefa_colunas order by ordem, chave")
    if not linhas:
        for ordem, (chave, nome, concluida) in enumerate(COLUNAS_PADRAO):
            db.executar(
                "insert into tarefa_colunas (chave, nome, ordem, concluida) values (%s, %s, %s, %s) "
                "on conflict (chave) do nothing",
                (chave, nome, ordem, concluida),
            )
        linhas = db.consultar("select * from tarefa_colunas order by ordem, chave")
    return linhas


def _coluna(chave: Any) -> dict:
    achada = next((c for c in colunas() if c["chave"] == chave), None)
    if achada is None:
        raise ValueError("Coluna inexistente.")
    return achada


def _nome_coluna(valor: Any) -> str:
    nome = (valor or "").strip() if isinstance(valor, str) else ""
    if not nome:
        raise ValueError("Dê um nome à coluna.")
    if len(nome) > NOME_COLUNA_MAX:
        raise ValueError(f"O nome da coluna passa de {NOME_COLUNA_MAX} caracteres.")
    return nome


def _chave(nome: str, existentes: set[str]) -> str:
    base = unicodedata.normalize("NFD", nome.lower())
    base = re.sub(r"[^a-z0-9]+", "_", "".join(c for c in base if not unicodedata.combining(c))).strip("_") or "coluna"
    chave, n = base, 2
    while chave in existentes:
        chave, n = f"{base}_{n}", n + 1
    return chave


def criar_coluna(nome: Any, concluida: bool = False) -> dict:
    nome = _nome_coluna(nome)
    atuais = colunas()
    if len(atuais) >= COLUNAS_MAX:
        raise ValueError(f"O quadro pode ter no máximo {COLUNAS_MAX} colunas.")
    if any(c["nome"].lower() == nome.lower() for c in atuais):
        raise ValueError("Já existe uma coluna com esse nome.")
    chave = _chave(nome, {c["chave"] for c in atuais})
    nova = db.um(
        "insert into tarefa_colunas (chave, nome, ordem, concluida) values (%s, %s, %s, %s) returning *",
        (chave, nome, max(c["ordem"] for c in atuais) + 1, bool(concluida)),
    )
    assert nova is not None
    return nova


def editar_coluna(chave: str, nome: Any = None, concluida: Optional[bool] = None) -> Optional[dict]:
    atual = next((c for c in colunas() if c["chave"] == chave), None)
    if atual is None:
        return None
    novo_nome = _nome_coluna(nome) if nome is not None else atual["nome"]
    if any(c["chave"] != chave and c["nome"].lower() == novo_nome.lower() for c in colunas()):
        raise ValueError("Já existe uma coluna com esse nome.")
    nova_flag = atual["concluida"] if concluida is None else bool(concluida)
    db.executar("update tarefa_colunas set nome = %s, concluida = %s where chave = %s", (novo_nome, nova_flag, chave))
    if nova_flag != atual["concluida"]:  # mudou o sentido da coluna: ajusta a data de conclusão das tarefas dela
        db.executar(
            "update tarefas set concluida_em = case when %s then coalesce(concluida_em, now()) else null end where status = %s",
            (nova_flag, chave),
        )
    return _coluna(chave)


def mover_coluna(chave: str, posicao: int) -> Optional[list[dict]]:
    """Coloca a coluna na posição `posicao` (0 = primeira). Devolve as colunas na nova ordem."""
    atuais = colunas()
    if not any(c["chave"] == chave for c in atuais):
        return None
    chaves = [c["chave"] for c in atuais if c["chave"] != chave]
    chaves.insert(max(0, min(int(posicao), len(chaves))), chave)
    for ordem, c in enumerate(chaves):
        db.executar("update tarefa_colunas set ordem = %s where chave = %s", (ordem, c))
    return colunas()


def excluir_coluna(chave: str, mover_para: Optional[str] = None) -> bool:
    """Exclui a coluna; se tiver tarefas, elas vão para `mover_para` (obrigatório nesse caso)."""
    atuais = colunas()
    if not any(c["chave"] == chave for c in atuais):
        return False
    if len(atuais) <= 1:
        raise ValueError("O quadro precisa ter pelo menos uma coluna.")
    quantas = db.um("select count(*)::int as n from tarefas where status = %s", (chave,))["n"]
    if quantas:
        if not mover_para or mover_para == chave:
            raise ValueError("Esta coluna tem tarefas: escolha para qual coluna elas vão.")
        destino = _coluna(mover_para)
        db.executar(
            """
            update tarefas set status = %s, atualizado_em = now(),
              concluida_em = case when %s then coalesce(concluida_em, now()) else null end
            where status = %s
            """,
            (destino["chave"], destino["concluida"], chave),
        )
        _renumerar(destino["chave"])
    db.executar("delete from tarefa_colunas where chave = %s", (chave,))
    return True


def _renumerar(status: str) -> None:
    for ordem, linha in enumerate(
        db.consultar(
            "select id from tarefas where status = %s order by responsavel, ordem, id", (status,)
        )
    ):
        db.executar("update tarefas set ordem = %s where id = %s", (ordem, linha["id"]))


# --- validação ---


def _opcao(valor: Any, rotulo: str, opcoes: tuple[str, ...]) -> str:
    if valor not in opcoes:
        raise ValueError(f"{rotulo} inválido(a). Use: {', '.join(opcoes)}.")
    return valor


def _responsavel(valor: Any) -> str:
    nome = (valor or "").strip() if isinstance(valor, str) else ""
    if nome not in config.usuarios():
        raise ValueError("Responsável inválido: escolha uma das pessoas do HQ.")
    return nome


def _vinculo(valor: Any, tabela: str, rotulo: str) -> Optional[int]:
    if valor in (None, ""):
        return None
    try:
        ident = int(valor)
    except (TypeError, ValueError):
        raise ValueError(f"{rotulo} inválido.") from None
    if db.um(f"select 1 as ok from {tabela} where id = %s", (ident,)) is None:
        raise ValueError(f"{rotulo} não existe.")
    return ident


def validar(campos: dict[str, Any]) -> dict[str, Any]:
    """Valida só as chaves presentes (titulo, descricao, prioridade, responsavel, prazo, documento_id, negocio_id)."""
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
    if "documento_id" in campos:
        saida["documento_id"] = _vinculo(campos["documento_id"], "documentos", "Documento")
    if "negocio_id" in campos:
        saida["negocio_id"] = _vinculo(campos["negocio_id"], "negocios", "Negócio")
    return saida


# --- tarefas ---


def obter(tarefa_id: int) -> Optional[dict]:
    return db.um(f"{_SELECT} where t.id = %s", (tarefa_id,))


def listar(
    responsavel: Optional[str] = None,
    negocio_id: Optional[int] = None,
    documento_id: Optional[int] = None,
) -> list[dict]:
    """Tarefas do quadro: abertas e as concluídas nos últimos dias. Filtrando por negócio ou documento,
    vêm todas (é a lista de tarefas relacionadas)."""
    colunas()  # garante as colunas padrão
    condicoes: list[str] = []
    params: list[Any] = []
    if negocio_id is None and documento_id is None:
        condicoes.append("(not coalesce(c.concluida, false) or t.concluida_em > now() - make_interval(days => %s))")
        params.append(DIAS_FEITAS_VISIVEIS)
    if responsavel:
        condicoes.append("t.responsavel = %s")
        params.append(responsavel)
    if negocio_id is not None:
        condicoes.append("t.negocio_id = %s")
        params.append(negocio_id)
    if documento_id is not None:
        condicoes.append("t.documento_id = %s")
        params.append(documento_id)
    onde = f"where {' and '.join(condicoes)}" if condicoes else ""
    return db.consultar(f"{_SELECT} {onde} order by t.ordem, t.id", params)


def criar(campos: dict[str, Any], autor: str) -> dict:
    """Cria na primeira coluna do quadro, na fila de quem for o responsável (padrão: o autor)."""
    dados = validar({"responsavel": autor, "prioridade": "normal", **campos})
    if "titulo" not in dados:
        raise ValueError("Título é obrigatório.")
    primeira = colunas()[0]["chave"]
    nova = db.um(
        """
        insert into tarefas (titulo, descricao, prioridade, responsavel, criado_por, prazo, status,
                             documento_id, negocio_id, ordem)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s,
          (select coalesce(max(ordem), -1) + 1 from tarefas where responsavel = %s and status = %s))
        returning id
        """,
        (
            dados["titulo"], dados.get("descricao"), dados["prioridade"], dados["responsavel"], autor,
            dados.get("prazo"), primeira, dados.get("documento_id"), dados.get("negocio_id"),
            dados["responsavel"], primeira,
        ),
    )
    assert nova is not None
    return obter(nova["id"])  # type: ignore[return-value]


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
    """Muda a coluna (e a posição nela; sem `posicao`, vai para o fim). Coluna "concluída" grava a conclusão."""
    coluna = _coluna(status)
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
          concluida_em = case when %s then coalesce(concluida_em, now()) else null end
        where id = %s
        """,
        (status, coluna["concluida"], tarefa_id),
    )
    for novo, i in enumerate(ids):
        db.executar("update tarefas set ordem = %s where id = %s", (novo, i))
    return obter(tarefa_id)


def excluir(tarefa_id: int) -> bool:
    return db.executar("delete from tarefas where id = %s", (tarefa_id,)) > 0


def resumo_por_pessoa() -> dict[str, dict[str, int]]:
    """Por pessoa: tarefas abertas (fora das colunas "concluída") e vencidas, para as abas do quadro."""
    colunas()
    linhas = db.consultar(
        """
        select t.responsavel,
          count(*)::int as abertas,
          count(*) filter (where t.prazo < (now() at time zone 'America/Sao_Paulo')::date)::int as vencidas
        from tarefas t
        where not coalesce((select c.concluida from tarefa_colunas c where c.chave = t.status), false)
        group by t.responsavel
        """
    )
    saida = {u: {"abertas": 0, "vencidas": 0} for u in config.usuarios()}
    for l in linhas:
        saida[l["responsavel"]] = {"abertas": l["abertas"], "vencidas": l["vencidas"]}
    return saida
