"""Tarefas: quadro Kanban por pessoa, com colunas personalizáveis e vínculo com Docs e Comercial.

Cada sócia tem o seu quadro, com as suas próprias colunas; qualquer uma pode ver e mexer no das outras
(a primeira recebe as tarefas novas; as marcadas como "concluída" registram a conclusão). Validação
por `ValueError` (rotas → 422). `ordem` é a posição dentro da coluna (responsável + status).
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timezone
from typing import Any, Optional

from . import config, db

PRIORIDADES = ("baixa", "normal", "alta")
TIPOS = ("tarefa", "bug", "melhoria", "historia", "epico")
TIPOS_VINCULO = ("bloqueia", "relacionada", "duplica")
ETIQUETAS_MAX = 10
ETIQUETA_MAX = 30
PONTOS_MAX = 100
COMENTARIO_MAX = 5_000
NOME_SPRINT_MAX = 60
PREFIXO_CHAVE = "ORI"
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
    coalesce(c.concluida, false) as coluna_concluida,
    'ORI-' || t.id as chave,
    e.titulo as epico_titulo, sp.nome as sprint_nome, sp.estado as sprint_estado,
    p.titulo as pai_titulo,
    (select count(*)::int from tarefas s where s.pai_id = t.id) as subtarefas_total,
    (select count(*)::int from tarefas s
       join tarefa_colunas sc on sc.chave = s.status and sc.usuario = s.responsavel
      where s.pai_id = t.id and sc.concluida) as subtarefas_feitas,
    (select count(*)::int from tarefa_comentarios k where k.tarefa_id = t.id) as comentarios_total,
    (select count(*)::int from anexos a where a.entidade = 'tarefa' and a.entidade_id = t.id) as anexos_total,
    (select a.id from anexos a where a.entidade = 'tarefa' and a.entidade_id = t.id and a.tipo like 'image/%%'
      order by a.id limit 1) as capa_id,
    (select count(*)::int from tarefa_vinculos v
       join tarefas b on b.id = v.origem_id
       left join tarefa_colunas bc on bc.chave = b.status and bc.usuario = b.responsavel
      where v.destino_id = t.id and v.tipo = 'bloqueia' and not coalesce(bc.concluida, false)) as bloqueios_abertos
  from tarefas t
  left join tarefa_colunas c on c.chave = t.status and c.usuario = t.responsavel
  left join documentos d on d.id = t.documento_id
  left join negocios n on n.id = t.negocio_id
  left join organizacoes o on o.id = n.organizacao_id
  left join tarefas e on e.id = t.epico_id
  left join tarefas p on p.id = t.pai_id
  left join tarefa_sprints sp on sp.id = t.sprint_id
"""


# --- colunas (cada pessoa tem as suas) ---


def colunas(dono: str) -> list[dict]:
    """Colunas do quadro de `dono`, em ordem. Na primeira vez cria as padrão (e recupera colunas
    personalizadas antigas que ainda tenham tarefas dessa pessoa)."""
    linhas = db.consultar("select * from tarefa_colunas where usuario = %s order by ordem, chave", (dono,))
    if linhas:
        return linhas
    for ordem, (chave, nome, concluida) in enumerate(COLUNAS_PADRAO):
        db.executar(
            "insert into tarefa_colunas (usuario, chave, nome, ordem, concluida) values (%s, %s, %s, %s, %s) "
            "on conflict do nothing",
            (dono, chave, nome, ordem, concluida),
        )
    db.executar(
        """
        insert into tarefa_colunas (usuario, chave, nome, ordem, concluida)
        select %s, m.chave, m.nome, 100 + m.ordem, m.concluida
        from tarefa_colunas m
        where m.usuario = '' and m.chave in (select status from tarefas where responsavel = %s)
        on conflict do nothing
        """,
        (dono, dono),
    )
    _reordenar(dono)
    return db.consultar("select * from tarefa_colunas where usuario = %s order by ordem, chave", (dono,))


def _reordenar(dono: str) -> None:
    for ordem, c in enumerate(db.consultar("select chave from tarefa_colunas where usuario = %s order by ordem, chave", (dono,))):
        db.executar("update tarefa_colunas set ordem = %s where usuario = %s and chave = %s", (ordem, dono, c["chave"]))


def _garantir_todas() -> None:
    for u in config.usuarios():
        colunas(u)


def _coluna(dono: str, chave: Any) -> dict:
    achada = next((c for c in colunas(dono) if c["chave"] == chave), None)
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


def criar_coluna(dono: str, nome: Any, concluida: bool = False) -> dict:
    nome = _nome_coluna(nome)
    atuais = colunas(dono)
    if len(atuais) >= COLUNAS_MAX:
        raise ValueError(f"O quadro pode ter no máximo {COLUNAS_MAX} colunas.")
    if any(c["nome"].lower() == nome.lower() for c in atuais):
        raise ValueError("Já existe uma coluna com esse nome.")
    chave = _chave(nome, {c["chave"] for c in atuais})
    nova = db.um(
        "insert into tarefa_colunas (usuario, chave, nome, ordem, concluida) values (%s, %s, %s, %s, %s) returning *",
        (dono, chave, nome, max(c["ordem"] for c in atuais) + 1, bool(concluida)),
    )
    assert nova is not None
    return nova


def editar_coluna(dono: str, chave: str, nome: Any = None, concluida: Optional[bool] = None) -> Optional[dict]:
    atual = next((c for c in colunas(dono) if c["chave"] == chave), None)
    if atual is None:
        return None
    novo_nome = _nome_coluna(nome) if nome is not None else atual["nome"]
    if any(c["chave"] != chave and c["nome"].lower() == novo_nome.lower() for c in colunas(dono)):
        raise ValueError("Já existe uma coluna com esse nome.")
    nova_flag = atual["concluida"] if concluida is None else bool(concluida)
    db.executar(
        "update tarefa_colunas set nome = %s, concluida = %s where usuario = %s and chave = %s",
        (novo_nome, nova_flag, dono, chave),
    )
    if nova_flag != atual["concluida"]:  # mudou o sentido da coluna: ajusta a data de conclusão das tarefas dela
        db.executar(
            "update tarefas set concluida_em = case when %s then coalesce(concluida_em, now()) else null end "
            "where status = %s and responsavel = %s",
            (nova_flag, chave, dono),
        )
    return _coluna(dono, chave)


def mover_coluna(dono: str, chave: str, posicao: int) -> Optional[list[dict]]:
    """Coloca a coluna na posição `posicao` (0 = primeira). Devolve as colunas na nova ordem."""
    atuais = colunas(dono)
    if not any(c["chave"] == chave for c in atuais):
        return None
    chaves = [c["chave"] for c in atuais if c["chave"] != chave]
    chaves.insert(max(0, min(int(posicao), len(chaves))), chave)
    for ordem, c in enumerate(chaves):
        db.executar("update tarefa_colunas set ordem = %s where usuario = %s and chave = %s", (ordem, dono, c))
    return colunas(dono)


def excluir_coluna(dono: str, chave: str, mover_para: Optional[str] = None) -> bool:
    """Exclui a coluna; se tiver tarefas, elas vão para `mover_para` (obrigatório nesse caso)."""
    atuais = colunas(dono)
    if not any(c["chave"] == chave for c in atuais):
        return False
    if len(atuais) <= 1:
        raise ValueError("O quadro precisa ter pelo menos uma coluna.")
    quantas = db.um("select count(*)::int as n from tarefas where status = %s and responsavel = %s", (chave, dono))["n"]
    if quantas:
        if not mover_para or mover_para == chave:
            raise ValueError("Esta coluna tem tarefas: escolha para qual coluna elas vão.")
        destino = _coluna(dono, mover_para)
        db.executar(
            """
            update tarefas set status = %s, atualizado_em = now(),
              concluida_em = case when %s then coalesce(concluida_em, now()) else null end
            where status = %s and responsavel = %s
            """,
            (destino["chave"], destino["concluida"], chave, dono),
        )
        _renumerar(dono, destino["chave"])
    db.executar("delete from tarefa_colunas where usuario = %s and chave = %s", (dono, chave))
    return True


def _renumerar(dono: str, status: str) -> None:
    for ordem, linha in enumerate(
        db.consultar("select id from tarefas where status = %s and responsavel = %s order by ordem, id", (status, dono))
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


def _etiquetas(valor: Any) -> list[str]:
    if valor in (None, ""):
        return []
    if not isinstance(valor, (list, tuple)):
        raise ValueError("Etiquetas inválidas.")
    saida: list[str] = []
    for bruto in valor:
        nome = re.sub(r"\s+", "-", str(bruto).strip().lower().lstrip("#"))
        if not nome:
            continue
        if len(nome) > ETIQUETA_MAX:
            raise ValueError(f"Etiqueta passa de {ETIQUETA_MAX} caracteres.")
        if nome not in saida:
            saida.append(nome)
    if len(saida) > ETIQUETAS_MAX:
        raise ValueError(f"No máximo {ETIQUETAS_MAX} etiquetas por tarefa.")
    return saida


def _pontos(valor: Any) -> Optional[int]:
    if valor in (None, ""):
        return None
    try:
        n = int(valor)
    except (TypeError, ValueError):
        raise ValueError("Pontos inválidos.") from None
    if n < 0 or n > PONTOS_MAX:
        raise ValueError(f"Pontos de 0 a {PONTOS_MAX}.")
    return n


def _tarefa_ref(valor: Any, rotulo: str) -> Optional[dict]:
    if valor in (None, ""):
        return None
    try:
        ident = int(valor)
    except (TypeError, ValueError):
        raise ValueError(f"{rotulo} inválido(a).") from None
    linha = db.um("select id, tipo, pai_id from tarefas where id = %s", (ident,))
    if linha is None:
        raise ValueError(f"{rotulo} não existe.")
    return linha


def validar(campos: dict[str, Any]) -> dict[str, Any]:
    """Valida só as chaves presentes (titulo, descricao, prioridade, responsavel, prazo, documento_id, negocio_id,
    tipo, etiquetas, pontos, pai_id, epico_id, sprint_id)."""
    saida: dict[str, Any] = {}
    if "tipo" in campos:
        saida["tipo"] = _opcao(campos["tipo"], "Tipo", TIPOS)
    if "etiquetas" in campos:
        saida["etiquetas"] = _etiquetas(campos["etiquetas"])
    if "pontos" in campos:
        saida["pontos"] = _pontos(campos["pontos"])
    if "pai_id" in campos:
        pai = _tarefa_ref(campos["pai_id"], "Tarefa pai")
        if pai is not None and (pai["pai_id"] is not None or pai["tipo"] == "epico"):
            raise ValueError("Subtarefa só pode ficar dentro de uma tarefa comum (não de outra subtarefa nem de um épico).")
        saida["pai_id"] = pai["id"] if pai else None
    if "epico_id" in campos:
        epico = _tarefa_ref(campos["epico_id"], "Épico")
        if epico is not None and epico["tipo"] != "epico":
            raise ValueError("O épico escolhido não é do tipo épico.")
        saida["epico_id"] = epico["id"] if epico else None
    if "sprint_id" in campos:
        if campos["sprint_id"] in (None, ""):
            saida["sprint_id"] = None
        else:
            sprint = obter_sprint(int(campos["sprint_id"])) if str(campos["sprint_id"]).isdigit() else None
            if sprint is None:
                raise ValueError("Sprint não existe.")
            if sprint["estado"] == "encerrada":
                raise ValueError("Essa sprint já foi encerrada.")
            saida["sprint_id"] = sprint["id"]
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
    _garantir_todas()
    condicoes: list[str] = []
    params: list[Any] = []
    if negocio_id is None and documento_id is None:
        condicoes.append("(not coalesce(c.concluida, false) or t.concluida_em > now() - make_interval(days => %s))")
        params.append(DIAS_FEITAS_VISIVEIS)
        condicoes.append("t.pai_id is null")
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


# --- notificações (sino) ---

_MENCAO = re.compile(r"(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_]{1,30})")


def _mencionados(texto: Any) -> set[str]:
    """Pessoas do HQ citadas com @login no texto."""
    if not isinstance(texto, str):
        return set()
    validos = {u.lower(): u for u in config.usuarios()}
    return {validos[m.lower()] for m in _MENCAO.findall(texto) if m.lower() in validos}


def _notificar(usuarios: Any, tipo: str, autor: Optional[str], tarefa_id: int, detalhe: Optional[str] = None) -> set[str]:
    """Grava uma notificação para cada pessoa (nunca para quem fez a ação). Devolve quem foi avisado."""
    if not autor:
        return set()
    avisados = {u for u in usuarios if u and u != autor}
    for u in avisados:
        db.executar(
            "insert into notificacoes (usuario, tipo, autor, tarefa_id, detalhe) values (%s, %s, %s, %s, %s)",
            (u, tipo, autor, tarefa_id, detalhe[:300] if detalhe else None),
        )
    return avisados


def _resumo_texto(texto: str) -> str:
    sem_imagem = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", texto)
    return " ".join(sem_imagem.split())[:200]


def listar_notificacoes(usuario: str, so_nao_lidas: bool = False, limite: int = 60) -> dict:
    """Notificações da pessoa (mais novas primeiro), quantas não lidas e quantas tarefas dela estão atrasadas."""
    itens = db.consultar(
        f"""
        select n.*, t.titulo as tarefa_titulo, t.tipo as tarefa_tipo,
          coalesce(c.nome, t.status) as tarefa_status, coalesce(c.concluida, false) as tarefa_feita
        from notificacoes n
        join tarefas t on t.id = n.tarefa_id
        left join tarefa_colunas c on c.chave = t.status and c.usuario = t.responsavel
        where n.usuario = %s {"and not n.lida" if so_nao_lidas else ""}
        order by n.criado_em desc, n.id desc limit %s
        """,
        (usuario, limite),
    )
    for i in itens:
        i["tarefa_chave"] = f"{PREFIXO_CHAVE}-{i['tarefa_id']}"
    contagem = db.um("select count(*)::int as n from notificacoes where usuario = %s and not lida", (usuario,))
    atrasadas = db.consultar(
        f"""
        {_SELECT} where t.responsavel = %s and t.pai_id is null and t.tipo <> 'epico'
          and t.prazo < (now() at time zone 'America/Sao_Paulo')::date
          and not coalesce((select c.concluida from tarefa_colunas c where c.chave = t.status and c.usuario = t.responsavel), false)
        order by t.prazo
        """,
        (usuario,),
    )
    return {"itens": itens, "nao_lidas": contagem["n"] if contagem else 0, "atrasadas": atrasadas}


def marcar_lida(notificacao_id: int, usuario: str, lida: bool = True) -> bool:
    return db.executar("update notificacoes set lida = %s where id = %s and usuario = %s", (lida, notificacao_id, usuario)) > 0


def marcar_todas_lidas(usuario: str) -> int:
    return db.executar("update notificacoes set lida = true where usuario = %s and not lida", (usuario,))


def criar(campos: dict[str, Any], autor: str) -> dict:
    """Cria na primeira coluna do quadro, na fila de quem for o responsável (padrão: o autor).
    Subtarefa (`pai_id`) herda a sprint e o épico da tarefa pai."""
    dados = validar({"responsavel": autor, "prioridade": "normal", "tipo": "tarefa", **campos})
    if "titulo" not in dados:
        raise ValueError("Título é obrigatório.")
    if dados.get("pai_id"):
        pai = db.um("select sprint_id, epico_id from tarefas where id = %s", (dados["pai_id"],))
        dados.setdefault("sprint_id", pai["sprint_id"])
        dados.setdefault("epico_id", pai["epico_id"])
        if dados["tipo"] == "epico":
            raise ValueError("Subtarefa não pode ser um épico.")
    if dados["tipo"] == "epico":
        dados["epico_id"] = None
    primeira = colunas(dados["responsavel"])[0]["chave"]
    nova = db.um(
        """
        insert into tarefas (titulo, descricao, prioridade, responsavel, criado_por, prazo, status,
                             documento_id, negocio_id, tipo, etiquetas, pontos, pai_id, epico_id, sprint_id,
                             ordem, ordem_backlog)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
          (select coalesce(max(ordem), -1) + 1 from tarefas where responsavel = %s and status = %s),
          (select coalesce(max(ordem_backlog), -1) + 1 from tarefas))
        returning id
        """,
        (
            dados["titulo"], dados.get("descricao"), dados["prioridade"], dados["responsavel"], autor,
            dados.get("prazo"), primeira, dados.get("documento_id"), dados.get("negocio_id"),
            dados["tipo"], dados.get("etiquetas", []), dados.get("pontos"), dados.get("pai_id"),
            dados.get("epico_id"), dados.get("sprint_id"),
            dados["responsavel"], primeira,
        ),
    )
    assert nova is not None
    _registrar(nova["id"], autor, "criada", None, dados["titulo"])
    mencionados = _notificar(_mencionados(dados.get("descricao")), "mencao", autor, nova["id"], _resumo_texto(dados.get("descricao") or ""))
    if dados["responsavel"] not in mencionados:
        _notificar([dados["responsavel"]], "atribuicao", autor, nova["id"])
    return obter(nova["id"])  # type: ignore[return-value]


# Campos que entram no histórico, com o texto legível de cada valor.
_CAMPOS_HISTORICO = (
    "titulo", "descricao", "prioridade", "responsavel", "prazo", "tipo", "etiquetas", "pontos",
    "epico_id", "sprint_id", "documento_id", "negocio_id", "status",
)


def _texto_valor(campo: str, valor: Any) -> Optional[str]:
    if valor is None or valor == [] or valor == "":
        return None
    if campo == "etiquetas":
        return ", ".join(valor)
    if campo == "descricao":
        return valor[:120] + ("…" if len(valor) > 120 else "")
    if campo == "epico_id":
        linha = db.um("select titulo from tarefas where id = %s", (valor,))
        return f"{PREFIXO_CHAVE}-{valor} {linha['titulo']}" if linha else str(valor)
    if campo == "sprint_id":
        linha = db.um("select nome from tarefa_sprints where id = %s", (valor,))
        return linha["nome"] if linha else str(valor)
    return str(valor)


def _registrar(tarefa_id: int, autor: Optional[str], campo: str, de: Any, para: Any) -> None:
    if not autor:
        return
    db.executar(
        "insert into tarefa_historico (tarefa_id, autor, campo, de, para) values (%s, %s, %s, %s, %s)",
        (tarefa_id, autor, campo, de, para),
    )


def editar(tarefa_id: int, campos: dict[str, Any], autor: Optional[str] = None) -> Optional[dict]:
    dados = validar(campos)
    atual = obter(tarefa_id)
    if atual is None:
        return None
    if dados.get("pai_id") == tarefa_id or dados.get("epico_id") == tarefa_id:
        raise ValueError("A tarefa não pode apontar para ela mesma.")
    if dados.get("tipo") == "epico" and atual["pai_id"] is not None:
        raise ValueError("Subtarefa não pode virar épico.")
    if dados.get("tipo") == "epico" and db.um("select 1 as ok from tarefas where pai_id = %s", (tarefa_id,)):
        raise ValueError("Tire as subtarefas antes de transformar a tarefa em épico.")
    if dados:
        mudaram: list[str] = []
        for campo in _CAMPOS_HISTORICO:
            if campo in dados and dados[campo] != atual.get(campo) and not (campo == "prazo" and str(dados[campo]) == str(atual.get(campo))):
                _registrar(tarefa_id, autor, campo, _texto_valor(campo, atual.get(campo)), _texto_valor(campo, dados[campo]))
                mudaram.append(campo)
        avisados: set[str] = set()
        if "descricao" in mudaram:
            novos = _mencionados(dados["descricao"]) - _mencionados(atual.get("descricao"))
            avisados |= _notificar(novos, "mencao", autor, tarefa_id, _resumo_texto(dados["descricao"] or ""))
        if "responsavel" in mudaram:
            avisados |= _notificar([dados["responsavel"]] if dados["responsavel"] not in avisados else [], "atribuicao", autor, tarefa_id)
        if mudaram:
            interessados = {atual["responsavel"], atual["criado_por"], dados.get("responsavel")} - avisados
            _notificar(interessados - {None}, "atualizacao", autor, tarefa_id, ",".join(mudaram))
        if "responsavel" in dados and dados["responsavel"] != atual["responsavel"]:
            # Vai para o fim da coluna de mesma chave no quadro da outra pessoa (ou para a primeira dela).
            destino = colunas(dados["responsavel"])
            coluna = next((c for c in destino if c["chave"] == atual["status"]), destino[0])
            dados["status"] = coluna["chave"]
            dados["concluida_em"] = (atual["concluida_em"] or datetime.now(timezone.utc)) if coluna["concluida"] else None
            dados["ordem"] = db.um(
                "select coalesce(max(ordem), -1) + 1 as n from tarefas where responsavel = %s and status = %s",
                (dados["responsavel"], coluna["chave"]),
            )["n"]
        sets = ", ".join(f"{c} = %s" for c in dados)
        db.executar(
            f"update tarefas set {sets}, atualizado_em = now() where id = %s",
            (*dados.values(), tarefa_id),
        )
        # Subtarefas acompanham a sprint e o épico da tarefa pai.
        for campo in ("sprint_id", "epico_id"):
            if campo in dados:
                db.executar(f"update tarefas set {campo} = %s where pai_id = %s", (dados[campo], tarefa_id))
    return obter(tarefa_id)


def mover(tarefa_id: int, status: str, posicao: Optional[int] = None, autor: Optional[str] = None) -> Optional[dict]:
    """Muda a coluna (e a posição nela; sem `posicao`, vai para o fim). Coluna "concluída" grava a conclusão."""
    atual = obter(tarefa_id)
    if atual is None:
        return None
    coluna = _coluna(atual["responsavel"], status)
    if status != atual["status"]:
        de = next((c["nome"] for c in colunas(atual["responsavel"]) if c["chave"] == atual["status"]), atual["status"])
        _registrar(tarefa_id, autor, "status", de, coluna["nome"])
        _notificar({atual["responsavel"], atual["criado_por"]}, "atualizacao", autor, tarefa_id, f"status:{coluna['nome']}")
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
    """Exclui a tarefa, as subtarefas (cascata) e os anexos de todas elas."""
    db.executar(
        "delete from anexos where entidade = 'tarefa' and entidade_id in (select id from tarefas where id = %s or pai_id = %s)",
        (tarefa_id, tarefa_id),
    )
    return db.executar("delete from tarefas where id = %s", (tarefa_id,)) > 0


def resumo_por_pessoa() -> dict[str, dict[str, int]]:
    """Por pessoa: tarefas abertas (fora das colunas "concluída") e vencidas, para as abas do quadro."""
    _garantir_todas()
    linhas = db.consultar(
        """
        select t.responsavel,
          count(*)::int as abertas,
          count(*) filter (where t.prazo < (now() at time zone 'America/Sao_Paulo')::date)::int as vencidas
        from tarefas t
        where t.pai_id is null and t.tipo <> 'epico' and not coalesce((select c.concluida from tarefa_colunas c where c.chave = t.status and c.usuario = t.responsavel), false)
        group by t.responsavel
        """
    )
    saida = {u: {"abertas": 0, "vencidas": 0} for u in config.usuarios()}
    for l in linhas:
        saida[l["responsavel"]] = {"abertas": l["abertas"], "vencidas": l["vencidas"]}
    return saida


def concluir(tarefa_id: int, feita: bool, autor: Optional[str] = None) -> Optional[dict]:
    """Marca como feita (vai para a primeira coluna "concluída" de quem é responsável) ou reabre (volta para a
    primeira coluna). Serve para o círculo do cartão e para as subtarefas."""
    atual = obter(tarefa_id)
    if atual is None:
        return None
    cols = colunas(atual["responsavel"])
    if feita:
        destino = next((c for c in cols if c["concluida"]), None)
        if destino is None:
            raise ValueError("O quadro dessa pessoa não tem coluna de concluídas.")
    else:
        destino = next((c for c in cols if not c["concluida"]), cols[0])
    return mover(tarefa_id, destino["chave"], None, autor)


def listar_subtarefas(tarefa_id: int) -> list[dict]:
    return db.consultar(f"{_SELECT} where t.pai_id = %s order by t.id", (tarefa_id,))


def detalhe(tarefa_id: int) -> Optional[dict]:
    """Tarefa com subtarefas, comentários, histórico e vínculos (para o painel da tarefa)."""
    t = obter(tarefa_id)
    if t is None:
        return None
    t["subtarefas"] = listar_subtarefas(tarefa_id)
    t["comentarios"] = db.consultar(
        "select * from tarefa_comentarios where tarefa_id = %s order by id", (tarefa_id,)
    )
    t["historico"] = db.consultar(
        "select * from tarefa_historico where tarefa_id = %s order by id desc limit 100", (tarefa_id,)
    )
    t["vinculos"] = listar_vinculos(tarefa_id)
    if t["tipo"] == "epico":
        t["filhas"] = db.consultar(f"{_SELECT} where t.epico_id = %s and t.pai_id is null order by t.id", (tarefa_id,))
    return t


# --- comentários ---


def comentar(tarefa_id: int, texto: Any, autor: str) -> Optional[dict]:
    if obter(tarefa_id) is None:
        return None
    corpo = (texto or "").strip() if isinstance(texto, str) else ""
    if not corpo:
        raise ValueError("Escreva o comentário.")
    if len(corpo) > COMENTARIO_MAX:
        raise ValueError(f"Comentário passa de {COMENTARIO_MAX} caracteres.")
    comentario = db.um(
        "insert into tarefa_comentarios (tarefa_id, autor, texto) values (%s, %s, %s) returning *",
        (tarefa_id, autor, corpo),
    )
    t = obter(tarefa_id)
    avisados = _notificar(_mencionados(corpo), "mencao", autor, tarefa_id, _resumo_texto(corpo))
    _notificar({t["responsavel"], t["criado_por"]} - avisados, "comentario", autor, tarefa_id, _resumo_texto(corpo))
    return comentario


def mencoes_para(usuario: str, dias: int = 14) -> list[dict]:
    """Comentários recentes de outras pessoas em tarefas que citam `@usuario`, com o título e a chave da tarefa."""
    from .documentos import _MENCAO

    linhas = db.consultar(
        """
        select c.id, c.tarefa_id, t.titulo as tarefa_titulo, c.autor, c.texto, c.criado_em
        from tarefa_comentarios c join tarefas t on t.id = c.tarefa_id
        where c.autor <> %s and c.criado_em > now() - make_interval(days => %s)
        order by c.criado_em desc limit 50
        """,
        (usuario, dias),
    )
    alvo = usuario.lower()
    return [l for l in linhas if alvo in {m.lower() for m in _MENCAO.findall(l["texto"])}][:10]


def editar_comentario(comentario_id: int, texto: Any, autor: str) -> Optional[dict]:
    """Troca o texto do comentário (só quem escreveu). Usado também para mudar o tamanho de uma imagem nele."""
    linha = db.um("select autor from tarefa_comentarios where id = %s", (comentario_id,))
    if linha is None:
        return None
    if linha["autor"] != autor:
        raise PermissionError("Só quem escreveu pode editar o comentário.")
    corpo = (texto or "").strip() if isinstance(texto, str) else ""
    if not corpo:
        raise ValueError("Escreva o comentário.")
    if len(corpo) > COMENTARIO_MAX:
        raise ValueError(f"Comentário passa de {COMENTARIO_MAX} caracteres.")
    anterior = db.um("select tarefa_id, texto from tarefa_comentarios where id = %s", (comentario_id,))
    editado = db.um("update tarefa_comentarios set texto = %s where id = %s returning *", (corpo, comentario_id))
    novos = _mencionados(corpo) - _mencionados(anterior["texto"])
    _notificar(novos, "mencao", autor, anterior["tarefa_id"], _resumo_texto(corpo))
    return editado


def excluir_comentario(comentario_id: int, autor: str) -> bool:
    linha = db.um("select autor from tarefa_comentarios where id = %s", (comentario_id,))
    if linha is None:
        return False
    if linha["autor"] != autor:
        raise PermissionError("Só quem escreveu pode apagar o comentário.")
    return db.executar("delete from tarefa_comentarios where id = %s", (comentario_id,)) > 0


# --- vínculos ---

ROTULO_VINCULO = {
    ("bloqueia", "saida"): "bloqueia",
    ("bloqueia", "entrada"): "é bloqueada por",
    ("relacionada", "saida"): "relacionada a",
    ("relacionada", "entrada"): "relacionada a",
    ("duplica", "saida"): "duplica",
    ("duplica", "entrada"): "é duplicada por",
}


def listar_vinculos(tarefa_id: int) -> list[dict]:
    linhas = db.consultar(
        """
        select v.id, v.tipo, 'saida' as direcao, o.id as tarefa_id, o.titulo, o.tipo as tarefa_tipo, o.responsavel,
          coalesce(c.concluida, false) as feita
        from tarefa_vinculos v join tarefas o on o.id = v.destino_id
        left join tarefa_colunas c on c.chave = o.status and c.usuario = o.responsavel
        where v.origem_id = %s
        union all
        select v.id, v.tipo, 'entrada' as direcao, o.id as tarefa_id, o.titulo, o.tipo as tarefa_tipo, o.responsavel,
          coalesce(c.concluida, false) as feita
        from tarefa_vinculos v join tarefas o on o.id = v.origem_id
        left join tarefa_colunas c on c.chave = o.status and c.usuario = o.responsavel
        where v.destino_id = %s
        order by id
        """,
        (tarefa_id, tarefa_id),
    )
    for l in linhas:
        l["rotulo"] = ROTULO_VINCULO[(l["tipo"], l["direcao"])]
        l["chave"] = f"{PREFIXO_CHAVE}-{l['tarefa_id']}"
    return linhas


def vincular(origem_id: int, destino_id: Any, tipo: Any, autor: str) -> Optional[list[dict]]:
    """`tipo` do ponto de vista da origem: bloqueia, relacionada, duplica, ou os inversos
    "bloqueada_por" e "duplicada_por" (gravados invertidos)."""
    if obter(origem_id) is None:
        return None
    inversos = {"bloqueada_por": "bloqueia", "duplicada_por": "duplica"}
    if tipo in inversos:
        tipo = inversos[tipo]
        destino = _tarefa_ref(destino_id, "Tarefa vinculada")
        origem_id, destino_id = destino["id"], origem_id  # type: ignore[index]
    tipo = _opcao(tipo, "Tipo de vínculo", TIPOS_VINCULO)
    destino = _tarefa_ref(destino_id, "Tarefa vinculada")
    if destino["id"] == origem_id:  # type: ignore[index]
        raise ValueError("A tarefa não pode ser vinculada a ela mesma.")
    db.executar(
        "insert into tarefa_vinculos (origem_id, destino_id, tipo, criado_por) values (%s, %s, %s, %s) on conflict do nothing",
        (origem_id, destino["id"], tipo, autor),  # type: ignore[index]
    )
    return listar_vinculos(origem_id)


def desvincular(vinculo_id: int) -> bool:
    return db.executar("delete from tarefa_vinculos where id = %s", (vinculo_id,)) > 0


# --- sprints ---


def obter_sprint(sprint_id: int) -> Optional[dict]:
    return db.um("select * from tarefa_sprints where id = %s", (sprint_id,))


def listar_sprints(incluir_encerradas: bool = False) -> list[dict]:
    """Sprints com o total de tarefas, pontos e quantas estão feitas."""
    onde = "" if incluir_encerradas else "where s.estado <> 'encerrada'"
    return db.consultar(
        f"""
        select s.*,
          count(t.id)::int as tarefas_total,
          count(t.id) filter (where coalesce(c.concluida, false))::int as tarefas_feitas,
          coalesce(sum(t.pontos), 0)::int as pontos_total,
          coalesce(sum(t.pontos) filter (where coalesce(c.concluida, false)), 0)::int as pontos_feitos
        from tarefa_sprints s
        left join tarefas t on t.sprint_id = s.id and t.pai_id is null and t.tipo <> 'epico'
        left join tarefa_colunas c on c.chave = t.status and c.usuario = t.responsavel
        {onde}
        group by s.id
        order by case s.estado when 'ativa' then 0 when 'planejada' then 1 else 2 end, s.id
        """
    )


def _datas_sprint(campos: dict[str, Any]) -> dict[str, Any]:
    saida: dict[str, Any] = {}
    for campo in ("inicio", "fim"):
        if campo in campos:
            bruto = campos[campo]
            if bruto in (None, ""):
                saida[campo] = None
            else:
                try:
                    saida[campo] = date.fromisoformat(str(bruto)[:10])
                except ValueError:
                    raise ValueError("Data inválida (use AAAA-MM-DD).") from None
    if saida.get("inicio") and saida.get("fim") and saida["fim"] < saida["inicio"]:
        raise ValueError("O fim da sprint vem antes do início.")
    return saida


def criar_sprint(campos: dict[str, Any], autor: str) -> dict:
    nome = (campos.get("nome") or "").strip() if isinstance(campos.get("nome"), str) else ""
    if not nome:
        total = db.um("select count(*)::int as n from tarefa_sprints")["n"]
        nome = f"Sprint {total + 1}"
    if len(nome) > NOME_SPRINT_MAX:
        raise ValueError(f"Nome passa de {NOME_SPRINT_MAX} caracteres.")
    datas = _datas_sprint(campos)
    nova = db.um(
        "insert into tarefa_sprints (nome, objetivo, inicio, fim, criado_por) values (%s, %s, %s, %s, %s) returning *",
        (nome, (campos.get("objetivo") or "").strip() or None, datas.get("inicio"), datas.get("fim"), autor),
    )
    assert nova is not None
    return nova


def editar_sprint(sprint_id: int, campos: dict[str, Any]) -> Optional[dict]:
    atual = obter_sprint(sprint_id)
    if atual is None:
        return None
    dados = _datas_sprint({**{k: atual[k] for k in ("inicio", "fim")}, **campos})
    if "nome" in campos:
        nome = (campos["nome"] or "").strip()
        if not nome:
            raise ValueError("Dê um nome à sprint.")
        if len(nome) > NOME_SPRINT_MAX:
            raise ValueError(f"Nome passa de {NOME_SPRINT_MAX} caracteres.")
        dados["nome"] = nome
    if "objetivo" in campos:
        dados["objetivo"] = (campos["objetivo"] or "").strip() or None
    sets = ", ".join(f"{c} = %s" for c in dados)
    db.executar(f"update tarefa_sprints set {sets} where id = %s", (*dados.values(), sprint_id))
    return obter_sprint(sprint_id)


def iniciar_sprint(sprint_id: int, campos: dict[str, Any]) -> Optional[dict]:
    atual = obter_sprint(sprint_id)
    if atual is None:
        return None
    if atual["estado"] != "planejada":
        raise ValueError("Só dá para iniciar uma sprint planejada.")
    if db.um("select 1 as ok from tarefa_sprints where estado = 'ativa'"):
        raise ValueError("Já existe uma sprint ativa: encerre-a antes de iniciar outra.")
    editar_sprint(sprint_id, {"inicio": campos.get("inicio") or date.today().isoformat(), "fim": campos.get("fim") or atual["fim"]})
    db.executar("update tarefa_sprints set estado = 'ativa', iniciada_em = now() where id = %s", (sprint_id,))
    return obter_sprint(sprint_id)


def encerrar_sprint(sprint_id: int, mover_para: Optional[int], autor: Optional[str] = None) -> Optional[dict]:
    """Encerra a sprint. As tarefas não concluídas vão para `mover_para` (outra sprint não encerrada) ou para o backlog."""
    atual = obter_sprint(sprint_id)
    if atual is None:
        return None
    if atual["estado"] != "ativa":
        raise ValueError("Só dá para encerrar a sprint ativa.")
    destino = None
    if mover_para is not None:
        destino = obter_sprint(int(mover_para))
        if destino is None or destino["estado"] == "encerrada" or destino["id"] == sprint_id:
            raise ValueError("Escolha uma sprint planejada para receber as tarefas abertas.")
    abertas = db.consultar(
        """
        select t.id from tarefas t
        left join tarefa_colunas c on c.chave = t.status and c.usuario = t.responsavel
        where t.sprint_id = %s and not coalesce(c.concluida, false)
        """,
        (sprint_id,),
    )
    for linha in abertas:
        db.executar("update tarefas set sprint_id = %s, atualizado_em = now() where id = %s", (destino["id"] if destino else None, linha["id"]))
        _registrar(linha["id"], autor, "sprint_id", atual["nome"], destino["nome"] if destino else None)
    db.executar("update tarefa_sprints set estado = 'encerrada', encerrada_em = now() where id = %s", (sprint_id,))
    saida = obter_sprint(sprint_id)
    assert saida is not None
    saida["tarefas_movidas"] = len(abertas)
    return saida


def excluir_sprint(sprint_id: int) -> bool:
    atual = obter_sprint(sprint_id)
    if atual is None:
        return False
    if atual["estado"] == "ativa":
        raise ValueError("Encerre a sprint antes de excluí-la.")
    return db.executar("delete from tarefa_sprints where id = %s", (sprint_id,)) > 0


def backlog() -> list[dict]:
    """Tarefas abertas que não são subtarefas nem épicos, na ordem do backlog (para a tela Backlog)."""
    return db.consultar(
        f"""{_SELECT}
        where t.pai_id is null and t.tipo <> 'epico'
          and (not coalesce(c.concluida, false) or (sp.estado = 'ativa'))
        order by t.ordem_backlog, t.id"""
    )


def ordenar_backlog(tarefa_id: int, sprint_id: Any, posicao: Optional[int], autor: Optional[str] = None) -> Optional[dict]:
    """Põe a tarefa numa sprint (ou no backlog, com `sprint_id` nulo) e na posição pedida dentro dessa lista."""
    atual = obter(tarefa_id)
    if atual is None:
        return None
    alvo = validar({"sprint_id": sprint_id})["sprint_id"]
    if alvo != atual["sprint_id"]:
        _registrar(tarefa_id, autor, "sprint_id", _texto_valor("sprint_id", atual["sprint_id"]), _texto_valor("sprint_id", alvo))
        db.executar("update tarefas set sprint_id = %s, atualizado_em = now() where id = %s", (alvo, tarefa_id))
        db.executar("update tarefas set sprint_id = %s where pai_id = %s", (alvo, tarefa_id))
    irmas = db.consultar(
        "select id from tarefas where sprint_id is not distinct from %s and pai_id is null and id <> %s order by ordem_backlog, id",
        (alvo, tarefa_id),
    )
    ids = [i["id"] for i in irmas]
    ids.insert(len(ids) if posicao is None else max(0, min(int(posicao), len(ids))), tarefa_id)
    for n, i in enumerate(ids):
        db.executar("update tarefas set ordem_backlog = %s where id = %s", (n, i))
    return obter(tarefa_id)


# --- épicos ---


def listar_epicos() -> list[dict]:
    """Épicos com o progresso das tarefas ligadas a eles."""
    return db.consultar(
        f"""
        select e.*, 'ORI-' || e.id as chave, coalesce(ec.concluida, false) as coluna_concluida,
          count(t.id)::int as tarefas_total,
          count(t.id) filter (where coalesce(c.concluida, false))::int as tarefas_feitas,
          coalesce(sum(t.pontos), 0)::int as pontos_total,
          coalesce(sum(t.pontos) filter (where coalesce(c.concluida, false)), 0)::int as pontos_feitos
        from tarefas e
        left join tarefa_colunas ec on ec.chave = e.status and ec.usuario = e.responsavel
        left join tarefas t on t.epico_id = e.id and t.pai_id is null
        left join tarefa_colunas c on c.chave = t.status and c.usuario = t.responsavel
        where e.tipo = 'epico'
        group by e.id, ec.concluida
        order by coalesce(ec.concluida, false), e.id
        """
    )


# --- filtros salvos ---

FILTROS_MAX = 20


def listar_filtros(usuario: str) -> list[dict]:
    return db.consultar("select * from tarefa_filtros where usuario = %s order by id", (usuario,))


def salvar_filtro(usuario: str, nome: Any, filtros: Any) -> dict:
    nome = (nome or "").strip() if isinstance(nome, str) else ""
    if not nome:
        raise ValueError("Dê um nome ao filtro.")
    if len(nome) > 40:
        raise ValueError("Nome do filtro passa de 40 caracteres.")
    if not isinstance(filtros, dict):
        raise ValueError("Filtro inválido.")
    if len(listar_filtros(usuario)) >= FILTROS_MAX:
        raise ValueError(f"No máximo {FILTROS_MAX} filtros salvos.")
    from psycopg.types.json import Jsonb

    novo = db.um(
        "insert into tarefa_filtros (usuario, nome, filtros) values (%s, %s, %s) returning *",
        (usuario, nome, Jsonb(filtros)),
    )
    assert novo is not None
    return novo


def excluir_filtro(usuario: str, filtro_id: int) -> bool:
    return db.executar("delete from tarefa_filtros where id = %s and usuario = %s", (filtro_id, usuario)) > 0
