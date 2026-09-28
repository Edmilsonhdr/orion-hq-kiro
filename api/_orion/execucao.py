"""Execução de um run do grafo (entrada do chat e retomada de aprovações).

Este módulo amarra o grafo (`grafo.py`) ao chat do grupo: recebe uma mensagem,
roda o `StateGraph` com o checkpointer do Postgres e salva a resposta do
Orquestrador. Também retoma um run pausado quando uma aprovação é decidida.

Restrições da Vercel que moldam o código (tech.md / design.md):
- Cada mensagem é um run novo (`thread_id = run_id`), para não acumular
  contexto infinito; a continuidade vem do `historico` (últimas 12 mensagens).
- Nada fica rodando esperando humano: a aprovação usa `interrupt()`; o estado
  vai para o Postgres, a função termina e uma nova requisição retoma com
  `Command(resume=...)`. Por isso a aprovação funciona mesmo horas depois
  (Requirement 6.7).

Regras de comportamento:
- Atalho `/nota `: registra o texto como nota no histórico do projeto SEM
  chamar o modelo e responde "Anotado no histórico do projeto." (Requirement 2.5).
- Erro no run: registra atividade `erro` (mensagem curta) e responde no chat
  com um pedido curto para tentar de novo, sem expor stack trace; o log
  completo fica no servidor (Requirement 2.7).
- Só o Orquestrador escreve no chat (Requirement 3.6): as respostas são salvas
  com autor "Orquestrador".
"""

from __future__ import annotations

import logging
import secrets
from typing import Any, Optional

from langgraph.types import Command

from . import db
from .atividades import emitir

logger = logging.getLogger("orion.execucao")

# Autor das mensagens escritas pelo Orquestrador no chat (Requirement 3.6).
AUTOR_ORQ = "Orquestrador"

# Prefixo do atalho de nota (Requirement 2.5).
PREFIXO_NOTA = "/nota "

# Mensagem curta e amigável quando o run falha (Requirement 2.7). Sem stack
# trace: o detalhe técnico vai só para o log do servidor.
MSG_ERRO = (
    "Tive um problema para processar seu pedido agora. "
    "Pode tentar de novo em instantes?"
)


def _novo_run_id() -> str:
    """Gera um `run_id` curto e único para um run do grafo.

    12 caracteres hexadecimais (48 bits) bastam para o volume do Orion HQ
    (dois usuários) e mantêm o id legível nas atividades e no thread_id.
    """
    return secrets.token_hex(6)


def _config(run_id: str) -> dict:
    """Config do run: `thread_id = run_id` e `recursion_limit=30`.

    Mesmo formato usado nos testes do grafo e descrito no design.md
    ("Execução de um run").
    """
    return {"configurable": {"thread_id": run_id}, "recursion_limit": 30}


def _registrar_nota(texto: str) -> None:
    """Salva uma nota no histórico do projeto (changelog, fonte 'nota').

    Sem referência de PR (referencia = null). O texto vira o resumo; o título é
    uma etiqueta curta para aparecer na busca/listagem do changelog.
    """
    db.executar(
        """
        insert into changelog (fonte, referencia, titulo, resumo, autor)
        values ('nota', null, %s, %s, %s)
        """,
        ("Nota", texto, None),
    )


def _finalizar(grafo_compilado: Any, run_id: str) -> dict:
    """Lê o estado final do run e devolve a resposta (ou o status pausado).

    Segue a finalização do design.md: pega o snapshot com `get_state`; se
    `snap.next` não estiver vazio, o grafo pausou no `interrupt()` e está
    aguardando aprovação — devolve `{"status": "aguardando_aprovacao"}` sem
    salvar mensagem. Caso contrário, salva `snap.values["resposta"]` como
    mensagem do Orquestrador vinculada ao `run_id` (Requirement 2.2) e devolve
    `{"status": "respondido", "resposta": ...}`.
    """
    snap = grafo_compilado.get_state(_config(run_id))

    if snap.next:
        # Grafo pausado no interrupt: aguardando decisão humana.
        return {"status": "aguardando_aprovacao", "run_id": run_id}

    valores = snap.values or {}
    resposta = valores.get("resposta") or ""
    db.salvar_mensagem(AUTOR_ORQ, resposta, run_id)
    return {"status": "respondido", "run_id": run_id, "resposta": resposta}


def _tratar_erro(run_id: str) -> dict:
    """Lida com uma falha no run: atividade `erro` + mensagem amigável no chat.

    Não expõe stack trace ao usuário (Requirement 2.7); o traceback completo já
    foi logado por quem chamou (via `logger.exception`). Registrar atividade e
    salvar a mensagem não podem, por sua vez, derrubar tudo: `emitir` já engole
    exceções e o `salvar_mensagem` fica protegido.
    """
    emitir(run_id, "orq", "erro", "Falha ao processar o pedido.")
    try:
        db.salvar_mensagem(AUTOR_ORQ, MSG_ERRO, run_id)
    except Exception:  # noqa: BLE001 — não deixa o tratamento de erro derrubar o fluxo
        logger.exception("Falha ao salvar mensagem de erro no chat (run_id=%s)", run_id)
    return {"status": "erro", "run_id": run_id, "resposta": MSG_ERRO}


def conversar(autor: str, texto: str) -> dict:
    """Processa uma mensagem do chat do grupo.

    Fluxo (Requirements 2.1, 2.2, 2.5, 2.7, 3.6):

    1. Atalho `/nota `: se a mensagem começa com "/nota ", salva o restante como
       nota no histórico do projeto SEM chamar o modelo e responde
       "Anotado no histórico do projeto." (Requirement 2.5). A mensagem do
       usuário e a confirmação são salvas no chat.
    2. Caso contrário: salva a mensagem do usuário (autor + horário), gera um
       `run_id` novo, monta o `historico` (últimas 12 mensagens) e roda o grafo
       com `thread_id = run_id` (Requirements 2.1, 3.6). Ao terminar, salva a
       resposta do Orquestrador (Requirement 2.2); se o grafo pausou numa
       aprovação, devolve `{"status": "aguardando_aprovacao"}`.
    3. Erro em qualquer ponto do run: atividade `erro` + mensagem curta no chat,
       sem stack trace (Requirement 2.7).

    Devolve um dict com `status` (`respondido` | `aguardando_aprovacao` |
    `nota` | `erro`), o `run_id` (quando houver) e a `resposta` textual.
    """
    texto = texto or ""

    # 1. Atalho /nota: registra sem chamar o modelo (Requirement 2.5).
    if texto.startswith(PREFIXO_NOTA):
        conteudo_nota = texto[len(PREFIXO_NOTA):].strip()
        # Salva a própria mensagem do usuário no chat (autor + horário).
        db.salvar_mensagem(autor, texto)
        if not conteudo_nota:
            resposta = "Nota vazia: escreva algo depois de /nota."
        else:
            _registrar_nota(conteudo_nota)
            resposta = "Anotado no histórico do projeto."
        db.salvar_mensagem(AUTOR_ORQ, resposta)
        return {"status": "nota", "resposta": resposta}

    # 2. Mensagem normal: salva, monta o histórico e roda o grafo.
    # O histórico inclui a mensagem atual (salva antes), atendendo ao contexto
    # das últimas 12 mensagens (Requirement 2.6).
    db.salvar_mensagem(autor, texto, run_id=None)
    run_id = _novo_run_id()
    historico = db.historico_recente(12)

    estado_inicial = {
        "run_id": run_id,
        "autor": autor,
        "pedido": texto,
        "historico": historico,
        "passos": 0,
    }

    # Import tardio: evita exigir o checkpointer/Postgres em quem só importa o
    # módulo (ex.: testes que substituem `grafo_com_checkpoint`).
    from . import grafo

    emitir(run_id, "orq", "inicio", texto[:200])
    try:
        with grafo.grafo_com_checkpoint() as g:
            g.invoke(estado_inicial, _config(run_id))
            return _finalizar(g, run_id)
    except Exception:  # noqa: BLE001 — qualquer falha do run vira mensagem amigável
        logger.exception("Falha no run do grafo (run_id=%s)", run_id)
        return _tratar_erro(run_id)


def decidir_aprovacao(aprovacao_id: int, usuario: str, aprovado: bool) -> dict:
    """Decide uma aprovação pendente e retoma o run pausado.

    Fluxo (design.md, "Fluxo de aprovação" / Requirements 6.6, 6.7):

    1. Update ATÔMICO: marca a aprovação como `aprovada`/`recusada` apenas se
       ainda estiver `pendente`, gravando quem decidiu e quando, e devolvendo o
       `run_id`. Se nenhuma linha for atualizada (a outra pessoa decidiu
       primeiro, ou o id não existe), devolve `{"status": "ja_decidida"}`
       (Requirement 6.6).
    2. Retoma o grafo com `Command(resume={"aprovado":..., "por":...})` usando
       `thread_id = run_id`. Como o estado está no Postgres, isso funciona mesmo
       horas depois (Requirement 6.7).
    3. Finaliza igual a uma conversa: salva a resposta do Orquestrador no chat.

    Erros no resume seguem o mesmo tratamento amigável de `conversar`
    (atividade `erro` + mensagem curta, sem stack trace).
    """
    novo_status = "aprovada" if aprovado else "recusada"

    # 1. Update atômico condicionado a status = 'pendente' (Requirement 6.6).
    linha = db.um(
        """
        update aprovacoes
           set status = %s, decidido_por = %s, decidido_em = now()
         where id = %s and status = 'pendente'
        returning run_id
        """,
        (novo_status, usuario, aprovacao_id),
    )
    if linha is None:
        # Já decidida por alguém (ou id inexistente): a segunda decisão perde.
        return {"status": "ja_decidida"}

    run_id = linha["run_id"]

    # 2. Retoma o grafo com a decisão humana (Requirement 6.7).
    from . import grafo

    try:
        with grafo.grafo_com_checkpoint() as g:
            g.invoke(
                Command(resume={"aprovado": aprovado, "por": usuario}),
                _config(run_id),
            )
            # 3. Finaliza como uma conversa (salva a resposta do Orquestrador).
            return _finalizar(g, run_id)
    except Exception:  # noqa: BLE001 — falha no resume vira mensagem amigável
        logger.exception("Falha ao retomar run após aprovação (run_id=%s)", run_id)
        return _tratar_erro(run_id)
