"""Aplicação FastAPI do Orion HQ (função Python da Vercel).

Todas as rotas ficam sob `/api/*`. Este módulo adiciona o próprio diretório ao
`sys.path` para poder importar o pacote `_orion` (o prefixo `_` impede a Vercel
de tratar a pasta como uma função serverless separada).
"""

import os
import secrets
import sys

sys.path.append(os.path.dirname(__file__))

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import BaseModel

from _orion import atividades, auth, config, db

app = FastAPI(title="Orion HQ")


class Credenciais(BaseModel):
    """Corpo do login: usuário e senha (Requirement 1.1/1.2)."""

    usuario: str
    senha: str


class MensagemChat(BaseModel):
    """Corpo do `POST /chat`: o texto que o sócio enviou (Requirement 2.1)."""

    texto: str


class DecisaoAprovacao(BaseModel):
    """Corpo do `POST /aprovacoes/{id}`: aprovar ou recusar (Requirement 6.4/6.5)."""

    aprovado: bool


@app.post("/api/login")
def login(
    credenciais: Credenciais, request: Request, response: Response
) -> dict:
    """Autentica o usuário e grava o cookie de sessão assinado.

    Sucesso (Requirement 1.1): grava o cookie `orion_sessao` e responde 200.
    Falha (Requirement 1.2): responde 401 com mensagem genérica que não revela
    qual campo (usuário ou senha) estava errado.
    """
    if not auth.autenticar(credenciais.usuario, credenciais.senha):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha inválidos.",
        )
    auth.definir_cookie_sessao(response, credenciais.usuario, request)
    return {"usuario": credenciais.usuario}


@app.post("/api/logout")
def logout(request: Request, response: Response) -> dict:
    """Encerra a sessão removendo o cookie."""
    auth.limpar_cookie_sessao(response, request)
    return {"ok": True}


@app.get("/api/me")
def me(usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Devolve o usuário logado (401 sem sessão — Requirement 1.3).

    Inclui `aprovador` indicando se o usuário está em `ORION_APPROVERS`.
    """
    return {"usuario": usuario, "aprovador": usuario in config.aprovadores()}


@app.get("/api/atividades")
def listar_atividades(
    desde: int = 0, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Atividades para o polling incremental do escritório/log (Requirement 8.5).

    `desde` é o maior id já visto pelo front; devolve as atividades com
    `id > desde` em ordem crescente. Se `desde=0`, as últimas 80 (também em
    ordem crescente). Exige sessão.
    """
    return atividades.listar(desde)


@app.get("/api/atividades/tokens")
def tokens_atividades(
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Tokens gastos hoje por agente (Requirement 8.6).

    Retorna `{agente: tokens}` considerando o dia no fuso de São Paulo.
    Exige sessão.
    """
    return atividades.tokens_hoje()


@app.get("/api/mensagens")
def listar_mensagens(
    desde: int = 0, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Mensagens do chat para o polling incremental (Requirements 2.1, 2.3).

    `desde` é o maior id já visto pelo front; devolve as mensagens com
    `id > desde` em ordem crescente. Se `desde=0`, as últimas 50 (também em
    ordem crescente). Exige sessão.
    """
    return db.listar_mensagens(desde)


@app.post("/api/chat")
def chat(
    mensagem: MensagemChat,
    tarefas: BackgroundTasks,
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Recebe uma mensagem do chat do grupo (Requirement 2.1).

    Salva a mensagem (`execucao.receber`) e responde logo em seguida com
    `{"status": "processando", "run_id": ...}`; o grafo roda como tarefa em
    segundo plano (`execucao.processar`) e a resposta chega ao front pelo
    polling de mensagens. Na Vercel, a função só termina depois das tarefas em
    segundo plano. O atalho `/nota` é resolvido na hora. Exige sessão.
    """
    from _orion import execucao

    resultado, estado_inicial = execucao.receber(usuario, mensagem.texto)
    if estado_inicial is not None:
        tarefas.add_task(execucao.processar, estado_inicial)
    return resultado


@app.get("/api/aprovacoes")
def listar_aprovacoes(
    status: str | None = None, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Fila de aprovações (Requirement 9.1).

    Com `status` informado, filtra por ele; sem filtro, devolve pendentes
    primeiro e o histórico das decididas. Exige sessão.
    """
    return db.listar_aprovacoes(status)


@app.post("/api/aprovacoes/{aprovacao_id}")
def decidir_aprovacao(
    aprovacao_id: int,
    decisao: DecisaoAprovacao,
    usuario: str = Depends(auth.exigir_aprovador),
) -> dict:
    """Decide uma aprovação pendente e retoma o grafo (Requirements 6.4–6.6).

    Exige sessão e que o usuário seja aprovador (`exigir_aprovador` → 401 sem
    sessão, 403 se não-aprovador). Chama `execucao.decidir_aprovacao`. Se a
    aprovação já foi decidida (ou não existe), o resultado é
    `{"status": "ja_decidida"}`, devolvido com 200 conforme o design
    (Requirement 6.6).
    """
    from _orion import execucao

    return execucao.decidir_aprovacao(aprovacao_id, usuario, decisao.aprovado)


@app.post("/api/aprovacoes/{aprovacao_id}/retomar")
def retomar_aprovacao(
    aprovacao_id: int,
    usuario: str = Depends(auth.exigir_aprovador),
) -> dict:
    """Tenta de novo uma aprovação cuja retomada falhou (status `erro`).

    Só aprovadores. Usa a decisão já gravada. Se a aprovação não estiver com
    `erro`, responde 409.
    """
    from _orion import execucao

    resultado = execucao.retomar_aprovacao(aprovacao_id)
    if resultado.get("status") == "nao_retomavel":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só dá para tentar de novo aprovações que falharam.",
        )
    return resultado


@app.get("/api/reunioes")
def listar_reunioes(
    usuario: str = Depends(auth.usuario_atual),
) -> list[dict]:
    """Próximas reuniões (início a partir de agora), ordenadas por início.

    Exige sessão.
    """
    return db.proximas_reunioes()


@app.get("/api/reunioes/{reuniao_id}.ics")
def reuniao_ics(
    reuniao_id: int, usuario: str = Depends(auth.usuario_atual)
) -> Response:
    """Arquivo iCalendar (.ics) de uma reunião (Requirement 6.4).

    Gera um VCALENDAR/VEVENT simples com UID `reuniao-{id}@orion-hq`, datas em
    UTC (YYYYMMDDTHHMMSSZ), SUMMARY = título e DESCRIPTION = pauta (um item por
    linha). Content-type `text/calendar`. Reunião inexistente → 404. Exige
    sessão.
    """
    linha = db.reuniao(reuniao_id)
    if linha is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reunião não encontrada."
        )
    conteudo = _montar_ics(linha)
    return Response(content=conteudo, media_type="text/calendar")


def _montar_ics(reuniao: dict) -> str:
    """Monta o texto iCalendar (VCALENDAR/VEVENT) de uma reunião.

    Datas em UTC no formato `YYYYMMDDTHHMMSSZ`. A pauta (`text[]`) vira o
    DESCRIPTION com os itens separados por `\\n` (escapado como `\\n` literal no
    iCalendar). Linhas com CRLF, conforme a especificação do formato.
    """
    from _orion.grafo import _formato_utc

    reuniao_id = reuniao["id"]
    titulo = str(reuniao.get("titulo") or "Reunião")
    inicio = reuniao["inicio"]
    fim = reuniao["fim"]
    pauta = reuniao.get("pauta") or []
    if isinstance(pauta, (list, tuple)):
        descricao = "\\n".join(str(item) for item in pauta)
    else:
        descricao = str(pauta)

    # Timestamp de criação do evento (agora em UTC).
    carimbo = _formato_utc(config.agora())

    linhas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Orion HQ//PT-BR//",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:reuniao-{reuniao_id}@orion-hq",
        f"DTSTAMP:{carimbo}",
        f"DTSTART:{_formato_utc(inicio)}",
        f"DTEND:{_formato_utc(fim)}",
        f"SUMMARY:{titulo}",
        f"DESCRIPTION:{descricao}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(linhas) + "\r\n"


@app.post("/api/webhooks/github")
async def webhook_github(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
) -> dict:
    """Ingestão de PR mergeado do GitHub (Requirement 5).

    Rota pública (sem sessão): a autenticidade vem da assinatura HMAC do corpo.

    Fluxo:
    1. Lê o corpo BRUTO e valida `X-Hub-Signature-256` com
       `GITHUB_WEBHOOK_SECRET`; inválida → 401 (Requirement 5.2).
    2. Só processa `pull_request` com `action=closed` e `merged=true`; qualquer
       outro evento é ignorado com 200 `{"ignorado": true}` (Requirement 5.7).
    3. Delega ao `_orion.github.processar_pr` (busca arquivos, resume no worker,
       upsert no changelog, aviso no chat + atividades do agente `work`). PR já
       registrado ou sem `GITHUB_TOKEN` → 200 sem resumir; falha → 502.

    Import tardio de `github` para não exigir httpx/modelo em quem só importa o
    app (ex.: testes de outras rotas).
    """
    from _orion import github

    corpo_bruto = await request.body()

    if not github.assinatura_valida(corpo_bruto, x_hub_signature_256):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Assinatura do webhook inválida.",
        )

    import json

    try:
        corpo = json.loads(corpo_bruto or b"{}")
    except (ValueError, TypeError):
        corpo = {}

    if not github._e_pr_mergeado(x_github_event, corpo):
        return {"ignorado": True}

    try:
        return github.processar_pr(corpo)
    except Exception:  # noqa: BLE001 — já virou atividade `erro` e log no servidor
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao processar o PR.",
        )


@app.post("/api/webhooks/sentry")
async def webhook_sentry(
    request: Request,
    sentry_hook_resource: str | None = Header(default=None),
    sentry_hook_signature: str | None = Header(default=None),
) -> dict:
    """Ingestão de eventos de erro do Sentry (Vigia — Requirement 1).

    Rota pública (sem sessão): a autenticidade vem da assinatura HMAC do corpo,
    no mesmo padrão do webhook do GitHub.

    Fluxo:
    1. Lê o corpo BRUTO e valida `Sentry-Hook-Signature` com
       `SENTRY_CLIENT_SECRET`; assinatura inválida/ausente ou segredo vazio →
       401 (Requirements 1.1, 1.2).
    2. Desserializa o JSON de forma tolerante: payload malformado NUNCA pode dar
       500 (o Sentry reenviaria em loop); vira `{"ignorado": true}` (design,
       "Error Handling").
    3. `sentry.interpretar_payload` aplica a whitelist e a máscara. Recurso
       desconhecido ou sem `sentry_issue_id` → 200 `{"ignorado": true}`
       (Requirement 1.5).
    4. `sentry.processar_evento` registra/atualiza o incidente. Ações fora de
       `created`/`resolved`/`ignored` e do recurso `event_alert` são ignoradas
       com 200 `{"ignorado": true}` (Requirement 1.5).

    Import tardio de `sentry` para não exigir dependências pesadas em quem só
    importa o app (ex.: testes de outras rotas).
    """
    from _orion import sentry

    corpo_bruto = await request.body()

    if not sentry.verificar_assinatura(corpo_bruto, sentry_hook_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Assinatura do webhook inválida.",
        )

    import json

    # Parser tolerante: payload malformado responde 200 `{"ignorado": true}`,
    # nunca 500, para o Sentry não reenviar em loop.
    try:
        corpo = json.loads(corpo_bruto or b"{}")
    except (ValueError, TypeError):
        corpo = {}
    if not isinstance(corpo, dict):
        corpo = {}

    campos = sentry.interpretar_payload(sentry_hook_resource, corpo)
    if campos is None:
        return {"ignorado": True}

    resultado = sentry.processar_evento(campos)

    if resultado.get("resultado") == "ignorado":
        return {"ignorado": True}

    # TODO (task 4.5): quando `resultado["resultado"] == "registrado"` e
    # `resultado["novo"]` for True, disparar aqui o diagnóstico do Rui
    # (`vigia.diagnosticar(resultado["id"])`), respeitando o limite por hora.

    return resultado


@app.get("/api/cron/resumo-semanal")
def cron_resumo_semanal(
    authorization: str | None = Header(default=None),
) -> dict:
    """Resumo semanal disparado pelo Vercel Cron (Requirement 10).

    Rota pública quanto à sessão, protegida por `Authorization: Bearer
    <CRON_SECRET>` (a Vercel envia esse cabeçalho — Requirement 10.2). Sem o
    header, com formato errado ou segredo diferente → 401.

    Import tardio de `resumo` para não exigir o modelo em quem só importa o app.
    """
    esperado = config.cron_secret()
    fornecido = ""
    if authorization and authorization.startswith("Bearer "):
        fornecido = authorization[len("Bearer "):]

    if not esperado or not secrets.compare_digest(fornecido, esperado):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autorizado.",
        )

    from _orion import resumo

    return resumo.resumo_semanal()


@app.get("/api/saude")
def saude() -> dict:
    """Verificação de saúde pública (sem autenticação).

    Informa se o banco está acessível. Enquanto os helpers de banco não
    existem (`_orion.db`), a checagem degrada de forma silenciosa para `False`
    em vez de derrubar a rota.
    """
    banco = _banco_acessivel()
    return {"ok": True, "banco": banco}


def _banco_acessivel() -> bool:
    """Tenta um `SELECT 1` no Postgres. Nunca lança."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        return False
    try:
        import psycopg

        with psycopg.connect(
            url, autocommit=True, prepare_threshold=None, connect_timeout=3
        ) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False
