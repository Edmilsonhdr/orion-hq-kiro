"""Testes de `_orion/llm.py` (task 4.2).

Cobrem `texto()` (content string ou lista de blocos) e `tokens()` (com e sem
`usage_metadata`). Nenhum teste chama a API da Anthropic: usamos um objeto fake
que imita um AIMessage (atributos `content` e `usage_metadata`).

`principal()`/`worker()` apenas leem config e instanciam o modelo; a leitura de
config já é coberta por test_config, então aqui focamos nas funções puras.
"""

from dataclasses import dataclass, field
from typing import Any, Optional

from _orion import llm


@dataclass
class MensagemFake:
    """Imita o mínimo de um AIMessage: content e usage_metadata."""

    content: Any
    usage_metadata: Optional[dict] = field(default=None)


def test_texto_com_content_string():
    msg = MensagemFake(content="Olá, mundo")
    assert llm.texto(msg) == "Olá, mundo"


def test_texto_com_lista_de_blocos():
    msg = MensagemFake(
        content=[
            {"type": "text", "text": "Parte 1. "},
            {"type": "text", "text": "Parte 2."},
        ]
    )
    assert llm.texto(msg) == "Parte 1. Parte 2."


def test_texto_ignora_blocos_nao_texto():
    # Blocos como tool_use não têm texto e devem ser ignorados.
    msg = MensagemFake(
        content=[
            {"type": "text", "text": "resposta"},
            {"type": "tool_use", "name": "buscar", "input": {}},
        ]
    )
    assert llm.texto(msg) == "resposta"


def test_texto_lista_vazia_ou_formato_estranho():
    assert llm.texto(MensagemFake(content=[])) == ""
    assert llm.texto(MensagemFake(content=123)) == ""


def test_tokens_le_total_tokens():
    msg = MensagemFake(
        content="x",
        usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
    )
    assert llm.tokens(msg) == 15


def test_tokens_zero_sem_usage_metadata():
    assert llm.tokens(MensagemFake(content="x")) == 0


def test_tokens_zero_quando_chave_ausente():
    msg = MensagemFake(content="x", usage_metadata={"input_tokens": 3})
    assert llm.tokens(msg) == 0


def test_tokens_zero_com_valor_invalido():
    msg = MensagemFake(content="x", usage_metadata={"total_tokens": None})
    assert llm.tokens(msg) == 0
