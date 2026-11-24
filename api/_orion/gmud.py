"""GMUD (gestão de mudanças).

Ciclo: rascunho → em_aprovacao → aprovada → em_execucao → concluida | revertida.
Saídas: reprovada (volta a ser editável e pode ser reenviada) e cancelada (qualquer etapa não final).
- Tipo "padrao" (mudança pré-aprovada) vai direto para aprovada ao enviar.
- Tipo "emergencial" pode começar a execução antes da aprovação (aprovação depois).
- Risco = impacto × probabilidade (baixo/médio/alto).
- Choque de janela: outra GMUD ativa no mesmo ambiente, com algum sistema em comum e horário sobreposto.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from . import config, db

PREFIXO = "GMUD"
TIPOS = ("normal", "padrao", "emergencial")
AMBIENTES = ("producao", "homologacao", "desenvolvimento")
NIVEIS_IMPACTO = ("baixo", "medio", "alto")
NIVEIS_PROB = ("baixa", "media", "alta")
FINAIS = ("concluida", "revertida", "cancelada")
ATIVAS = ("em_aprovacao", "aprovada", "em_execucao")
EDITAVEIS = ("rascunho", "reprovada", "em_aprovacao")
TEXTO_MAX = 10000

_CAMPOS_TEXTO = ("titulo", "descricao", "justificativa", "plano_implantacao", "plano_rollback", "plano_testes")


def risco(impacto: str, probabilidade: str) -> str:
    pontos = NIVEIS_IMPACTO.index(impacto) + NIVEIS_PROB.index(probabilidade)
    return "baixo" if pontos <= 1 else "medio" if pontos <= 2 else "alto"


def _data(valor: Any, rotulo: str) -> Optional[datetime]:
    if valor in (None, ""):
        return None
    if isinstance(valor, datetime):
        return valor
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"{rotulo} inválido.") from None


def validar(campos: dict[str, Any]) -> dict[str, Any]:
    dados: dict[str, Any] = {}
    for c in _CAMPOS_TEXTO:
        if c in campos:
            v = campos[c]
            texto = v.strip() if isinstance(v, str) else None
            if c == "titulo" and not texto:
                raise ValueError("Título é obrigatório.")
            if texto and len(texto) > (200 if c == "titulo" else TEXTO_MAX):
                raise ValueError(f"{c} grande demais.")
            dados[c] = texto or None
    for c, opcoes in (("tipo", TIPOS), ("ambiente", AMBIENTES), ("impacto", NIVEIS_IMPACTO), ("probabilidade", NIVEIS_PROB)):
        if c in campos:
            if campos[c] not in opcoes:
                raise ValueError(f"{c} inválido.")
            dados[c] = campos[c]
    if "sistemas" in campos:
        lista = campos["sistemas"] or []
        if not isinstance(lista, list):
            raise ValueError("sistemas deve ser uma lista.")
        vistos: list[str] = []
        for s in lista:
            nome = " ".join(str(s).split())[:40]
            if nome and nome.lower() not in [v.lower() for v in vistos]:
                vistos.append(nome)
        dados["sistemas"] = vistos[:15]
    for c, rotulo in (("inicio", "Início"), ("fim", "Fim")):
        if c in campos:
            dados[c] = _data(campos[c], rotulo)
    if "executor" in campos:
        ex = campos["executor"] or None
        if ex and ex not in config.usuarios():
            raise ValueError("Executor não é uma pessoa do HQ.")
        dados["executor"] = ex
    if "tarefa_id" in campos:
        dados["tarefa_id"] = int(campos["tarefa_id"]) if campos["tarefa_id"] else None
    return dados


def _completar(g: dict) -> dict:
    g["chave"] = f"{PREFIXO}-{g['id']}"
    g["risco"] = risco(g["impacto"], g["probabilidade"])
    return g


_SELECT = """
select g.*,
  coalesce((select json_agg(json_build_object('usuario', a.usuario, 'decisao', a.decisao, 'comentario', a.comentario,
     'decidido_em', a.decidido_em) order by a.usuario) from gmud_aprovadores a where a.gmud_id = g.id), '[]'::json) as aprovadores
from gmuds g
"""


def obter(gmud_id: int) -> Optional[dict]:
    g = db.um(f"{_SELECT} where g.id = %s", (gmud_id,))
    return _completar(g) if g else None


def listar(status: Optional[str] = None) -> list[dict]:
    if status:
        linhas = db.consultar(f"{_SELECT} where g.status = %s order by coalesce(g.inicio, g.criado_em) desc", (status,))
    else:
        linhas = db.consultar(f"{_SELECT} order by coalesce(g.inicio, g.criado_em) desc limit 300")
    return [_completar(l) for l in linhas]


def _evento(gmud_id: int, autor: str, tipo: str, texto: Optional[str] = None) -> None:
    db.executar("insert into gmud_eventos (gmud_id, autor, tipo, texto) values (%s, %s, %s, %s)", (gmud_id, autor, tipo, texto))


def detalhe(gmud_id: int) -> Optional[dict]:
    g = obter(gmud_id)
    if g is None:
        return None
    g["eventos"] = db.consultar("select * from gmud_eventos where gmud_id = %s order by id", (gmud_id,))
    g["conflitos"] = conflitos(g)
    return g


def criar(campos: dict[str, Any], autor: str) -> dict:
    dados = validar({"tipo": "normal", **campos})
    if "titulo" not in dados:
        raise ValueError("Título é obrigatório.")
    if dados.get("inicio") and dados.get("fim") and dados["fim"] <= dados["inicio"]:
        raise ValueError("O fim da janela tem que ser depois do início.")
    colunas = ["criado_por", *dados.keys()]
    g = db.um(
        f"insert into gmuds ({', '.join(colunas)}) values ({', '.join(['%s'] * len(colunas))}) returning id",
        (autor, *dados.values()),
    )
    _evento(g["id"], autor, "status", "criou a GMUD")
    if "aprovadores" in campos:
        definir_aprovadores(g["id"], campos["aprovadores"], autor)
    return obter(g["id"])  # type: ignore[return-value]


def editar(gmud_id: int, campos: dict[str, Any], autor: str) -> Optional[dict]:
    atual = obter(gmud_id)
    if atual is None:
        return None
    dados = validar(campos)
    if dados and atual["status"] not in EDITAVEIS:
        raise ValueError("Depois de aprovada, a GMUD não pode mais ser editada (só o resultado).")
    inicio = dados.get("inicio", atual["inicio"])
    fim = dados.get("fim", atual["fim"])
    if inicio and fim and fim <= inicio:
        raise ValueError("O fim da janela tem que ser depois do início.")
    if dados:
        sets = ", ".join(f"{c} = %s" for c in dados)
        db.executar(f"update gmuds set {sets}, atualizado_em = now() where id = %s", (*dados.values(), gmud_id))
        _evento(gmud_id, autor, "edicao", ",".join(dados))
        if atual["status"] == "em_aprovacao":
            # Mudou durante a aprovação: as decisões já dadas valem para outra versão, então voltam a pendente.
            db.executar("update gmud_aprovadores set decisao = null, comentario = null, decidido_em = null where gmud_id = %s", (gmud_id,))
    if "aprovadores" in campos:
        definir_aprovadores(gmud_id, campos["aprovadores"], autor)
    return obter(gmud_id)


def definir_aprovadores(gmud_id: int, usuarios: Any, autor: str) -> None:
    validos = set(config.usuarios())
    lista = [u for u in dict.fromkeys(usuarios or []) if u in validos]
    db.executar("delete from gmud_aprovadores where gmud_id = %s and usuario <> all(%s)", (gmud_id, lista))
    for u in lista:
        db.executar("insert into gmud_aprovadores (gmud_id, usuario) values (%s, %s) on conflict do nothing", (gmud_id, u))


def _mudar_status(gmud_id: int, novo: str, autor: str, texto: str, extra: Optional[dict] = None) -> dict:
    sets = {"status": novo, **(extra or {})}
    db.executar(
        f"update gmuds set {', '.join(f'{c} = %s' for c in sets)}, atualizado_em = now() where id = %s",
        (*sets.values(), gmud_id),
    )
    _evento(gmud_id, autor, "status", texto)
    return obter(gmud_id)  # type: ignore[return-value]


def enviar(gmud_id: int, autor: str) -> Optional[dict]:
    """Manda para aprovação (ou aprova direto, se for mudança padrão). Confere o que é obrigatório."""
    g = obter(gmud_id)
    if g is None:
        return None
    if g["status"] not in ("rascunho", "reprovada"):
        raise ValueError("Só rascunho ou reprovada pode ser enviada para aprovação.")
    faltando = [r for c, r in (("inicio", "início da janela"), ("fim", "fim da janela"), ("plano_implantacao", "plano de implantação"),
                               ("plano_rollback", "plano de volta (rollback)")) if not g[c]]
    if not g["sistemas"]:
        faltando.append("sistemas afetados")
    if g["tipo"] != "padrao" and not g["aprovadores"]:
        faltando.append("pelo menos um aprovador")
    if faltando:
        raise ValueError("Falta preencher: " + ", ".join(faltando) + ".")
    db.executar("update gmud_aprovadores set decisao = null, comentario = null, decidido_em = null where gmud_id = %s", (gmud_id,))
    if g["tipo"] == "padrao":
        return _mudar_status(gmud_id, "aprovada", autor, "enviou (mudança padrão, já aprovada)")
    return _mudar_status(gmud_id, "em_aprovacao", autor, "enviou para aprovação")


def decidir(gmud_id: int, usuario: str, decisao: str, comentario: Any = None) -> Optional[dict]:
    g = obter(gmud_id)
    if g is None:
        return None
    if g["status"] != "em_aprovacao":
        raise ValueError("A GMUD não está esperando aprovação.")
    if usuario not in [a["usuario"] for a in g["aprovadores"]]:
        raise PermissionError("Você não é aprovador desta GMUD.")
    if decisao not in ("aprovada", "reprovada"):
        raise ValueError("Decisão inválida.")
    texto = comentario.strip() if isinstance(comentario, str) and comentario.strip() else None
    if decisao == "reprovada" and not texto:
        raise ValueError("Diga o motivo da reprovação.")
    db.executar(
        "update gmud_aprovadores set decisao = %s, comentario = %s, decidido_em = now() where gmud_id = %s and usuario = %s",
        (decisao, texto, gmud_id, usuario),
    )
    _evento(gmud_id, usuario, "decisao", f"{decisao}{': ' + texto if texto else ''}")
    if decisao == "reprovada":
        return _mudar_status(gmud_id, "reprovada", usuario, "reprovou")
    pendentes = db.um("select count(*)::int as n from gmud_aprovadores where gmud_id = %s and decisao is distinct from 'aprovada'", (gmud_id,))
    if pendentes["n"] == 0:
        return _mudar_status(gmud_id, "aprovada", usuario, "aprovação completa")
    return obter(gmud_id)


def iniciar(gmud_id: int, autor: str) -> Optional[dict]:
    g = obter(gmud_id)
    if g is None:
        return None
    pode = g["status"] == "aprovada" or (g["tipo"] == "emergencial" and g["status"] in ("rascunho", "em_aprovacao"))
    if not pode:
        raise ValueError("Só começa a execução depois de aprovada (ou se for emergencial).")
    return _mudar_status(gmud_id, "em_execucao", autor, "começou a execução")


def encerrar(gmud_id: int, autor: str, resultado: str, obs: Any = None) -> Optional[dict]:
    """resultado: sucesso | com_problemas (→ concluida) ou revertida (→ rollback feito)."""
    g = obter(gmud_id)
    if g is None:
        return None
    if g["status"] != "em_execucao":
        raise ValueError("Só dá para encerrar uma GMUD em execução.")
    texto = obs.strip() if isinstance(obs, str) and obs.strip() else None
    if resultado == "revertida":
        if not texto:
            raise ValueError("Conte por que foi revertida.")
        return _mudar_status(gmud_id, "revertida", autor, "reverteu (rollback)", {"resultado_obs": texto})
    if resultado not in ("sucesso", "com_problemas"):
        raise ValueError("Resultado inválido.")
    if resultado == "com_problemas" and not texto:
        raise ValueError("Conte quais problemas aconteceram.")
    return _mudar_status(gmud_id, "concluida", autor, f"concluiu ({'com sucesso' if resultado == 'sucesso' else 'com problemas'})",
                         {"resultado": resultado, "resultado_obs": texto})


def cancelar(gmud_id: int, autor: str, motivo: Any = None) -> Optional[dict]:
    g = obter(gmud_id)
    if g is None:
        return None
    if g["status"] in FINAIS:
        raise ValueError("A GMUD já foi encerrada.")
    return _mudar_status(gmud_id, "cancelada", autor, f"cancelou{': ' + motivo.strip() if isinstance(motivo, str) and motivo.strip() else ''}")


def comentar(gmud_id: int, autor: str, texto: Any) -> Optional[dict]:
    if obter(gmud_id) is None:
        return None
    corpo = texto.strip() if isinstance(texto, str) else ""
    if not corpo:
        raise ValueError("Escreva o comentário.")
    _evento(gmud_id, autor, "comentario", corpo[:TEXTO_MAX])
    return detalhe(gmud_id)


def conflitos(g: dict) -> list[dict]:
    """Outras GMUDs ativas no mesmo ambiente, com sistema em comum e janela que se sobrepõe."""
    if not g.get("inicio") or not g.get("fim") or not g.get("sistemas"):
        return []
    linhas = db.consultar(
        """
        select id, titulo, status, inicio, fim, sistemas from gmuds
        where id <> %s and ambiente = %s and status = any(%s) and sistemas && %s
          and inicio < %s and fim > %s
        order by inicio
        """,
        (g["id"], g["ambiente"], list(ATIVAS), g["sistemas"], g["fim"], g["inicio"]),
    )
    for l in linhas:
        l["chave"] = f"{PREFIXO}-{l['id']}"
    return linhas


def resumo() -> dict:
    """Números do topo: em aprovação, agendadas nos próximos 7 dias, em execução e sucesso nos últimos 30 dias."""
    l = db.um(
        """
        select
          count(*) filter (where status = 'em_aprovacao')::int as em_aprovacao,
          count(*) filter (where status = 'aprovada' and inicio between now() and now() + interval '7 days')::int as proximos_7,
          count(*) filter (where status = 'em_execucao')::int as em_execucao,
          count(*) filter (where status in ('concluida', 'revertida') and atualizado_em > now() - interval '30 days')::int as encerradas_30,
          count(*) filter (where status = 'concluida' and resultado = 'sucesso' and atualizado_em > now() - interval '30 days')::int as sucesso_30
        from gmuds
        """
    )
    return l or {}
