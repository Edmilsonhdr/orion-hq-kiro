"""Docs: documentos dos sócios em markdown (spec `.kiro/specs/docs`).

CRUD sobre `documentos` com histórico em `documento_versoes` (estado ANTERIOR a cada edição), busca
full-text em português com fallback `ILIKE`, e leitura para as ferramentas dos agentes
(`ferramentas.py`). Não há exclusão definitiva nesta fase: só arquivar.

Validação por `ValueError` com mensagem em português; as rotas convertem em 422. Convenções
(tech.md): reuso dos helpers de `db.py`, conexão curta, domínio em português.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional

from . import db

TITULO_MAX = 200
CONTEUDO_MAX = 200_000
PASTA_MAX = 100
TAGS_MAX = 10
TAG_MAX = 40
VERSOES_MAX = 50
BUSCA_MAX = 20
TRECHO_MAX = 200

_COLUNAS_RESUMO = (
    "id, titulo, pasta, tags, autor, arquivado, criado_em, atualizado_em"
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
) -> dict:
    """Cria um documento e devolve a linha completa."""
    linha = db.um(
        f"""
        insert into documentos (titulo, conteudo, pasta, tags, autor)
        values (%s, %s, %s, %s, %s)
        returning {_COLUNAS_COMPLETAS}
        """,
        (
            _validar_titulo(titulo),
            _validar_conteudo(conteudo),
            _normalizar_pasta(pasta),
            _normalizar_tags(tags),
            autor,
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
    """Atualiza os campos presentes em `campos` (titulo, conteudo, pasta, tags).

    Se título ou conteúdo mudarem, grava a versão anterior na MESMA transação (nunca se perde o
    texto antigo) e poda para as `VERSOES_MAX` mais recentes. Edição sem mudança real não cria
    versão nem mexe em `atualizado_em`. Devolve o documento ou `None` se não existir.
    """
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
                }
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
                    set titulo = %s, conteudo = %s, pasta = %s, tags = %s,
                        atualizado_em = now()
                    where id = %s
                    returning {_COLUNAS_COMPLETAS}
                    """,
                    (
                        novo["titulo"],
                        novo["conteudo"],
                        novo["pasta"],
                        novo["tags"],
                        documento_id,
                    ),
                )
                return cur.fetchone()


def arquivar(documento_id: int, arquivado: bool = True) -> Optional[dict]:
    """Arquiva ou desarquiva. Não conta como edição (sem versão)."""
    return db.um(
        f"""
        update documentos set arquivado = %s, atualizado_em = now()
        where id = %s
        returning {_COLUNAS_COMPLETAS}
        """,
        (arquivado, documento_id),
    )


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

_PALAVRA = re.compile(r"[a-z0-9]+")
_SUFIXOS = ("oes", "aes", "ao", "s")
_APROXIMADA_MAX_DOCS = 2000


def _sem_acento(texto: str) -> str:
    """Minúsculas e sem acentos, preservando o tamanho (índices alinham com o original)."""
    saida = []
    for letra in texto:
        base = "".join(
            c for c in unicodedata.normalize("NFD", letra) if not unicodedata.combining(c)
        )
        saida.append((base[:1] or letra).lower())
    return "".join(saida)


def _radical(palavra: str) -> str:
    """Radical grosseiro: tira plural e terminação -ão/-ões ("decisões" e "decisão" → "decis")."""
    for sufixo in _SUFIXOS:
        if palavra.endswith(sufixo) and len(palavra) - len(sufixo) >= 3:
            return palavra[: -len(sufixo)]
    return palavra


def _radicais(texto: str) -> list[str]:
    return [_radical(p) for p in _PALAVRA.findall(_sem_acento(texto))]


def _casa(radical_consulta: str, radicais_doc: set[str]) -> bool:
    if radical_consulta in radicais_doc:
        return True
    return len(radical_consulta) >= 5 and any(r.startswith(radical_consulta) for r in radicais_doc)


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
