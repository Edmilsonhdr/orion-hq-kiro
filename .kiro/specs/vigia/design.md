# Design Document

## Overview

O Vigia é um fluxo paralelo ao chat, no mesmo estilo da ingestão do GitHub: um webhook recebe o evento,
registra um incidente e dispara um diagnóstico síncrono dentro da mesma função da Vercel. O chat só
recebe o resumo final. Perguntas no chat sobre erros usam uma rota nova do supervisor que LÊ os
incidentes já diagnosticados.

```
Orion (app + backend) ──erro──► Sentry ──webhook assinado──► POST /api/webhooks/sentry
                                                                   │
                                          whitelist + máscara de dados pessoais
                                                                   │
                                        upsert em `incidentes` (dedup por issue)
                                                                   │  (só se for novo e dentro do limite)
                                                                   ▼
                                     diagnosticar(incidente_id)  ── Rui (vigia) ──► pedir_ao_tobias
                                                                   │                    └─ ler_arquivo_repo (GitHub)
                                           força áreas proibidas por código
                                                                   │
                                   salva diagnóstico ─► status `diagnosticado` ─► mensagem do Orquestrador no chat
```

Siga as convenções já existentes: módulos em `api/_orion/`, `atividades.emitir()` que nunca lança,
funções de modelo isoladas para teste, env lida dentro de funções, Python compatível com 3.10 e 3.12,
comandos conforme `.kiro/steering/ambiente.md`.

## Components and Interfaces

### Módulos novos

| Arquivo | Responsabilidade |
|---|---|
| `api/_orion/sentry.py` | verificar assinatura, interpretar payload, whitelist + máscara, mapear projeto, upsert |
| `api/_orion/vigia.py` | ferramentas do Rui, `diagnosticar()`, `responder_sobre_incidentes()`, limite por hora |
| `api/_orion/github_leitura.py` | `commits_recentes()`, `ler_arquivo_repo()` (httpx, timeout 15 s, só leitura) |
| `app/(hq)/incidentes/page.tsx` | lista + detalhe |
| `components/IncidenteCard.tsx` | exibição do diagnóstico |

Reaproveite `rodar_com_ferramentas` de `especialistas.py` (generalize se precisar de `max_voltas` e
agente configuráveis). Se o webhook do GitHub já tiver um cliente httpx, extraia para
`github_leitura.py` em vez de duplicar.

### Webhook do Sentry

```python
def verificar_assinatura(corpo: bytes, assinatura: str | None) -> bool:
    segredo = config.sentry_client_secret()
    if not segredo or not assinatura:
        return False
    esperado = hmac.new(segredo.encode(), corpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, assinatura)
```

Headers: `Sentry-Hook-Resource` (`issue`, `event_alert`, `error`, `installation`…) e
`Sentry-Hook-Signature`. Payload: `action` + `data.issue` (issue) ou `data.event` (event_alert).
**Confira o formato atual na documentação de webhooks de integração do Sentry** antes de implementar e
mantenha o parser tolerante (`.get()` em tudo, testes com payloads reais de exemplo em
`tests/fixtures/sentry_*.json`).

Campos extraídos (depois da whitelist): `sentry_issue_id`, `titulo`, `nivel`, `culpado`, `release`,
`ambiente`, `url`, `ocorrencias` (`count`), `usuarios_afetados` (`userCount`), `primeira_vez`,
`ultima_vez`, `projeto` (via `ORION_SENTRY_PROJETOS`) e `stack` (lista de frames
`{arquivo, funcao, linha, modulo}`, máximo 30 frames, só `in_app` quando houver essa marcação).

**Stack trace:** o payload de `issue.created` costuma não trazer frames. Se `SENTRY_AUTH_TOKEN` e
`SENTRY_ORG` estiverem configurados, buscar o último evento da issue pela API do Sentry
(`GET /api/0/issues/{id}/events/latest/`, timeout 10 s) e aplicar a mesma whitelist. Sem token, seguir sem
stack (Requirement 3.10).

**Máscara** (`mascarar(texto)`): regex para e-mail, CPF (com e sem pontuação), telefone BR e sequências
de 8+ dígitos → `[removido]`. Aplicada em título, mensagem e culpado.

**Upsert:**

```sql
insert into incidentes (sentry_issue_id, projeto, titulo, nivel, culpado, release, ambiente, url,
                        ocorrencias, usuarios_afetados, primeira_vez, ultima_vez, stack)
values (...)
on conflict (sentry_issue_id) do update set
  ocorrencias = greatest(incidentes.ocorrencias, excluded.ocorrencias),
  usuarios_afetados = greatest(incidentes.usuarios_afetados, excluded.usuarios_afetados),
  ultima_vez = greatest(incidentes.ultima_vez, excluded.ultima_vez)
returning id, (xmax = 0) as novo
```

`novo = true` só na inserção → dispara diagnóstico (se dentro do limite).

### Diagnóstico

```python
def diagnosticar(incidente_id: int) -> dict:
    run_id = f"inc-{incidente_id}"
    if not dentro_do_limite():            # Requirement 4
        avisar_fila_uma_vez_por_hora(); return {"status": "fila"}
    marcar_inicio(incidente_id)           # grava diagnostico_iniciado_em (conta no limite)
    emitir(run_id, "vigia", "inicio", f"investigando: {titulo}")
    relatorio = rodar_com_ferramentas("vigia", SISTEMA_VIGIA, instrucao, FERRAMENTAS_VIGIA, run_id, max_voltas=8)
    diag = estruturar(relatorio, incidente)          # with_structured_output(Diagnostico, include_raw=True)
    diag = aplicar_areas_proibidas(diag, incidente)  # força corrigivel_automaticamente=False por código
    salvar(incidente_id, diag)                       # status 'diagnosticado', diagnosticado_em = now()
    postar_resumo_no_chat(incidente, diag)           # autor "Orquestrador"
```

Falha em qualquer ponto → atividade `erro` do `vigia`, incidente continua `aberto`, mensagem curta no chat.

**`pedir_ao_tobias(pergunta)`** (ferramenta do Rui):
emite `delegou` com `{"de": "vigia", "para": "tech"}`, roda `rodar_com_ferramentas("tech", SISTEMA_TECH_CODIGO,
pergunta, [ler_arquivo_repo, buscar_changelog, commits_recentes], run_id, max_voltas=6)`, emite `delegou` de volta
e retorna o texto do Tobias.

**Prompt do Rui** (resumo): "Você é o Rui, vigia de plantão do Orion. Recebeu um erro de produção.
Descubra a causa provável usando SÓ as ferramentas: veja o stack, os commits e PRs recentes perto da
primeira ocorrência e peça ao Tobias para ler os arquivos do stack. Nunca invente arquivos, PRs ou números.
Se não tiver certeza, diga o que falta investigar. Você não corrige nada."

**Modelo `Diagnostico`** (Pydantic):

```python
class ArquivoSuspeito(BaseModel):
    caminho: str
    motivo: str

class Diagnostico(BaseModel):
    resumo: str
    causa_provavel: str
    confianca: Literal["baixa", "media", "alta"]
    arquivos_suspeitos: list[ArquivoSuspeito]
    pr_relacionado: str | None = None
    impacto: str
    proximo_passo: str
    corrigivel_automaticamente: bool
    motivo: str
```

**Áreas proibidas:** `ORION_AREAS_PROIBIDAS` (globs separados por vírgula). Padrão:
`**/migrations/**,**/prisma/**,**/*auth*/**,**/*auth*.*,**/*revenuecat*,**/*payment*,**/*pagamento*,**/*saude*/**,**/*health*/**`.
Usar `fnmatch` em cada `arquivos_suspeitos[].caminho` e no `culpado`. Qualquer casamento → 
`corrigivel_automaticamente=False` e `motivo` = "Toca em área protegida: <padrão>".

**Limite por hora:** conta incidentes com `diagnostico_iniciado_em > now() - interval '60 minutes'`.
Aviso de fila: grava a hora do último aviso numa atividade `vigia/fila`; só avisa de novo após 60 min.

### Supervisor

- `Rota.proximo` ganha `"vigia"`; o prompt do supervisor descreve: "vigia: erros, falhas, instabilidade,
  incidentes do app ou backend".
- Novo nó `no_vigia`: roda o Rui com `incidentes_abertos` e `detalhe_incidente` (sem `pedir_ao_tobias`,
  sem novo diagnóstico), devolve relatório e volta ao supervisor, como os outros especialistas.

### API

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/webhooks/sentry` | assinatura | ingestão |
| GET | `/api/incidentes?status=` | sessão | lista (abertos primeiro) |
| GET | `/api/incidentes/resumo` | sessão | `{abertos: n}` para cabeçalho e guarita |
| GET | `/api/incidentes/{id}` | sessão | detalhe com diagnóstico |
| POST | `/api/incidentes/{id}/status` | sessão | `{status: "resolvido" \| "ignorado" \| "aberto"}` |
| POST | `/api/incidentes/{id}/diagnosticar` | sessão | diagnóstico manual (respeita limite) |

### Front

- Navegação ganha "Incidentes" com contador (`/api/incidentes/resumo`, polling como aprovações).
- Lista em tabela simples; detalhe em painel/cartão: confiança como etiqueta (baixa = cinza, média = âmbar,
  alta = laranja do Rui), arquivos suspeitos em lista monoespaçada com motivo, PR como link.
- "Propor correção": `<button disabled aria-disabled="true">Propor correção · em breve</button>`.
- Escritório: a prop de alerta da guarita (criada na Parte A) recebe `abertos > 0`.

## Data Models

Adicionar ao `db/schema.sql`, de forma idempotente:

```sql
create table if not exists incidentes (
  id                      bigserial primary key,
  sentry_issue_id         text not null unique,
  projeto                 text not null,            -- app | backend | desconhecido
  titulo                  text not null,
  nivel                   text,                     -- error | fatal | warning
  culpado                 text,
  release                 text,
  ambiente                text,
  url                     text,
  stack                   jsonb,                    -- frames já filtrados pela whitelist
  ocorrencias             integer not null default 1,
  usuarios_afetados       integer not null default 0,
  primeira_vez            timestamptz not null default now(),
  ultima_vez              timestamptz not null default now(),
  status                  text not null default 'aberto',  -- aberto | diagnosticado | resolvido | ignorado
  diagnostico             jsonb,
  diagnostico_iniciado_em timestamptz,
  diagnosticado_em        timestamptz,
  criado_em               timestamptz not null default now()
);
create index if not exists incidentes_status_idx on incidentes (status);
```

## Error Handling

- Webhook: assinatura inválida → 401; payload malformado → 200 `{"ignorado": true}` + log (nunca 500 para
  o Sentry reenviar em loop); falha no diagnóstico não altera a resposta do webhook (já registrou).
- GitHub/Sentry API fora do ar → a ferramenta retorna texto de erro para o modelo; diagnóstico segue com
  confiança menor.
- Timeout do Sentry para webhooks é curto: se o diagnóstico passar do tempo, o Sentry pode marcar falha, mas
  a função continua. Aceitável nesta fase; documentar no README.

## Testing Strategy

- Fixtures de payload em `tests/fixtures/` (issue created, resolved, event_alert, payload com dados pessoais).
- Modelo simulado: substituir `rodar_com_ferramentas` / `estruturar` por fakes; GitHub e Sentry via
  `httpx.MockTransport` ou monkeypatch.
- Postgres local via pgserver (fixture existente).
- Cenários: todos os do Requirement 8.2.

## Configuração nova

```
SENTRY_CLIENT_SECRET=           # segredo da integração interna do Sentry
SENTRY_AUTH_TOKEN=              # opcional: buscar stack trace do último evento
SENTRY_ORG=                     # opcional: slug da organização no Sentry
ORION_SENTRY_PROJETOS=orion-app:app,orion-api:backend
ORION_GITHUB_REPO=owner/orion   # repositório do app Orion
ORION_AREAS_PROIBIDAS=          # vazio = padrão do design
ORION_MAX_DIAGNOSTICOS_HORA=5
```

## README: "Conectar o Orion ao Vigia"

Documentar (não implementar aqui):
1. Criar projetos no Sentry para o app (Expo/React Native) e o backend (Fastify).
2. Instalar o SDK nos dois com `sendDefaultPii: false` e `release` = sha do commit (EAS e Railway expõem o sha).
3. Criar uma Integração Interna no Sentry com webhook para `https://<orion-hq>/api/webhooks/sentry`,
   eventos de Issue, e copiar o Client Secret para `SENTRY_CLIENT_SECRET` na Vercel.
4. (Opcional) Token de API com escopo `event:read` para `SENTRY_AUTH_TOKEN`.
5. Token do GitHub fine-grained, só leitura (Contents + Metadata) no repo do Orion.
6. Testar com `scripts/seed_incidente.py`.
