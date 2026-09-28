"""Especialistas (N2) e o loop de ferramentas próprio.

Regra do projeto (tech.md / design.md): NÃO usamos `create_react_agent` /
`create_agent` do LangChain. O loop de chamadas de ferramenta é próprio, para
que possamos registrar uma atividade a cada passo (product.md, "Tudo é
observável") e controlar o número de voltas (product.md, "Sem loops").

As chamadas ao modelo ficam isoladas em `llm.principal()`, para que os testes
possam substituí-la por um fake sem tocar na API da Anthropic (design.md,
Testing Strategy).

Especialistas expostos:
- `tech(instrucao, run_id)` — o que mudou/foi construído no Orion (PRs, notas,
  decisões técnicas). DEVE citar PR/nota e data; se não encontrar, diz isso
  explicitamente (Requirements 4.2, 4.3).
- `negocios(instrucao, run_id)` — custos, métricas e decisões de negócio. NÃO
  inventa números; se não houver dado, diz isso (Requirement 7.2).
- `propor_reuniao(instrucao, run_id)` — o agente Agenda produz uma proposta
  ESTRUTURADA de reunião (título, início, duração, participantes, pauta),
  usando as mudanças dos últimos 7 dias para a pauta (Requirements 6.1, 6.2).
"""

from __future__ import annotations

import logging
from typing import Any, Optional, Sequence

from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from pydantic import BaseModel, Field

from . import config, llm
from . import ferramentas as ferramentas_mod
from .atividades import emitir

logger = logging.getLogger("orion.especialistas")


def _formatar_args(args: Any) -> str:
    """Formata os argumentos de uma tool call de forma legível.

    Ex.: `{"consulta": "onboarding"}` -> `consulta='onboarding'`. Usado no
    detalhe da atividade `ferramenta` (Requirement 4.4). Se `args` não for um
    dict (formato inesperado), cai para `str(args)`.
    """
    if isinstance(args, dict):
        return ", ".join(f"{chave}={valor!r}" for chave, valor in args.items())
    return str(args)


def _indexar_ferramentas(ferramentas: Sequence[Any]) -> dict[str, Any]:
    """Mapeia nome da tool -> objeto tool, para invocar pela `tool_call`."""
    indice: dict[str, Any] = {}
    for ferramenta in ferramentas:
        nome = getattr(ferramenta, "name", None)
        if nome:
            indice[nome] = ferramenta
    return indice


def _invocar_ferramenta(indice: dict[str, Any], nome: str, args: Any) -> str:
    """Invoca uma tool pelo nome; erro vira texto para o modelo.

    Regra do design (Error Handling): um erro numa ferramenta não derruba o
    loop — ele é transformado em `"erro ao executar: ..."` e devolvido ao
    modelo como conteúdo do `ToolMessage`, para que ele decida o que fazer.
    """
    ferramenta = indice.get(nome)
    if ferramenta is None:
        return f"erro ao executar: ferramenta desconhecida {nome!r}"
    try:
        return str(ferramenta.invoke(args))
    except Exception as exc:  # noqa: BLE001 — vira texto para o modelo, não derruba o loop
        logger.exception("Erro ao executar ferramenta %s", nome)
        return f"erro ao executar: {exc}"


def rodar_com_ferramentas(
    agente: str,
    sistema: str,
    instrucao: str,
    ferramentas: Sequence[Any],
    run_id: str | None,
    max_voltas: int = 6,
) -> str:
    """Loop de raciocínio + ferramentas de um especialista.

    Faz até `max_voltas` iterações: a cada volta, o modelo pensa (podendo pedir
    ferramentas); executamos as ferramentas pedidas e devolvemos o resultado;
    quando o modelo responde sem pedir ferramenta, encerramos. Cada passo emite
    uma atividade (`inicio`, `pensando`, `ferramenta`, `concluiu`).

    Retorna o texto final do modelo.
    """
    modelo = llm.principal().bind_tools(list(ferramentas))
    indice = _indexar_ferramentas(ferramentas)

    msgs: list[Any] = [SystemMessage(content=sistema), HumanMessage(content=instrucao)]
    emitir(run_id, agente, "inicio", instrucao)

    ai: Any = None
    for _ in range(max_voltas):
        ai = modelo.invoke(msgs)
        emitir(run_id, agente, "pensando", tokens=llm.tokens(ai))
        msgs.append(ai)

        chamadas = getattr(ai, "tool_calls", None) or []
        if not chamadas:
            break

        for chamada in chamadas:
            nome = chamada.get("name", "")
            args = chamada.get("args", {})
            emitir(run_id, agente, "ferramenta", f"{nome}({_formatar_args(args)})")
            saida = _invocar_ferramenta(indice, nome, args)
            msgs.append(ToolMessage(content=saida, tool_call_id=chamada.get("id")))

    if ai is None:
        # max_voltas <= 0 (não deve acontecer): responde vazio sem quebrar.
        ai = AIMessage(content="")

    final = llm.texto(ai)
    emitir(run_id, agente, "concluiu", final[:200])
    return final


# --- Prompts de sistema ---


def _prompt_tech() -> str:
    """Prompt do agente Tech (produto/código/PRs)."""
    return (
        "Você é o Tech, especialista do Orion HQ em produto e código do app Orion. "
        "Responde o que mudou ou foi construído: PRs, notas e decisões técnicas.\n"
        f"Data e hora atual: {config.agora_formatado()} (fuso America/Sao_Paulo).\n\n"
        "Regras inegociáveis:\n"
        "- Nada inventado. Sempre consulte o histórico (changelog) com as "
        "ferramentas antes de responder.\n"
        "- Cite a fonte de cada item: o PR (ex.: PR #12) ou a nota, junto com a "
        "data. Use as datas e referências que vierem das ferramentas.\n"
        "- Se não encontrar nada sobre o que foi perguntado, diga explicitamente "
        "que não encontrou — não preencha lacunas com suposições.\n"
        "Responda em português do Brasil, de forma direta e objetiva."
    )


def _prompt_negocios() -> str:
    """Prompt do agente Negócios (custos, métricas, decisões)."""
    return (
        "Você é o Negócios, especialista do Orion HQ em custos, métricas, "
        "assinaturas e decisões de negócio do Orion.\n"
        f"Data e hora atual: {config.agora_formatado()} (fuso America/Sao_Paulo).\n\n"
        "Regras inegociáveis:\n"
        "- Nada inventado. Consulte o histórico (changelog) com as ferramentas "
        "antes de responder e cite a fonte (PR/nota/decisão) e a data.\n"
        "- Nunca invente números (custos, métricas, receitas). Se não houver o "
        "dado no histórico, diga explicitamente que não há esse dado.\n"
        "- Quando os sócios combinarem algo que deva ficar registrado, use a "
        "ferramenta de registrar decisão.\n"
        "Responda em português do Brasil, de forma direta e objetiva."
    )


# --- Especialistas expostos ---


def tech(instrucao: str, run_id: str | None) -> str:
    """Especialista Tech: consulta o changelog e responde citando fontes."""
    return rodar_com_ferramentas(
        "tech",
        _prompt_tech(),
        instrucao,
        ferramentas_mod.FERRAMENTAS_TECH,
        run_id,
    )


def negocios(instrucao: str, run_id: str | None) -> str:
    """Especialista Negócios: custos/métricas/decisões, sem inventar números."""
    return rodar_com_ferramentas(
        "negocios",
        _prompt_negocios(),
        instrucao,
        ferramentas_mod.FERRAMENTAS_NEGOCIOS,
        run_id,
    )


# --- Agenda: proposta estruturada de reunião (Requirements 6.1, 6.2) ---


class PropostaReuniao(BaseModel):
    """Proposta estruturada de reunião produzida pelo agente Agenda.

    Campos em português (snake_case). O `inicio` é ISO 8601 com offset do fuso
    de São Paulo (ex.: `2026-09-29T15:00:00-03:00`), para que datas relativas
    ("terça", "amanhã") já venham resolvidas (Requirement 6.2). A `pauta` é
    montada a partir das mudanças dos últimos 7 dias (Requirement 6.1).
    """

    titulo: str = Field(description="Título curto e claro da reunião.")
    inicio: str = Field(
        description=(
            "Data e hora de início em ISO 8601 com offset de fuso, resolvida "
            "para a próxima ocorrência no fuso America/Sao_Paulo "
            "(ex.: 2026-09-29T15:00:00-03:00)."
        )
    )
    duracao_min: int = Field(description="Duração da reunião em minutos.")
    participantes: list[str] = Field(
        description="Nomes dos participantes (ex.: Dimi, Jullyana)."
    )
    pauta: list[str] = Field(
        description=(
            "Itens da pauta, baseados nas mudanças recentes do projeto "
            "(últimos 7 dias)."
        )
    )


def problema_inicio(inicio: Any) -> Optional[str]:
    """Diz por que o `inicio` de uma proposta é inválido, ou None se estiver ok.

    Exige ISO 8601 com fuso e no futuro. Uma proposta com problema não vai
    para aprovação: a Agenda devolve um relatório e o grafo não pausa.
    """
    try:
        momento = config.ler_iso(inicio)
    except (TypeError, ValueError):
        return f'a data de início "{inicio}" não está no formato ISO 8601'
    if momento.tzinfo is None:
        return f'a data de início "{inicio}" não informa o fuso horário'
    if momento <= config.agora():
        return f'a data de início "{inicio}" já passou'
    return None


def _prompt_agenda(contexto_mudancas: str) -> str:
    """Prompt de sistema do agente Agenda para montar a proposta.

    Informa a data/hora atual e o fuso, para resolver datas relativas
    (Requirement 6.2), e injeta o contexto das mudanças dos últimos 7 dias,
    para compor a pauta (Requirement 6.1).
    """
    return (
        "Você é a Agenda, especialista do Orion HQ que propõe reuniões entre os "
        "sócios Dimi e Jullyana.\n"
        f"Data e hora atual: {config.agora_formatado()} (fuso America/Sao_Paulo).\n\n"
        "Ao propor uma reunião:\n"
        "- Resolva datas relativas (\"terça\", \"amanhã\", \"semana que vem\") "
        "para a PRÓXIMA ocorrência no fuso America/Sao_Paulo. O campo `inicio` "
        "deve ser ISO 8601 com o offset do fuso (ex.: 2026-09-29T15:00:00-03:00).\n"
        "- Se nenhum horário for indicado, escolha um horário comercial razoável.\n"
        "- Monte a `pauta` a partir das mudanças recentes do projeto (últimos 7 "
        "dias) listadas abaixo. Não invente itens que não estejam no contexto.\n"
        "- Os participantes padrão são Dimi e Jullyana, salvo indicação em "
        "contrário.\n\n"
        "Mudanças dos últimos 7 dias (contexto para a pauta):\n"
        f"{contexto_mudancas}"
    )


def propor_reuniao(instrucao: str, run_id: str | None) -> dict:
    """Agente Agenda: produz uma proposta estruturada de reunião.

    Usa as mudanças dos últimos 7 dias como contexto da pauta (Requirement 6.1)
    e pede ao modelo uma saída estruturada `PropostaReuniao`, com datas
    relativas já resolvidas para o fuso de São Paulo (Requirement 6.2).

    Retorna a proposta como `dict` (o estado do grafo guarda `proposta: dict`).
    Se o `inicio` for inválido (ver `problema_inicio`), a proposta volta com a
    chave `problema` explicando o motivo.
    """
    emitir(run_id, "agenda", "inicio", instrucao)

    contexto = ferramentas_mod._mudancas_recentes(7)
    sistema = _prompt_agenda(contexto)

    modelo = llm.principal().with_structured_output(PropostaReuniao)
    resultado = modelo.invoke(
        [SystemMessage(content=sistema), HumanMessage(content=instrucao)]
    )

    proposta = resultado.model_dump()
    problema = problema_inicio(proposta.get("inicio"))
    if problema:
        proposta["problema"] = problema
        emitir(run_id, "agenda", "concluiu", f"Proposta inválida: {problema}.")
    else:
        emitir(run_id, "agenda", "concluiu", proposta.get("titulo", ""))
    return proposta
