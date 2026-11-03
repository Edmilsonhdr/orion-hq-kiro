"""Guardião de docs: compara as mudanças recentes do changelog com os guias do produto e PROPÕE atualizações.

Nunca grava em `documentos`: cada atualização vira uma aprovação `editar_documento` (tela Aprovações), como
qualquer outra proposta de agente. Fluxo:

1. Mudanças dos últimos dias (changelog). Sem mudanças, nada a fazer.
2. O WORKER escolhe, entre os documentos das pastas do produto, os que as mudanças deixaram desatualizados.
3. Para cada um (no máximo `MAX_DOCS`), o modelo principal devolve AJUSTES pontuais `{antes, depois}`.
   Cada `antes` precisa existir exatamente uma vez no texto; ajuste que não casa é descartado, então o
   modelo nunca reescreve o documento inteiro nem inventa o que não está lá.
4. O texto com os ajustes aplicados vira a proposta de edição (a aprovação mostra o diff).

Documentos que já têm uma edição pendente são pulados.
"""

from __future__ import annotations

import logging
from typing import Callable, Optional

from pydantic import BaseModel, Field

from . import config, db, documentos, llm, propostas_docs
from . import ferramentas as ferramentas_mod
from .atividades import emitir

logger = logging.getLogger("orion.guardiao")

PASTAS = ("Orion (guia de uso)", "Orion (produto)")
MAX_DOCS = 3
MAX_CHARS_DOC = 80_000
DIAS = 7
AGENTE = "tech"
_SEM_MUDANCAS = "Nenhuma mudança no changelog"


class Candidato(BaseModel):
    documento_id: int = Field(description="id do documento da lista.")
    motivo: str = Field(description="Em uma frase, o que mudou e por que o documento ficou desatualizado.")


class Escolha(BaseModel):
    documentos: list[Candidato] = Field(default_factory=list, description="Só documentos realmente afetados; pode ser vazio.")


class Ajuste(BaseModel):
    antes: str = Field(description="Trecho EXATO do documento atual (aparece uma única vez), o menor que identifique o ponto.")
    depois: str = Field(description="Como esse trecho deve ficar.")


class Revisao(BaseModel):
    ajustes: list[Ajuste] = Field(default_factory=list)
    resumo: str = Field(description="Uma frase com o que foi atualizado.")


def aplicar_ajustes(conteudo: str, ajustes: list[Ajuste]) -> tuple[str, int]:
    """Aplica os ajustes que casam exatamente uma vez; devolve (texto novo, quantos foram aplicados)."""
    novo, aplicados = conteudo, 0
    for a in ajustes:
        if a.antes and a.antes != a.depois and novo.count(a.antes) == 1:
            novo = novo.replace(a.antes, a.depois, 1)
            aplicados += 1
    return novo, aplicados


def _escolher(mudancas: str, catalogo: str, limite: int) -> list[Candidato]:
    from langchain_core.messages import HumanMessage, SystemMessage

    sistema = (
        "Você é o Guardião de docs do Orion HQ. Recebe as mudanças recentes do produto Orion e a lista de "
        "documentos que o descrevem. Escolha, no máximo "
        f"{limite}, os documentos que essas mudanças deixaram DESATUALIZADOS em funcionalidade, tela, regra ou fluxo. "
        "Ignore refatorações, testes, dependências e correções que não mudam o que o usuário vê. Na dúvida, não escolha."
    )
    obj, tokens = llm.estruturado(
        llm.por_nome("haiku"), Escolha,
        [SystemMessage(content=sistema), HumanMessage(content=f"MUDANÇAS:\n{mudancas}\n\nDOCUMENTOS:\n{catalogo}")],
    )
    emitir(None, AGENTE, "pensando", "Guardião: escolheu os documentos a revisar.", tokens=tokens)
    return obj.documentos[:limite]


def _ajustar(titulo: str, conteudo: str, mudancas: str, motivo: str) -> Revisao:
    from langchain_core.messages import HumanMessage, SystemMessage

    sistema = (
        "Você atualiza documentação do produto Orion. Com base SOMENTE nas mudanças informadas, devolva ajustes "
        "pontuais no documento. Cada `antes` deve ser um trecho exato e único do texto atual. Não invente "
        "funcionalidades que as mudanças não mostram; se não der para ter certeza, não ajuste. Mantenha o estilo."
    )
    corpo = f"DOCUMENTO: {titulo}\nMOTIVO: {motivo}\n\nMUDANÇAS:\n{mudancas}\n\nTEXTO ATUAL:\n{conteudo}"
    obj, tokens = llm.estruturado(llm.principal(), Revisao, [SystemMessage(content=sistema), HumanMessage(content=corpo)])
    emitir(None, AGENTE, "pensando", f"Guardião: revisou “{titulo}”.", tokens=tokens)
    return obj


def _candidatos_do_catalogo() -> list[dict]:
    pendentes = {
        r["d"] for r in db.consultar(
            "select proposta->>'documento_id' as d from aprovacoes where tipo = %s and status = 'pendente'",
            (propostas_docs.TIPO_EDITAR,),
        )
    }
    docs = db.consultar(
        "select id, titulo, pasta, left(conteudo, 240) as trecho from documentos "
        "where not arquivado and pasta = any(%s) order by pasta, id",
        (list(PASTAS),),
    )
    return [d for d in docs if str(d["id"]) not in pendentes]


def revisar(
    dias: int = DIAS,
    max_docs: int = MAX_DOCS,
    escolher: Optional[Callable[[str, str, int], list[Candidato]]] = None,
    ajustar: Optional[Callable[[str, str, str, str], Revisao]] = None,
) -> dict:
    """Roda o Guardião. Devolve `{"status": "sem_mudancas" | "sem_propostas" | "propostas", "propostas": [...]}`."""
    mudancas = ferramentas_mod._mudancas_recentes(dias)
    if mudancas.startswith(_SEM_MUDANCAS):
        return {"status": "sem_mudancas", "propostas": []}
    candidatos = _candidatos_do_catalogo()
    if not candidatos:
        return {"status": "sem_propostas", "propostas": []}

    catalogo = "\n".join(f"- id {d['id']} · {d['titulo']} · {d['trecho'].replace(chr(10), ' ')[:200]}" for d in candidatos)
    escolhidos = (escolher or _escolher)(mudancas, catalogo, max_docs)
    por_id = {d["id"]: d for d in candidatos}
    run_id = f"guardiao-{config.agora():%Y%m%d%H%M}"
    propostas = []
    for c in escolhidos[:max_docs]:
        if c.documento_id not in por_id:
            continue
        doc = documentos.obter(c.documento_id)
        if doc is None or len(doc["conteudo"]) > MAX_CHARS_DOC:
            continue
        try:
            revisao = (ajustar or _ajustar)(doc["titulo"], doc["conteudo"], mudancas, c.motivo)
        except Exception:  # noqa: BLE001 — um documento com problema não impede os outros
            logger.exception("Guardião não conseguiu revisar o documento %s", c.documento_id)
            continue
        novo, aplicados = aplicar_ajustes(doc["conteudo"], revisao.ajustes)
        if aplicados == 0:
            continue
        resposta = propostas_docs.propor_edicao(AGENTE, run_id, doc["id"], conteudo=novo)
        if not resposta.startswith("Proposta registrada"):
            continue
        propostas.append({"documento_id": doc["id"], "titulo": doc["titulo"], "motivo": c.motivo,
                          "resumo": revisao.resumo, "ajustes": aplicados})

    if not propostas:
        return {"status": "sem_propostas", "propostas": []}
    linhas = "\n".join(f"- **{p['titulo']}**: {p['resumo'] or p['motivo']}" for p in propostas)
    db.salvar_mensagem(
        "Orquestrador",
        f"O Guardião de docs encontrou {len(propostas)} documento{'' if len(propostas) == 1 else 's'} "
        f"desatualizado{'' if len(propostas) == 1 else 's'} e propôs a atualização (veja em Aprovações):\n{linhas}",
    )
    return {"status": "propostas", "propostas": propostas}
