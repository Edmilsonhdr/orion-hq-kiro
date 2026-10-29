"""Docs: documentos dos sócios em markdown (spec `.kiro/specs/docs`).

CRUD sobre `documentos` com histórico em `documento_versoes` (estado ANTERIOR a cada edição), busca
full-text em português com fallback `ILIKE`, e leitura para as ferramentas dos agentes
(`ferramentas.py`). Não há exclusão definitiva nesta fase: só arquivar.

Validação por `ValueError` com mensagem em português; as rotas convertem em 422. Convenções
(tech.md): reuso dos helpers de `db.py`, conexão curta, domínio em português.
"""

from __future__ import annotations

import re

from typing import Any, Optional

from . import db
from .texto import casa as _casa
from .texto import radical as _radical
from .texto import radicais as _radicais
from .texto import sem_acento as _sem_acento

TITULO_MAX = 200
CONTEUDO_MAX = 200_000
PASTA_MAX = 100
TAGS_MAX = 10
TAG_MAX = 40
VERSOES_MAX = 50
BUSCA_MAX = 20
TRECHO_MAX = 200
PROFUNDIDADE_MAX = 6

_COLUNAS_RESUMO = (
    "id, titulo, pasta, pai_id, tags, autor, arquivado, criado_em, atualizado_em"
)
_COLUNAS_COMPLETAS = _COLUNAS_RESUMO + ", conteudo"


def _normalizar_tags(tags: Optional[list[str]]) -> list[str]:
    """Minúsculas, sem espaços nas pontas, sem repetidas (ordem preservada), no máximo 10."""
    vistas: list[str] = []
    for tag in tags or []:
        limpa = str(tag).strip().lower()
        if not limpa:
            continue
        if len(limpa) > TAG_MAX:
            raise ValueError(f"Cada tag pode ter no máximo {TAG_MAX} caracteres.")
        if limpa not in vistas:
            vistas.append(limpa)
    if len(vistas) > TAGS_MAX:
        raise ValueError(f"Um documento pode ter no máximo {TAGS_MAX} tags.")
    return vistas


def _normalizar_pasta(pasta: Optional[str]) -> Optional[str]:
    limpa = (pasta or "").strip()
    if len(limpa) > PASTA_MAX:
        raise ValueError(f"A pasta pode ter no máximo {PASTA_MAX} caracteres.")
    return limpa or None


def _validar_titulo(titulo: Optional[str]) -> str:
    limpo = (titulo or "").strip()
    if not limpo:
        raise ValueError("O documento precisa de um título.")
    if len(limpo) > TITULO_MAX:
        raise ValueError(f"O título pode ter no máximo {TITULO_MAX} caracteres.")
    return limpo


def _validar_conteudo(conteudo: Optional[str]) -> str:
    texto = conteudo or ""
    if len(texto) > CONTEUDO_MAX:
        raise ValueError(
            f"O conteúdo pode ter no máximo {CONTEUDO_MAX:,} caracteres.".replace(",", ".")
        )
    return texto


def ancestrais(documento_id: int) -> list[dict]:
    """Do topo até o pai direto (sem o próprio documento), com id e título."""
    return db.consultar(
        """
        with recursive acima as (
          select d.id, d.titulo, d.pai_id, 1 as nivel
          from documentos d where d.id = (select pai_id from documentos where id = %s)
          union all
          select d.id, d.titulo, d.pai_id, a.nivel + 1
          from documentos d join acima a on d.id = a.pai_id
        )
        select id, titulo from acima order by nivel desc
        """,
        (documento_id,),
    )


def _altura(documento_id: int) -> int:
    """Níveis da subárvore abaixo do documento (0 = sem filhas)."""
    linha = db.um(
        """
        with recursive abaixo as (
          select id, 1 as nivel from documentos where pai_id = %s
          union all
          select d.id, a.nivel + 1 from documentos d join abaixo a on d.pai_id = a.id
        )
        select coalesce(max(nivel), 0) as n from abaixo
        """,
        (documento_id,),
    )
    return int(linha["n"]) if linha else 0


def validar_pai(pai_id: Any, documento_id: Optional[int] = None) -> Optional[int]:
    """Valida o pai: existe, não arquivado, sem ciclo e dentro de `PROFUNDIDADE_MAX` níveis."""
    if pai_id in (None, ""):
        return None
    try:
        pai_id = int(pai_id)
    except (TypeError, ValueError):
        raise ValueError("A página pai é inválida.") from None
    pai = db.um("select arquivado from documentos where id = %s", (pai_id,))
    if pai is None:
        raise ValueError("A página pai não existe.")
    if pai["arquivado"]:
        raise ValueError("A página pai está arquivada.")
    if documento_id is not None:
        if pai_id == documento_id or any(a["id"] == documento_id for a in ancestrais(pai_id)):
            raise ValueError("Uma página não pode ficar dentro dela mesma ou de suas subpáginas.")
    nivel_pai = len(ancestrais(pai_id)) + 1
    abaixo = _altura(documento_id) if documento_id is not None else 0
    if nivel_pai + 1 + abaixo > PROFUNDIDADE_MAX:
        raise ValueError(f"As páginas podem ter no máximo {PROFUNDIDADE_MAX} níveis.")
    return pai_id


def subpaginas(documento_id: int) -> list[dict]:
    """Filhas diretas não arquivadas, na ordem manual (depois as mais antigas), com trecho."""
    return db.consultar(
        f"""
        select {_COLUNAS_RESUMO}, left(conteudo, {TRECHO_MAX}) as trecho
        from documentos where pai_id = %s and not arquivado
        order by ordem, criado_em, id
        """,
        (documento_id,),
    )


def arvore() -> list[dict]:
    """Documentos não arquivados (id, título, pai, pasta) para a árvore e o seletor de pai."""
    return db.consultar(
        "select id, titulo, pai_id, pasta from documentos where not arquivado "
        "order by ordem, lower(titulo), id"
    )


def validar_campos(campos: dict[str, Any]) -> dict[str, Any]:
    """Valida e normaliza só os campos presentes (titulo, conteudo, pasta, tags).

    Levanta `ValueError` em português. Serve às propostas dos agentes (que precisam recusar dado
    inválido ANTES de pedir aprovação) com as mesmas regras de `criar`/`editar`.
    """
    saida: dict[str, Any] = {}
    if "titulo" in campos:
        saida["titulo"] = _validar_titulo(campos["titulo"])
    if "conteudo" in campos:
        saida["conteudo"] = _validar_conteudo(campos["conteudo"])
    if "pasta" in campos:
        saida["pasta"] = _normalizar_pasta(campos["pasta"])
    if "tags" in campos:
        saida["tags"] = _normalizar_tags(campos["tags"])
    return saida


def criar(
    titulo: str,
    conteudo: str = "",
    pasta: Optional[str] = None,
    tags: Optional[list[str]] = None,
    autor: str = "",
    pai_id: Optional[int] = None,
) -> dict:
    """Cria um documento (opcionalmente dentro de uma página pai) e devolve a linha completa."""
    linha = db.um(
        f"""
        insert into documentos (titulo, conteudo, pasta, tags, autor, pai_id)
        values (%s, %s, %s, %s, %s, %s)
        returning {_COLUNAS_COMPLETAS}
        """,
        (
            _validar_titulo(titulo),
            _validar_conteudo(conteudo),
            _normalizar_pasta(pasta),
            _normalizar_tags(tags),
            autor,
            validar_pai(pai_id),
        ),
    )
    assert linha is not None
    return linha


def obter(documento_id: int) -> Optional[dict]:
    """Documento completo (inclusive arquivado) ou `None`."""
    return db.um(
        f"select {_COLUNAS_COMPLETAS} from documentos where id = %s", (documento_id,)
    )


def editar(documento_id: int, campos: dict[str, Any], editor: str) -> Optional[dict]:
    """Atualiza os campos presentes em `campos` (titulo, conteudo, pasta, tags, pai_id).

    Se título ou conteúdo mudarem, grava a versão anterior na MESMA transação (nunca se perde o
    texto antigo) e poda para as `VERSOES_MAX` mais recentes. Edição sem mudança real não cria
    versão nem mexe em `atualizado_em`. Devolve o documento ou `None` se não existir.
    """
    pai = validar_pai(campos["pai_id"], documento_id) if "pai_id" in campos else None
    with db.conexao() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    f"select {_COLUNAS_COMPLETAS} from documentos where id = %s for update",
                    (documento_id,),
                )
                atual = cur.fetchone()
                if atual is None:
                    return None

                novo = {
                    "titulo": atual["titulo"],
                    "conteudo": atual["conteudo"],
                    "pasta": atual["pasta"],
                    "tags": atual["tags"],
                    "pai_id": atual["pai_id"],
                }
                if "pai_id" in campos:
                    novo["pai_id"] = pai
                if "titulo" in campos:
                    novo["titulo"] = _validar_titulo(campos["titulo"])
                if "conteudo" in campos:
                    novo["conteudo"] = _validar_conteudo(campos["conteudo"])
                if "pasta" in campos:
                    novo["pasta"] = _normalizar_pasta(campos["pasta"])
                if "tags" in campos:
                    novo["tags"] = _normalizar_tags(campos["tags"])

                if all(novo[k] == atual[k] for k in novo):
                    return atual

                if (
                    novo["titulo"] != atual["titulo"]
                    or novo["conteudo"] != atual["conteudo"]
                ):
                    cur.execute(
                        """
                        insert into documento_versoes (documento_id, titulo, conteudo, editado_por)
                        values (%s, %s, %s, %s)
                        """,
                        (documento_id, atual["titulo"], atual["conteudo"], editor),
                    )
                    cur.execute(
                        """
                        delete from documento_versoes
                        where documento_id = %s and id not in (
                          select id from documento_versoes
                          where documento_id = %s
                          order by criado_em desc, id desc
                          limit %s
                        )
                        """,
                        (documento_id, documento_id, VERSOES_MAX),
                    )

                cur.execute(
                    f"""
                    update documentos
                    set titulo = %s, conteudo = %s, pasta = %s, tags = %s, pai_id = %s,
                        atualizado_em = now()
                    where id = %s
                    returning {_COLUNAS_COMPLETAS}
                    """,
                    (
                        novo["titulo"],
                        novo["conteudo"],
                        novo["pasta"],
                        novo["tags"],
                        novo["pai_id"],
                        documento_id,
                    ),
                )
                return cur.fetchone()


def arquivar(documento_id: int, arquivado: bool = True) -> Optional[dict]:
    """Arquiva ou desarquiva. Não conta como edição (sem versão).

    Arquivar leva junto as subpáginas (na mesma transação); desarquivar reabre só a página pedida.
    """
    with db.conexao() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    update documentos set arquivado = %s, atualizado_em = now()
                    where id = %s
                    returning {_COLUNAS_COMPLETAS}
                    """,
                    (arquivado, documento_id),
                )
                linha = cur.fetchone()
                if linha is not None and arquivado:
                    cur.execute(
                        """
                        with recursive abaixo as (
                          select id from documentos where pai_id = %s
                          union all
                          select d.id from documentos d join abaixo a on d.pai_id = a.id
                        )
                        update documentos set arquivado = true, atualizado_em = now()
                        where id in (select id from abaixo) and not arquivado
                        """,
                        (documento_id,),
                    )
                return linha


def listar(
    pasta: Optional[str] = None,
    tag: Optional[str] = None,
    arquivados: bool = False,
) -> list[dict]:
    """Lista do mais recente para o mais antigo, sem o conteúdo (só um trecho)."""
    condicoes = ["(arquivado = false or %s)"]
    params: list[Any] = [arquivados]
    if pasta:
        condicoes.append("pasta = %s")
        params.append(pasta)
    if tag:
        condicoes.append("%s = any(tags)")
        params.append(tag.strip().lower())
    return db.consultar(
        f"""
        select {_COLUNAS_RESUMO}, left(conteudo, {TRECHO_MAX}) as trecho
        from documentos
        where {' and '.join(condicoes)}
        order by atualizado_em desc, id desc
        """,
        params,
    )


def pastas_e_tags() -> dict:
    """Pastas, tags e contagens (documentos não arquivados), para a barra lateral e os filtros."""
    pastas = db.consultar(
        "select pasta, count(*) as n from documentos "
        "where pasta is not null and not arquivado group by pasta order by pasta"
    )
    tags = db.consultar(
        "select tag, count(*) as n from "
        "(select unnest(tags) as tag from documentos where not arquivado) t "
        "group by tag order by tag"
    )
    total = db.um("select count(*) as n from documentos where not arquivado")
    return {
        "pastas": [p["pasta"] for p in pastas],
        "tags": [t["tag"] for t in tags],
        "contagem_pastas": {p["pasta"]: p["n"] for p in pastas},
        "contagem_tags": {t["tag"]: t["n"] for t in tags},
        "total": total["n"] if total else 0,
    }


# --- Busca ---


def _recorte(conteudo: str, consulta: str, base_busca: Optional[str] = None) -> str:
    """Trecho de ~TRECHO_MAX caracteres ao redor da primeira ocorrência.

    `base_busca` é uma versão do conteúdo com o MESMO tamanho (ex.: sem acentos) onde procurar.
    """
    posicao = (base_busca if base_busca is not None else conteudo.lower()).find(consulta.lower())
    if posicao < 0:
        return conteudo[:TRECHO_MAX]
    inicio = max(0, posicao - TRECHO_MAX // 4)
    return conteudo[inicio : inicio + TRECHO_MAX]


def _buscar_full_text(consulta: str, arquivados: bool) -> list[dict]:
    return db.consultar(
        f"""
        with q as (select plainto_tsquery('portuguese', %s) as q)
        select {_COLUNAS_RESUMO},
               ts_headline('portuguese', conteudo, q.q,
                           'MaxWords=30, MinWords=15, StartSel=«, StopSel=»') as trecho
        from documentos, q
        where busca @@ q.q and (arquivado = false or %s)
        order by ts_rank(busca, q.q) desc, atualizado_em desc, id desc
        limit %s
        """,
        (consulta, arquivados, BUSCA_MAX),
    )


def _escapar_like(texto: str) -> str:
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _buscar_ilike(consulta: str, arquivados: bool) -> list[dict]:
    padrao = f"%{_escapar_like(consulta)}%"
    linhas = db.consultar(
        f"""
        select {_COLUNAS_COMPLETAS}
        from documentos
        where (titulo ilike %s or conteudo ilike %s) and (arquivado = false or %s)
        order by atualizado_em desc, id desc
        limit %s
        """,
        (padrao, padrao, arquivados, BUSCA_MAX),
    )
    for linha in linhas:
        linha["trecho"] = _recorte(linha.pop("conteudo"), consulta)
    return linhas


# --- Busca aproximada (sem extensões do Postgres) ---
#
# O stemmer `portuguese` não liga "decisão" a "decisões" e diferencia acentos. Como `unaccent` e
# `pg_trgm` nem sempre existem, o último passo da busca roda em Python sobre os documentos (a base é
# pequena: dezenas a poucas centenas): ignora acento e caixa e compara o radical das palavras.

_APROXIMADA_MAX_DOCS = 2000


def _buscar_aproximado(consulta: str, arquivados: bool) -> list[dict]:
    """Todas as palavras da consulta (ignorando as de até 2 letras) precisam aparecer; título pesa 3x."""
    termos = [t for t in _radicais(consulta) if len(t) > 2]
    if not termos:
        return []

    linhas = db.consultar(
        f"""
        select {_COLUNAS_COMPLETAS}
        from documentos
        where arquivado = false or %s
        order by atualizado_em desc, id desc
        limit %s
        """,
        (arquivados, _APROXIMADA_MAX_DOCS),
    )
    achados: list[tuple[int, dict]] = []
    for linha in linhas:
        titulo_r = set(_radicais(linha["titulo"]))
        conteudo_r = set(_radicais(linha["conteudo"]))
        pontos = 0
        for termo in termos:
            if _casa(termo, titulo_r):
                pontos += 3
            elif _casa(termo, conteudo_r):
                pontos += 1
            else:
                pontos = 0
                break
        if pontos:
            achados.append((pontos, linha))

    achados.sort(key=lambda par: par[0], reverse=True)  # estável: mantém o mais recente em empate
    saida = []
    for _, linha in achados[:BUSCA_MAX]:
        conteudo = linha.pop("conteudo")
        primeiro = _radical(termos[0])
        linha["trecho"] = _recorte(conteudo, primeiro, _sem_acento(conteudo))
        saida.append(linha)
    return saida


def buscar(consulta: str, arquivados: bool = False) -> list[dict]:
    """Busca em título e conteúdo: full-text em português, com fallbacks.

    1. full-text (`tsvector`, título pesa mais que o conteúdo); 2. `ILIKE` (siglas, nomes próprios);
    3. aproximada em Python (ignora acento e plural). Consulta vazia devolve a listagem normal.
    Cada resultado traz um `trecho` ao redor do termo (no full-text, termos marcados com « »).
    """
    consulta = (consulta or "").strip()
    if not consulta:
        return listar(arquivados=arquivados)

    linhas = _buscar_full_text(consulta, arquivados)
    if not linhas:
        linhas = _buscar_ilike(consulta, arquivados)
    if not linhas:
        linhas = _buscar_aproximado(consulta, arquivados)
    return linhas


# --- Versões ---


def versoes(documento_id: int) -> list[dict]:
    """Versões (sem o conteúdo), da mais recente para a mais antiga."""
    return db.consultar(
        """
        select id, documento_id, titulo, editado_por, criado_em
        from documento_versoes
        where documento_id = %s
        order by criado_em desc, id desc
        """,
        (documento_id,),
    )


def versao(documento_id: int, versao_id: int) -> Optional[dict]:
    return db.um(
        """
        select id, documento_id, titulo, conteudo, editado_por, criado_em
        from documento_versoes
        where documento_id = %s and id = %s
        """,
        (documento_id, versao_id),
    )


def restaurar(documento_id: int, versao_id: int, editor: str) -> Optional[dict]:
    """Restaura uma versão como nova edição (a atual vira versão; o histórico é preservado).

    Devolve `None` se o documento ou a versão não existirem.
    """
    antiga = versao(documento_id, versao_id)
    if antiga is None:
        return None
    return editar(
        documento_id,
        {"titulo": antiga["titulo"], "conteudo": antiga["conteudo"]},
        editor,
    )


def mover_subpagina(documento_id: int, direcao: str) -> Optional[list[dict]]:
    """Troca a posição da página com a vizinha (`cima` ou `baixo`) entre as irmãs.

    Devolve as irmãs na nova ordem, ou `None` se o documento não existe. Normaliza `ordem`
    (0..n-1) antes de trocar, então funciona mesmo com tudo zerado.
    """
    if direcao not in ("cima", "baixo"):
        raise ValueError("Direção inválida (use 'cima' ou 'baixo').")
    doc = db.um("select id, pai_id from documentos where id = %s", (documento_id,))
    if doc is None:
        return None
    irmas = db.consultar(
        """
        select id from documentos
        where pai_id is not distinct from %s and not arquivado
        order by ordem, criado_em, id
        """,
        (doc["pai_id"],),
    )
    ids = [i["id"] for i in irmas]
    posicao = ids.index(documento_id)
    alvo = posicao - 1 if direcao == "cima" else posicao + 1
    if 0 <= alvo < len(ids):
        ids[posicao], ids[alvo] = ids[alvo], ids[posicao]
    for novo, i in enumerate(ids):
        db.executar("update documentos set ordem = %s where id = %s", (novo, i))
    return ids


def mover(documento_id: int, pai_id: Any, posicao: int) -> Optional[list[int]]:
    """Move a página para baixo de `pai_id` (ou para o topo, se `None`) na posição `posicao` entre as irmãs.

    Valida o pai (sem ciclo e dentro da profundidade máxima), reescreve `ordem` das irmãs do destino
    (0..n-1) e devolve os ids delas na nova ordem. `None` se o documento não existe. Mover não cria versão:
    o conteúdo não muda.
    """
    if db.um("select id from documentos where id = %s", (documento_id,)) is None:
        return None
    pai = validar_pai(pai_id, documento_id)
    irmas = db.consultar(
        """
        select id from documentos
        where pai_id is not distinct from %s and not arquivado and id <> %s
        order by ordem, lower(titulo), id
        """,
        (pai, documento_id),
    )
    ids = [i["id"] for i in irmas]
    ids.insert(max(0, min(int(posicao), len(ids))), documento_id)
    db.executar("update documentos set pai_id = %s where id = %s", (pai, documento_id))
    for novo, i in enumerate(ids):
        db.executar("update documentos set ordem = %s where id = %s", (novo, i))
    return ids


# --- comentários e menções ---

COMENTARIO_MAX = 2000
_MENCAO = re.compile(r"(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_]{1,30})")


def comentarios(documento_id: int) -> list[dict]:
    return db.consultar(
        "select id, documento_id, autor, texto, criado_em from documento_comentarios "
        "where documento_id = %s order by criado_em, id",
        (documento_id,),
    )


def comentar(documento_id: int, texto: Any, autor: str) -> Optional[dict]:
    """Grava um comentário; `None` se o documento não existe."""
    if not isinstance(texto, str) or not texto.strip():
        raise ValueError("Escreva o comentário.")
    texto = texto.strip()
    if len(texto) > COMENTARIO_MAX:
        raise ValueError(f"Comentário grande demais (máximo {COMENTARIO_MAX} caracteres).")
    if db.um("select 1 as ok from documentos where id = %s", (documento_id,)) is None:
        return None
    return db.um(
        "insert into documento_comentarios (documento_id, autor, texto) values (%s, %s, %s) "
        "returning id, documento_id, autor, texto, criado_em",
        (documento_id, autor, texto),
    )


def excluir_comentario(comentario_id: int, usuario: str) -> str:
    """`ok`, `nao_encontrado` ou `proibido` (só o autor apaga)."""
    c = db.um("select autor from documento_comentarios where id = %s", (comentario_id,))
    if c is None:
        return "nao_encontrado"
    if c["autor"] != usuario:
        return "proibido"
    db.executar("delete from documento_comentarios where id = %s", (comentario_id,))
    return "ok"


def mencoes_para(usuario: str, dias: int = 14) -> list[dict]:
    """Comentários recentes de outras pessoas que citam `@usuario`, com o título do documento."""
    linhas = db.consultar(
        """
        select c.id, c.documento_id, d.titulo as documento_titulo, c.autor, c.texto, c.criado_em
        from documento_comentarios c join documentos d on d.id = c.documento_id
        where c.autor <> %s and not d.arquivado
          and c.criado_em > now() - make_interval(days => %s)
        order by c.criado_em desc limit 50
        """,
        (usuario, dias),
    )
    alvo = usuario.lower()
    return [l for l in linhas if alvo in {m.lower() for m in _MENCAO.findall(l["texto"])}][:10]
