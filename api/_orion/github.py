"""Ingestão do GitHub: webhook de PR mergeado (Requirement 5).

Quando o GitHub envia um webhook `pull_request` com `action=closed` e o PR foi
mergeado, o Worker (modelo barato) resume o diff em português e o resumo entra
no changelog do projeto. Assim os especialistas sabem o que mudou sem ninguém
precisar contar (product.md, "Tudo é observável").

Regras que este módulo materializa:
- Assinatura obrigatória (Requirement 5.2): valida `X-Hub-Signature-256`
  (`sha256=` + HMAC-SHA256 do corpo BRUTO com `GITHUB_WEBHOOK_SECRET`), com
  comparação em tempo constante (`hmac.compare_digest`). Inválida → 401.
- Só processa PR mergeado (Requirement 5.7): evento diferente de
  `pull_request` closed+merged é ignorado com 200 `{"ignorado": true}`.
- Diff truncado (~12.000 chars) antes de ir ao modelo (Requirement 5.4).
- Upsert por (fonte='github', referencia=número do PR): um mesmo PR NÃO gera
  duas entradas em reentregas do webhook (Requirement 5.3).
- Aviso curto do Orquestrador no chat + atividades do agente `work` com
  `run_id = "gh-<numero>"` (Requirements 5.5, 5.6).

Convenções (tech.md): toda config vem de env lida DENTRO das funções; a chamada
ao modelo e a chamada HTTP ficam isoladas em funções próprias (`_resumir`,
`_buscar_arquivos`), para os testes as substituírem sem tocar na Anthropic nem
no GitHub. Registrar atividade nunca derruba o fluxo (via `emitir`).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from . import config, db, llm
from .atividades import emitir

logger = logging.getLogger("orion.github")

# Autor das mensagens escritas no chat (só o Orquestrador escreve — Req. 3.6).
AUTOR_ORQ = "Orquestrador"

# Limite de caracteres do texto enviado ao modelo (Requirement 5.4).
LIMITE_DIFF = 12_000

# Timeout da chamada ao GitHub (design.md, "Webhook do GitHub").
TIMEOUT_GITHUB = 15.0

# Prompt do worker para resumir o PR (Requirement 5.1).
_PROMPT_RESUMO = (
    "Você resume Pull Requests do app Orion para o histórico do projeto. "
    "Resuma em português, em 3 a 6 linhas, o que mudou para o usuário e "
    "tecnicamente. Não invente: use apenas o que estiver no texto do PR."
)


def assinatura_valida(corpo: bytes, cabecalho: Optional[str]) -> bool:
    """Valida `X-Hub-Signature-256` do webhook (Requirement 5.2).

    O cabeçalho tem o formato `sha256=<hex>`, onde `<hex>` é o HMAC-SHA256 do
    corpo BRUTO da requisição usando `GITHUB_WEBHOOK_SECRET` como chave. A
    comparação usa `hmac.compare_digest` (tempo constante). Sem segredo
    configurado ou cabeçalho ausente/mal formado → inválida.
    """
    segredo = config.github_webhook_secret()
    if not segredo or not cabecalho:
        return False
    if not cabecalho.startswith("sha256="):
        return False

    recebida = cabecalho[len("sha256="):]
    esperada = hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(recebida, esperada)


def _e_pr_mergeado(evento: Optional[str], corpo: dict) -> bool:
    """Diz se o webhook é um PR fechado por merge (Requirements 5.1, 5.7)."""
    if evento != "pull_request":
        return False
    if corpo.get("action") != "closed":
        return False
    pr = corpo.get("pull_request") or {}
    return bool(pr.get("merged"))


def _buscar_arquivos(pr_url: str) -> list[dict]:
    """Busca os arquivos alterados do PR: `GET {pr_url}/files` (Requirement 5.1).

    Usa `Authorization: Bearer GITHUB_TOKEN` e timeout de 15 s (httpx). Isolada
    para os testes a substituírem sem chamar o GitHub. Import tardio de httpx
    para não exigir a dependência em quem só importa o módulo.
    """
    import httpx

    token = config.github_token()
    cabecalhos = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
    }
    resposta = httpx.get(
        f"{pr_url}/files", headers=cabecalhos, timeout=TIMEOUT_GITHUB
    )
    resposta.raise_for_status()
    dados = resposta.json()
    return dados if isinstance(dados, list) else []


def _montar_texto_pr(corpo_pr: dict, arquivos: list[dict]) -> str:
    """Monta o texto do PR (título, descrição e patches) para o modelo.

    Junta o título e o corpo do PR com os patches de cada arquivo alterado e
    trunca o total em ~12.000 caracteres (Requirement 5.4).
    """
    titulo = str(corpo_pr.get("title") or "")
    descricao = str(corpo_pr.get("body") or "")

    partes = [f"Título: {titulo}", f"Descrição: {descricao}", "", "Arquivos alterados:"]
    for arquivo in arquivos:
        nome = arquivo.get("filename", "?")
        patch = arquivo.get("patch")
        partes.append(f"\n--- {nome} ---")
        if patch:
            partes.append(str(patch))

    texto = "\n".join(partes)
    if len(texto) > LIMITE_DIFF:
        texto = texto[:LIMITE_DIFF] + "\n… (diff truncado)"
    return texto


def _resumir(texto_pr: str, run_id: Optional[str] = None) -> str:
    """Pede ao WORKER um resumo em português do PR (Requirements 5.1, 5.4).

    Isolada para os testes a substituírem por um fake sem chamar a Anthropic.
    Registra os tokens gastos numa atividade `pensando` do agente `work`.
    """
    modelo = llm.worker()
    resposta = modelo.invoke(
        [SystemMessage(content=_PROMPT_RESUMO), HumanMessage(content=texto_pr)]
    )
    emitir(run_id, "work", "pensando", "Resumo do PR gerado.",
           tokens=llm.tokens(resposta))
    return llm.texto(resposta)


def _upsert_changelog(
    referencia: str, titulo: str, resumo: str, url: Optional[str], autor: Optional[str]
) -> None:
    """Grava o resumo do PR no changelog sem duplicar (Requirement 5.3).

    Upsert por (fonte='github', referencia): na reentrega do mesmo webhook, o
    `on conflict` atualiza a linha existente em vez de criar outra. O índice
    único `changelog_ref_idx` cobre (fonte, referencia) quando referencia não
    é nula.
    """
    db.executar(
        """
        insert into changelog (fonte, referencia, titulo, resumo, url, autor)
        values ('github', %s, %s, %s, %s, %s)
        on conflict (fonte, referencia) where referencia is not null
        do update set titulo = excluded.titulo,
                      resumo = excluded.resumo,
                      url = excluded.url,
                      autor = excluded.autor
        """,
        (referencia, titulo, resumo, url, autor),
    )


def processar_pr(corpo: dict) -> dict:
    """Processa um PR mergeado: resume, grava no changelog e avisa no chat.

    Passos (Requirements 5.1, 5.3, 5.5, 5.6):
    1. Emite atividades do agente `work` com `run_id = "gh-<numero>"`.
    2. Busca os arquivos do PR e monta o texto (título + descrição + patches,
       truncado).
    3. Pede o resumo ao worker.
    4. Faz upsert no changelog (fonte='github', referencia=número do PR).
    5. Posta no chat uma linha curta do Orquestrador: "Novo no Orion: PR #n — título".

    Devolve `{"ok": true, "pr": <numero>}`. Falha ao buscar arquivos/resumir é
    propagada para a rota decidir o status (o GitHub reentrega em erro).
    """
    pr = corpo.get("pull_request") or {}
    numero = pr.get("number")
    run_id = f"gh-{numero}"
    titulo = str(pr.get("title") or f"PR #{numero}")
    url = pr.get("html_url")
    autor = (pr.get("user") or {}).get("login")

    emitir(run_id, "work", "inicio", f"Resumindo PR #{numero}: {titulo}")

    pr_url = pr.get("url") or ""
    arquivos = _buscar_arquivos(pr_url)
    emitir(run_id, "work", "ferramenta", f"buscar_arquivos(PR #{numero}) → {len(arquivos)} arquivo(s)")

    texto_pr = _montar_texto_pr(pr, arquivos)
    resumo = _resumir(texto_pr, run_id)

    _upsert_changelog(f"PR #{numero}", titulo, resumo, url, autor)

    # Aviso curto do Orquestrador no chat (Requirement 5.5).
    aviso = f"Novo no Orion: PR #{numero} — {titulo}"
    db.salvar_mensagem(AUTOR_ORQ, aviso, run_id)

    emitir(run_id, "work", "concluiu", f"PR #{numero} registrado no changelog.")
    return {"ok": True, "pr": numero}
