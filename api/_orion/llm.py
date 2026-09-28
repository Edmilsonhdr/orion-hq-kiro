"""Modelos (Claude via langchain-anthropic) e helpers de mensagem.

Convenção do projeto (tech.md): as chamadas ao modelo ficam isoladas em funções
próprias e **toda configuração é lida dentro das funções**, para que os testes
possam substituir `principal`/`worker` sem tocar na API da Anthropic.

Só usamos `langchain-anthropic` para o modelo e as tools; nada de chains/agents
prontos do LangChain (o loop de ferramentas é próprio, ver especialistas.py).
"""

from __future__ import annotations

from typing import Any

from langchain_anthropic import ChatAnthropic

from . import config


def principal() -> ChatAnthropic:
    """Modelo principal (orquestrador e especialistas).

    Usa `config.orion_model()` e `config.anthropic_api_key()` — ambos lidos
    dentro da função, nunca no import.
    """
    return ChatAnthropic(
        model=config.orion_model(),
        api_key=config.anthropic_api_key(),
    )


def worker() -> ChatAnthropic:
    """Modelo worker (tarefas curtas/baratas, ex.: resumir diff de PR)."""
    return ChatAnthropic(
        model=config.worker_model(),
        api_key=config.anthropic_api_key(),
    )


def texto(msg: Any) -> str:
    """Extrai o texto de uma mensagem do modelo (AIMessage).

    O `content` de um AIMessage pode ser:
    - uma string simples; ou
    - uma lista de blocos, cada um um dict como `{"type": "text", "text": ...}`
      (ou outros tipos, ex.: `tool_use`, que ignoramos aqui).

    Concatena o texto de todos os blocos `text` na ordem. Se `content` for
    string, devolve como está. Nunca lança para formatos inesperados: retorna
    string vazia.
    """
    conteudo = getattr(msg, "content", msg)

    if isinstance(conteudo, str):
        return conteudo

    if isinstance(conteudo, list):
        partes: list[str] = []
        for bloco in conteudo:
            if isinstance(bloco, dict):
                if bloco.get("type") == "text" and isinstance(bloco.get("text"), str):
                    partes.append(bloco["text"])
            elif isinstance(bloco, str):
                partes.append(bloco)
        return "".join(partes)

    return ""


def estruturado(modelo: Any, esquema: Any, mensagens: list[Any]) -> tuple[Any, int]:
    """Invoca o modelo com saída estruturada e devolve (objeto, tokens).

    Usa `include_raw=True` para ter acesso ao `AIMessage` bruto e ler o
    `usage_metadata`. Se o modelo não produzir um objeto válido, lança
    ValueError (o run trata como erro).
    """
    saida = modelo.with_structured_output(esquema, include_raw=True).invoke(mensagens)
    objeto = saida.get("parsed")
    if objeto is None:
        raise ValueError(f"Saída estruturada inválida: {saida.get('parsing_error')}")
    return objeto, tokens(saida.get("raw"))


def tokens(msg: Any) -> int:
    """Total de tokens gastos numa resposta do modelo.

    Lê `usage_metadata["total_tokens"]`. Retorna 0 se o atributo não existir,
    não for dict, ou não tiver a chave (ex.: mensagens de teste sem metadados).
    """
    metadados = getattr(msg, "usage_metadata", None)
    if not isinstance(metadados, dict):
        return 0
    total = metadados.get("total_tokens", 0)
    try:
        return int(total)
    except (TypeError, ValueError):
        return 0
