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
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from . import comercial, config, db, llm
from . import ferramentas as ferramentas_mod
from .atividades import emitir

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
    "Dimi, Jullyana e Rayssa, em português do Brasil, com base SOMENTE nas mudanças e "
    "decisões listadas abaixo. Destaque o que mudou para o usuário e as "
    "decisões tomadas. Não invente nada além do que está no contexto. "
    "Comece com uma linha de abertura amistosa."
)


def _redigir_resumo(contexto: str, run_id: Optional[str] = None) -> str:
    """Pede ao WORKER o texto do resumo semanal (Requirement 10.1).

    Isolada para os testes a substituírem por um fake sem chamar a Anthropic.
    Registra os tokens gastos numa atividade `pensando` do agente `work`.
    """
    modelo = llm.worker()
    resposta = modelo.invoke(
        [SystemMessage(content=_PROMPT_RESUMO), HumanMessage(content=contexto)]
    )
    emitir(run_id, "work", "pensando", "Resumo semanal redigido.",
           tokens=llm.tokens(resposta))
    return llm.texto(resposta)


def resumo_comercial() -> bool:
    """Posta o resumo do funil (texto determinístico, sem modelo). `False` se não há negócios.

    Uma falha aqui não pode derrubar o resumo da semana, então é só registrada no log.
    """
    try:
        texto = comercial.texto_resumo_semanal()
        if texto is None:
            return False
        db.salvar_mensagem(AUTOR_ORQ, texto)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Falha ao montar o resumo comercial")
        return False


def resumo_semanal() -> dict:
    """Gera o resumo da semana e o posta como mensagem do Orquestrador.

    Fluxo (Requirements 10.1, 10.3):
    1. Coleta as mudanças dos últimos 7 dias do changelog.
    2. Se não houver mudanças, posta a linha `SEM_MUDANCAS` sem chamar o modelo.
    3. Caso contrário, pede o resumo ao worker e posta no chat.

    Depois posta o resumo comercial, se houver negócios. Devolve `{"status": "sem_mudancas" | "resumido",
    "resposta": <texto>, "comercial": <bool>}`.
    """
    contexto = ferramentas_mod._mudancas_recentes(DIAS)

    if contexto.startswith(_PREFIXO_VAZIO):
        db.salvar_mensagem(AUTOR_ORQ, SEM_MUDANCAS)
        return {"status": "sem_mudancas", "resposta": SEM_MUDANCAS, "comercial": resumo_comercial()}

    resumo = _redigir_resumo(contexto, f"resumo-{config.agora():%Y-%m-%d}")
    db.salvar_mensagem(AUTOR_ORQ, resumo)
    return {"status": "resumido", "resposta": resumo, "comercial": resumo_comercial()}


def _linhas_itens(itens: list[dict], limite: int = 8) -> list[str]:
    linhas = []
    for i in itens[:limite]:
        quando = f"{i['data'][8:]}/{i['data'][5:7]}" + (f" {i['hora'][:5]}" if i.get("hora") else "")
        linhas.append(f"- {quando}: {i['titulo']}")
    if len(itens) > limite:
        linhas.append(f"- … e mais {len(itens) - limite}")
    return linhas


def texto_resumo_diario(agenda: dict, aprovacoes: int, incidentes: int) -> str:
    """Resumo do dia em texto puro (sem modelo). Vazio quando não há nada a dizer."""
    blocos: list[str] = []
    if agenda["atrasados"]:
        blocos.append("**Atrasados**\n" + "\n".join(_linhas_itens(agenda["atrasados"])))
    if agenda["de_hoje"]:
        blocos.append("**Hoje**\n" + "\n".join(_linhas_itens(agenda["de_hoje"])))
    if agenda["proximos"]:
        blocos.append("**Próximos 7 dias**\n" + "\n".join(_linhas_itens(agenda["proximos"], 6)))
    espera = []
    if aprovacoes:
        espera.append(f"{aprovacoes} aprovaç{'ão' if aprovacoes == 1 else 'ões'} pendente{'' if aprovacoes == 1 else 's'}")
    if incidentes:
        espera.append(f"{incidentes} incidente{'' if incidentes == 1 else 's'} aberto{'' if incidentes == 1 else 's'}")
    if espera:
        blocos.append("**Esperando por vocês**\n- " + "\n- ".join(espera))
    if not blocos:
        return ""
    return "Bom dia! O resumo do dia no Orion HQ:\n\n" + "\n\n".join(blocos)


def resumo_diario() -> dict:
    """Posta o resumo do dia no chat (e por e-mail, se configurado). Sem pendências, não posta nada."""
    from . import calendario, emails

    agenda = calendario.agenda()
    aprovacoes = db.um("select count(*) as n from aprovacoes where status = 'pendente'")["n"]
    texto = texto_resumo_diario(agenda, int(aprovacoes), int(db.contar_incidentes_abertos()))
    if not texto:
        return {"status": "sem_pendencias", "emails": 0}
    db.salvar_mensagem(AUTOR_ORQ, texto)
    enviados = 0
    if emails.configurado():
        for usuario, endereco in config.emails().items():
            if emails.enviar(endereco, f"Orion HQ: resumo de {config.agora():%d/%m}", texto.replace("**", "")):
                enviados += 1
    return {"status": "enviado", "emails": enviados, "texto": texto}
