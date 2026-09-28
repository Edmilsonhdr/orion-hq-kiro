"""Resumo semanal automático (Requirement 10).

Toda segunda às 09:00 (São Paulo) o Vercel Cron chama a rota do resumo. Este
módulo monta o resumo das mudanças/decisões dos últimos 7 dias com o modelo
worker e posta como mensagem do Orquestrador no chat, para os sócios começarem
a semana alinhados.

Regras (Requirements 10.1, 10.3):
- Usa o changelog dos últimos 7 dias como base.
- Se não houver mudanças na semana, a mensagem diz isso em uma linha (sem
  chamar o modelo).

Convenções (tech.md): config lida dentro das funções; a chamada ao modelo fica
isolada em `_redigir_resumo`, para os testes a substituírem sem tocar na
Anthropic. Só o Orquestrador escreve no chat (Requirement 3.6).
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage

from . import db, llm
from . import ferramentas as ferramentas_mod

logger = logging.getLogger("orion.resumo")

# Autor das mensagens escritas no chat (só o Orquestrador escreve — Req. 3.6).
AUTOR_ORQ = "Orquestrador"

# Janela do resumo, em dias (Requirement 10.1).
DIAS = 7

# Mensagem quando não houve mudanças na semana (Requirement 10.3).
SEM_MUDANCAS = (
    "Resumo da semana: nenhuma mudança registrada no projeto nos últimos 7 dias."
)

# Texto que `mudancas_recentes` devolve quando não há itens (para detectar o
# caso "sem mudanças" sem consultar o banco duas vezes).
_PREFIXO_VAZIO = "Nenhuma mudança no changelog"

_PROMPT_RESUMO = (
    "Você é o Orquestrador do Orion HQ. Escreva um resumo semanal curto para "
    "Dimi e Jullyana, em português do Brasil, com base SOMENTE nas mudanças e "
    "decisões listadas abaixo. Destaque o que mudou para o usuário e as "
    "decisões tomadas. Não invente nada além do que está no contexto. "
    "Comece com uma linha de abertura amistosa."
)


def _redigir_resumo(contexto: str) -> str:
    """Pede ao WORKER o texto do resumo semanal (Requirement 10.1).

    Isolada para os testes a substituírem por um fake sem chamar a Anthropic.
    """
    modelo = llm.worker()
    resposta = modelo.invoke(
        [SystemMessage(content=_PROMPT_RESUMO), HumanMessage(content=contexto)]
    )
    return llm.texto(resposta)


def resumo_semanal() -> dict:
    """Gera o resumo da semana e o posta como mensagem do Orquestrador.

    Fluxo (Requirements 10.1, 10.3):
    1. Coleta as mudanças dos últimos 7 dias do changelog.
    2. Se não houver mudanças, posta a linha `SEM_MUDANCAS` sem chamar o modelo.
    3. Caso contrário, pede o resumo ao worker e posta no chat.

    Devolve `{"status": "sem_mudancas" | "resumido", "resposta": <texto>}`.
    """
    contexto = ferramentas_mod._mudancas_recentes(DIAS)

    if contexto.startswith(_PREFIXO_VAZIO):
        db.salvar_mensagem(AUTOR_ORQ, SEM_MUDANCAS)
        return {"status": "sem_mudancas", "resposta": SEM_MUDANCAS}

    resumo = _redigir_resumo(contexto)
    db.salvar_mensagem(AUTOR_ORQ, resumo)
    return {"status": "resumido", "resposta": resumo}
