"""Ingestão do Sentry: assinatura, parser tolerante, whitelist e máscara.

Este módulo materializa o começo do fluxo do Vigia (design.md, "Webhook do
Sentry"): valida a assinatura do webhook, interpreta o payload de um evento
(recursos `issue` e `event_alert`), e devolve **apenas** os campos de uma lista
de permissão (whitelist), com os textos mascarados. Nada aqui altera o banco —
o upsert e o disparo do diagnóstico ficam em tasks seguintes.

Regras que este módulo garante:

- **Assinatura obrigatória (Requirement 1.1/1.2):** `Sentry-Hook-Signature` é o
  HMAC-SHA256 hex do corpo BRUTO com `SENTRY_CLIENT_SECRET`, comparado em tempo
  constante (`hmac.compare_digest`). Segredo vazio ou assinatura ausente → False.
- **Parser tolerante (Requirement 1.8):** `.get()` em tudo; um campo ausente
  nunca derruba a interpretação. Payload de forma inesperada → dict vazio de
  campos, sem exceção.
- **Whitelist (Requirements 2.1, 2.2):** só saem os campos permitidos. NUNCA
  e-mail, IP, nome, id de usuário, headers, cookies, query string, corpo de
  requisição, variáveis locais de frames (`vars`), breadcrumbs ou contexto de
  usuário. Esses campos existem no payload do Sentry e são simplesmente
  ignorados: só lemos as chaves da whitelist.
- **Máscara (Requirement 2.3):** `mascarar()` troca e-mails, CPFs, telefones BR
  e sequências de 8+ dígitos por `[removido]`. Aplicada em título, mensagem e
  culpado.
- **Mapa de projeto (Requirement 1.7):** slug do Sentry → `app`/`backend` via
  `ORION_SENTRY_PROJETOS`; slug desconhecido → `desconhecido`.

Convenções (tech.md): env lida dentro das funções, funções pequenas e tipadas,
compatível com Python 3.10 e 3.12.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from typing import Any, Optional

from . import config

# Nº máximo de frames guardados por incidente (design.md, "Campos extraídos").
MAX_FRAMES = 30

# Marcador que substitui dados sensíveis nos textos (Requirement 2.3).
REMOVIDO = "[removido]"

# Recursos de webhook que este módulo sabe interpretar.
RECURSO_ISSUE = "issue"
RECURSO_EVENT_ALERT = "event_alert"


# --- Máscara de dados pessoais (Requirement 2.3) ---

# E-mail: parte local + @ + domínio. Simples de propósito (evitar falsos negativos).
_RE_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# CPF com pontuação: 000.000.000-00 (aceita separadores . ou - variados).
_RE_CPF_PONTUADO = re.compile(r"\b\d{3}[.\-]\d{3}[.\-]\d{3}[.\-]\d{2}\b")

# Telefone BR: opcional +55, DDD entre parênteses ou não, com espaços/hífens.
# Ex.: +55 (11) 98765-4321, 11987654321, (11) 3456-7890.
_RE_TELEFONE = re.compile(
    r"(?:\+?55\s*)?(?:\(?\d{2}\)?[\s\-]*)?\d{4,5}[\s\-]?\d{4}\b"
)

# Sequência de 8 ou mais dígitos seguidos (cobre CPF sem pontuação, ids longos,
# telefones colados, etc.). Vem por último para não estragar as regras acima.
_RE_DIGITOS_LONGOS = re.compile(r"\d{8,}")


def mascarar(texto: Optional[str]) -> str:
    """Substitui e-mails, CPFs, telefones BR e números longos por `[removido]`.

    Aplicada em título, mensagem e culpado antes de guardar/enviar ao modelo
    (Requirement 2.3). Ordem importa: primeiro os padrões específicos (e-mail,
    CPF pontuado, telefone), depois a rede de segurança de dígitos longos, que
    pega CPF sem pontuação e ids numéricos. `None`/vazio → string vazia.
    """
    if not texto:
        return ""
    resultado = _RE_EMAIL.sub(REMOVIDO, str(texto))
    resultado = _RE_CPF_PONTUADO.sub(REMOVIDO, resultado)
    resultado = _RE_TELEFONE.sub(REMOVIDO, resultado)
    resultado = _RE_DIGITOS_LONGOS.sub(REMOVIDO, resultado)
    return resultado


# --- Assinatura do webhook (Requirements 1.1, 1.2) ---


def verificar_assinatura(corpo: bytes, assinatura: Optional[str]) -> bool:
    """Valida `Sentry-Hook-Signature` do webhook (Requirement 1.1).

    A assinatura é o HMAC-SHA256 (hex) do corpo BRUTO da requisição usando
    `SENTRY_CLIENT_SECRET` como chave. Comparação em tempo constante. Sem
    segredo configurado ou sem cabeçalho de assinatura → inválida
    (Requirement 1.2).
    """
    segredo = config.sentry_client_secret()
    if not segredo or not assinatura:
        return False
    esperado = hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, assinatura)


# --- Mapa de projeto (Requirement 1.7) ---


def mapear_projeto(slug: Optional[str]) -> str:
    """Mapeia o slug do projeto no Sentry para `app`/`backend`/`desconhecido`.

    Usa `ORION_SENTRY_PROJETOS` (via `config.sentry_projetos`). Slug ausente ou
    não listado → `desconhecido` (Requirement 1.7).
    """
    if not slug:
        return "desconhecido"
    return config.sentry_projetos().get(str(slug), "desconhecido")


# --- Helpers de parsing tolerante ---


def _como_dict(valor: Any) -> dict:
    """Devolve `valor` se for dict, senão `{}` (parser tolerante)."""
    return valor if isinstance(valor, dict) else {}


def _como_lista(valor: Any) -> list:
    """Devolve `valor` se for lista, senão `[]` (parser tolerante)."""
    return valor if isinstance(valor, list) else []


def _texto_ou_none(valor: Any) -> Optional[str]:
    """Converte para str não-vazia, ou `None` (não guardar strings vazias)."""
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


def _inteiro(valor: Any, padrao: int = 0) -> int:
    """Converte para int de forma tolerante (aceita "3", 3, 3.0); senão `padrao`.

    O Sentry manda `count` como string ("3") e `userCount` como número.
    """
    if valor is None:
        return padrao
    try:
        return int(float(valor))
    except (TypeError, ValueError):
        return padrao


def _slug_do_projeto(projeto: Any) -> Optional[str]:
    """Extrai o slug de `issue.project`.

    No payload de `issue`, `project` é um objeto com `slug`. No `event_alert`,
    `project` costuma ser só um número (id), sem slug — nesse caso devolve None
    e o projeto vira `desconhecido`.
    """
    if isinstance(projeto, dict):
        return _texto_ou_none(projeto.get("slug"))
    return None


# --- Whitelist de stack frames (Requirements 2.1, 2.2) ---


def _extrair_frames(exception: dict) -> list[dict]:
    """Extrai frames do stack trace com SOMENTE os campos da whitelist.

    Caminho no payload de evento: `exception.values[].stacktrace.frames[]`.
    De cada frame guardamos apenas `arquivo`, `funcao`, `linha` e `modulo`.
    NUNCA `vars` (variáveis locais), `context_line`, `pre/post_context` ou
    qualquer outro campo (Requirement 2.2).

    Preferimos frames `in_app` quando a marcação existe; se não houver nenhum
    `in_app`, usamos todos. Limita a `MAX_FRAMES`. Ordem preservada (o Sentry
    lista do mais antigo ao mais recente).
    """
    frames_brutos: list[dict] = []
    for valor in _como_lista(exception.get("values")):
        stacktrace = _como_dict(_como_dict(valor).get("stacktrace"))
        for frame in _como_lista(stacktrace.get("frames")):
            if isinstance(frame, dict):
                frames_brutos.append(frame)

    marcados_in_app = [f for f in frames_brutos if f.get("in_app") is True]
    escolhidos = marcados_in_app or frames_brutos

    limpos: list[dict] = []
    for frame in escolhidos[:MAX_FRAMES]:
        limpos.append(
            {
                "arquivo": _texto_ou_none(frame.get("filename")),
                "funcao": _texto_ou_none(frame.get("function")),
                "linha": frame.get("lineno") if isinstance(frame.get("lineno"), int) else None,
                "modulo": _texto_ou_none(frame.get("module")),
            }
        )
    return limpos


def _mensagem_do_evento(evento: dict) -> Optional[str]:
    """Mensagem legível do evento, sem tocar em request/user/breadcrumbs.

    Prefere `metadata.value` (ex.: "heck is not defined"), depois `message`,
    depois `title`. Só campos técnicos da whitelist.
    """
    metadata = _como_dict(evento.get("metadata"))
    return (
        _texto_ou_none(metadata.get("value"))
        or _texto_ou_none(evento.get("message"))
        or _texto_ou_none(evento.get("title"))
    )


# --- Interpretação por recurso ---


def _interpretar_issue(dados: dict) -> dict:
    """Extrai os campos da whitelist de um payload de recurso `issue`.

    Caminho: `data.issue`. Não traz stack (só o `event_alert`/API do Sentry).
    """
    issue = _como_dict(dados.get("issue"))
    slug = _slug_do_projeto(issue.get("project"))
    return {
        "sentry_issue_id": _texto_ou_none(issue.get("id")),
        "titulo": mascarar(_texto_ou_none(issue.get("title"))),
        "nivel": _texto_ou_none(issue.get("level")),
        "culpado": mascarar(_texto_ou_none(issue.get("culprit"))),
        "release": _texto_ou_none(issue.get("firstRelease") or issue.get("release")),
        "ambiente": _texto_ou_none(issue.get("environment")),
        "url": _texto_ou_none(issue.get("web_url") or issue.get("permalink") or issue.get("url")),
        "ocorrencias": _inteiro(issue.get("count"), 1),
        "usuarios_afetados": _inteiro(issue.get("userCount"), 0),
        "primeira_vez": _texto_ou_none(issue.get("firstSeen")),
        "ultima_vez": _texto_ou_none(issue.get("lastSeen")),
        "projeto": mapear_projeto(slug),
        "stack": [],
    }


def _interpretar_event_alert(dados: dict) -> dict:
    """Extrai os campos da whitelist de um payload de recurso `event_alert`.

    Caminho: `data.event`. Traz o stack trace (`exception.values[].stacktrace`)
    e a mensagem técnica; ignora `request`, `user`, `tags` de PII, `sdk`, etc.
    """
    evento = _como_dict(dados.get("event"))
    exception = _como_dict(evento.get("exception"))
    return {
        "sentry_issue_id": _texto_ou_none(evento.get("issue_id")),
        "titulo": mascarar(_texto_ou_none(evento.get("title"))),
        "mensagem": mascarar(_mensagem_do_evento(evento)),
        "nivel": _texto_ou_none(evento.get("level")),
        "culpado": mascarar(_texto_ou_none(evento.get("culprit"))),
        "release": _texto_ou_none(evento.get("release")),
        "ambiente": _texto_ou_none(evento.get("environment")),
        "url": _texto_ou_none(evento.get("web_url") or evento.get("url")),
        "ocorrencias": 1,
        "usuarios_afetados": 0,
        "primeira_vez": _texto_ou_none(evento.get("datetime")),
        "ultima_vez": _texto_ou_none(evento.get("datetime")),
        "projeto": mapear_projeto(_slug_do_projeto(evento.get("project"))),
        "stack": _extrair_frames(exception),
    }


def interpretar_payload(recurso: Optional[str], corpo: dict) -> Optional[dict]:
    """Interpreta o payload de um webhook do Sentry e aplica a whitelist.

    Recebe o `recurso` (cabeçalho `Sentry-Hook-Resource`) e o corpo já
    desserializado. Devolve um dict com **apenas** os campos permitidos
    (Requirement 2.1), com título/mensagem/culpado já mascarados
    (Requirement 2.3) e o projeto mapeado (Requirement 1.7). Também expõe
    `acao` (`data.action` / `action`) para o chamador decidir criar, atualizar
    ou ignorar (Requirements 1.3, 1.4).

    Recurso desconhecido, ou payload sem `sentry_issue_id`, → `None`
    (o chamador responde 200 `{"ignorado": true}`). O parser é tolerante: nunca
    lança por campo ausente (Requirement 1.8).
    """
    if not isinstance(corpo, dict):
        return None

    dados = _como_dict(corpo.get("data"))
    acao = _texto_ou_none(corpo.get("action") or dados.get("action"))

    if recurso == RECURSO_ISSUE:
        campos = _interpretar_issue(dados)
    elif recurso == RECURSO_EVENT_ALERT:
        campos = _interpretar_event_alert(dados)
    else:
        return None

    if not campos.get("sentry_issue_id"):
        return None

    campos["acao"] = acao
    campos["recurso"] = recurso
    return campos


# --- Upsert e status no banco (Requirements 1.3, 1.4, 1.6) ---
#
# A partir daqui o módulo toca o Postgres, usando os helpers de `db.py`
# (conexão curta, autocommit, prepare_threshold=None). O `interpretar_payload`
# acima já entregou os campos da whitelist; estas funções decidem, pela ação do
# evento, se registram/atualizam um incidente ou mudam o status de um existente.

from psycopg.types.json import Json  # noqa: E402  (import tardio, junto do resto)

from . import db  # noqa: E402

# Ações do Sentry que registram/atualizam um incidente (Requirement 1.3).
# `event_alert` não traz `action`; o próprio recurso já significa "novo evento".
ACOES_REGISTRO = ("created",)

# Ação → status do incidente (Requirement 1.4).
STATUS_POR_ACAO = {
    "resolved": "resolvido",
    "ignored": "ignorado",
}


def _quer_registrar(campos: dict) -> bool:
    """True quando o evento deve registrar/atualizar um incidente.

    `event_alert` sempre registra (é um novo evento). Para o recurso `issue`,
    só a ação `created` (Requirement 1.3); `resolved`/`ignored` viram mudança de
    status, e as demais ações são ignoradas pelo chamador.
    """
    if campos.get("recurso") == RECURSO_EVENT_ALERT:
        return True
    return campos.get("acao") in ACOES_REGISTRO


def registrar_incidente(campos: dict) -> Optional[dict]:
    """Faz o upsert de um incidente, deduplicando por `sentry_issue_id`.

    Insere um incidente novo ou, se o `sentry_issue_id` já existir, apenas
    atualiza `ocorrencias`, `usuarios_afetados` e `ultima_vez` com o maior valor
    entre o guardado e o recebido — sem criar uma segunda linha (Requirement
    1.6). `primeira_vez`/`ultima_vez` chegam como texto ISO (ou `None`); no
    insert caem para `now()` quando ausentes.

    Devolve `{"id": int, "novo": bool}`: `novo` é `True` só quando houve
    inserção (via `xmax = 0`), o gatilho para disparar o diagnóstico depois.
    Retorna `None` se não houver `sentry_issue_id` (parser tolerante).
    """
    issue_id = campos.get("sentry_issue_id")
    if not issue_id:
        return None

    linha = db.um(
        """
        insert into incidentes (
            sentry_issue_id, projeto, titulo, nivel, culpado, release, ambiente,
            url, stack, ocorrencias, usuarios_afetados, primeira_vez, ultima_vez
        )
        values (
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            coalesce(%s::timestamptz, now()), coalesce(%s::timestamptz, now())
        )
        on conflict (sentry_issue_id) do update set
            ocorrencias = greatest(incidentes.ocorrencias, excluded.ocorrencias),
            usuarios_afetados = greatest(
                incidentes.usuarios_afetados, excluded.usuarios_afetados
            ),
            ultima_vez = greatest(incidentes.ultima_vez, excluded.ultima_vez)
        returning id, (xmax = 0) as novo
        """,
        (
            issue_id,
            campos.get("projeto") or "desconhecido",
            campos.get("titulo") or "",
            campos.get("nivel"),
            campos.get("culpado"),
            campos.get("release"),
            campos.get("ambiente"),
            campos.get("url"),
            Json(campos.get("stack") or []),
            _inteiro(campos.get("ocorrencias"), 1),
            _inteiro(campos.get("usuarios_afetados"), 0),
            campos.get("primeira_vez"),
            campos.get("ultima_vez"),
        ),
    )
    assert linha is not None  # INSERT ... RETURNING sempre devolve uma linha
    return {"id": linha["id"], "novo": bool(linha["novo"])}


def atualizar_status(sentry_issue_id: Optional[str], status: str) -> Optional[dict]:
    """Muda o status de um incidente existente (Requirement 1.4).

    Usado para `resolved` → `resolvido` e `ignored` → `ignorado`. Localiza o
    incidente pelo `sentry_issue_id` e atualiza o status; se não existir um
    incidente com esse id, não faz nada e devolve `None` (o Sentry pode mandar
    um `resolved` de uma issue que nunca chegou aqui como `created`).

    Devolve `{"id": int, "status": str}` quando atualiza.
    """
    if not sentry_issue_id:
        return None
    return db.um(
        """
        update incidentes
           set status = %s
         where sentry_issue_id = %s
        returning id, status
        """,
        (status, sentry_issue_id),
    )


def processar_evento(campos: dict) -> dict:
    """Aplica um payload já interpretado ao banco e diz o que aconteceu.

    Ponto de entrada usado pela rota do webhook depois de `interpretar_payload`.
    Decide pela ação/recurso (Requirements 1.3, 1.4, 1.6):

    - `resolved`/`ignored`: muda o status do incidente correspondente e devolve
      `{"resultado": "status", "id", "status"}` (ou `"nao_encontrado"`).
    - `created`/`event_alert`: faz o upsert e devolve
      `{"resultado": "registrado", "id", "novo"}`. `novo=True` sinaliza que o
      chamador deve disparar o diagnóstico.
    - qualquer outra ação: `{"resultado": "ignorado"}`.
    """
    acao = campos.get("acao")

    status = STATUS_POR_ACAO.get(acao or "")
    if status:
        atualizado = atualizar_status(campos.get("sentry_issue_id"), status)
        if atualizado is None:
            return {"resultado": "nao_encontrado"}
        return {
            "resultado": "status",
            "id": atualizado["id"],
            "status": atualizado["status"],
        }

    if _quer_registrar(campos):
        registrado = registrar_incidente(campos)
        if registrado is None:
            return {"resultado": "ignorado"}
        return {
            "resultado": "registrado",
            "id": registrado["id"],
            "novo": registrado["novo"],
        }

    return {"resultado": "ignorado"}
