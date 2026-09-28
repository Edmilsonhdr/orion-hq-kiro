# Design Document

## Overview

Orion HQ é um projeto único na Vercel: front Next.js e backend FastAPI (Python) como função serverless. Toda a
IA vive no backend, orquestrada por um `StateGraph` do LangGraph com estado persistido no Postgres (Neon).
O front não tem WebSocket: lê mensagens, atividades e aprovações por polling incremental.

```
Navegador (Dimi / Jullyana)
   │  polling /api/mensagens, /api/atividades, /api/aprovacoes   POST /api/chat, /api/aprovacoes/{id}
   ▼
Next.js (Vercel) ──rewrite /api/*──► FastAPI api/index.py (Vercel Python, maxDuration 300)
                                        │
                                        ├── LangGraph (supervisor → especialistas → aprovação → resposta)
                                        │       └── Claude (Sonnet: orq/especialistas · Haiku: worker)
                                        └── Neon Postgres (mensagens, atividades, changelog, aprovacoes,
                                                            reunioes + tabelas do checkpointer)
GitHub ──webhook PR merged──► /api/webhooks/github ──► worker resume o diff ──► changelog
Vercel Cron (seg 09:00 BRT) ──► /api/cron/resumo-semanal
```

## Architecture

### Grafo (LangGraph)

```
START → supervisor ──► tech ────────► supervisor
            │     ├──► negocios ────► supervisor
            │     ├──► agenda ──► aprovacao (interrupt) ──► supervisor
            │     └──► responder ──► END
```

**Estado** (`TypedDict`):

```python
class Estado(TypedDict, total=False):
    run_id: str
    autor: str            # "dimi" | "jullyana"
    pedido: str
    historico: str        # últimas 12 mensagens formatadas "Autor: texto"
    relatorios: Annotated[list[dict], operator.add]   # [{"agente": "tech", "texto": "..."}]
    proxima: str          # destino escolhido pelo supervisor
    instrucao: str        # instrução para o especialista
    proposta: dict | None # proposta de reunião aguardando aprovação
    passos: int           # delegações já feitas (limite 4)
    resposta: str         # texto final para o chat
```

**Nós:**

- `supervisor` — se `passos >= 4`, vai para `responder`. Senão chama `decidir(estado) -> Rota` (saída
  estruturada Pydantic: `proximo: Literal["tech","agenda","negocios","responder"]`, `instrucao`, `motivo`)
  e emite `delegou` com `dados={"de":"orq","para":proximo,"motivo":...}`.
- `tech` / `negocios` — rodam o loop de ferramentas do especialista, emitem `delegou` de volta para `orq`,
  retornam `relatorios=[...]` e `passos+1`.
- `agenda` — chama `propor_reuniao(instrucao, run_id)`; retorna `proposta` e `passos+1`.
- `aprovacao` — ver "Fluxo de aprovação".
- `responder` — chama `redigir(estado) -> str` usando só os relatórios; emite `resposta`.

Arestas condicionais: `supervisor → estado["proxima"]`. `agenda → aprovacao → supervisor`.

**Prompt do supervisor** (resumo): "Você é o Orquestrador do Orion HQ, chefe de gabinete de Dimi e Jullyana.
Você NÃO executa tarefas: decide quem trabalha. tech = produto/código/PRs; agenda = reuniões e pautas;
negocios = custos, métricas, decisões; responder = quando os relatórios bastam ou é conversa simples.
Não repita um especialista para a mesma coisa. Agora é {data em PT-BR}." A data deve ser formatada com dia da
semana em português (não usar `%A`, que sai em inglês).

### Loop de ferramentas dos especialistas

Implementar um loop próprio (não usar `create_react_agent`/`create_agent`) para controlar as atividades:

```python
def rodar_com_ferramentas(agente, sistema, instrucao, ferramentas, run_id, max_voltas=6) -> str:
    modelo = llm.principal().bind_tools(ferramentas)
    msgs = [SystemMessage(sistema), HumanMessage(instrucao)]
    emitir(run_id, agente, "inicio", instrucao)
    for _ in range(max_voltas):
        ai = modelo.invoke(msgs); emitir(..., "pensando", tokens=tokens(ai)); msgs.append(ai)
        if not ai.tool_calls: break
        for chamada in ai.tool_calls:
            emitir(run_id, agente, "ferramenta", f"{nome}({args})")
            saida = ferramenta.invoke(args)  # erro vira texto "erro ao executar: ..." para o modelo
            msgs.append(ToolMessage(content=str(saida), tool_call_id=chamada["id"]))
    emitir(run_id, agente, "concluiu", texto(ai)[:200])
    return texto(ai)
```

`texto(msg)` precisa tratar `content` como string **ou** lista de blocos (`{"type":"text"}`).
`tokens(msg)` lê `usage_metadata["total_tokens"]`.

### Fluxo de aprovação

```python
def no_aprovacao(estado):
    chave = f"{run_id}:{passos}"
    nova = insert into aprovacoes (...) on conflict (chave) do nothing returning id
    if nova: emitir(run_id, "agenda", "aguardando_aprovacao", ..., dados={"aprovacao_id": id})
    decisao = interrupt({"tipo": "criar_reuniao", "proposta": proposta})   # grafo pausa aqui
    if decisao["aprovado"]: cria reunião, gera links, relatório "Reunião criada (aprovada por X)..."
    else: relatório "NÃO foi criada: X recusou"
    return {"relatorios": [...], "proposta": None}
```

Tudo antes de `interrupt()` reexecuta ao retomar — por isso o insert é idempotente pela `chave`.

`decidir_aprovacao(id, usuario, aprovado)`:
1. `update aprovacoes set status=..., decidido_por=..., decidido_em=now() where id=%s and status='pendente' returning run_id`
   — se não retornar linha, responde `{"status":"ja_decidida"}`.
2. `grafo.invoke(Command(resume={"aprovado": aprovado, "por": usuario}), config(run_id))`.
3. Finaliza igual a uma conversa (salva a resposta no chat).

### Execução de um run

```python
@contextmanager
def grafo_com_checkpoint():
    with PostgresSaver.from_conn_string(DATABASE_URL) as cp:
        yield construir().compile(checkpointer=cp)

config = {"configurable": {"thread_id": run_id}, "recursion_limit": 30}
```

Finalização: `snap = g.get_state(config)`; se `snap.next` não estiver vazio → `{"status":"aguardando_aprovacao"}`;
senão salva `snap.values["resposta"]` como mensagem do Orquestrador.

Cada mensagem do chat é um run novo (`thread_id = run_id`), para não acumular contexto infinito; a
continuidade vem do `historico` (últimas 12 mensagens).

### Links de calendário (sem API do Google nesta fase)

- Google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=<titulo>&dates=<inicioUTC>/<fimUTC>&details=<pauta>`
  com datas no formato `YYYYMMDDTHHMMSSZ`.
- `.ics`: `GET /api/reunioes/{id}.ics` gera um VCALENDAR/VEVENT simples (UID `reuniao-{id}@orion-hq`).

## Components and Interfaces

### API (FastAPI, prefixo `/api`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/login` | — | `{usuario, senha}` → cookie `orion_sessao` |
| POST | `/logout` | sessão | limpa cookie |
| GET | `/me` | sessão | `{usuario, aprovador}` |
| GET | `/mensagens?desde=<id>` | sessão | mensagens com `id > desde` (se 0: últimas 50) |
| POST | `/chat` | sessão | `{texto}` → roda o grafo (bloqueia até terminar ou pausar) |
| GET | `/atividades?desde=<id>` | sessão | atividades com `id > desde` (se 0: últimas 80) |
| GET | `/atividades/tokens` | sessão | `{agente: tokens}` de hoje |
| GET | `/aprovacoes?status=pendente` | sessão | lista |
| POST | `/aprovacoes/{id}` | sessão + aprovador | `{aprovado: bool}` → retoma o grafo |
| GET | `/reunioes` | sessão | próximas reuniões |
| GET | `/reunioes/{id}.ics` | sessão | arquivo iCalendar |
| POST | `/webhooks/github` | assinatura | ingestão de PR mergeado |
| GET | `/cron/resumo-semanal` | Bearer CRON_SECRET | resumo da semana |
| GET | `/saude` | — | `{ok, banco}` |

O `POST /chat` pode levar dezenas de segundos. O front **não** espera por ele para atualizar a tela: dispara a
requisição e continua o polling de mensagens e atividades.

### Sessão

Token = `usuario.expira_epoch.assinatura`, onde assinatura = HMAC-SHA256(`ORION_SESSION_SECRET`,
`usuario.expira_epoch`) em hex. Verificação com `hmac.compare_digest`. Cookie `secure` exceto em localhost.

### Webhook do GitHub

1. Validar `X-Hub-Signature-256` (`sha256=` + HMAC do corpo bruto).
2. Se `X-GitHub-Event == "pull_request"` e `action == "closed"` e `pull_request.merged`:
   `GET {pull_request.url}/files` com `Authorization: Bearer GITHUB_TOKEN` (httpx, timeout 15 s).
3. Montar texto com título, descrição e patches (truncar em ~12.000 chars) e pedir ao **worker**: "Resuma em
   português, em 3–6 linhas, o que mudou para o usuário e tecnicamente. Sem inventar."
4. Upsert em `changelog` (`on conflict (fonte, referencia) where referencia is not null do update`).
5. Mensagem do Orquestrador no chat + atividades do agente `work` (`run_id = "gh-<numero>"`).

Observação: o GitHub espera resposta em 10 s. Se o resumo demorar mais, o GitHub marca timeout, mas a função
continua até terminar. Aceitável nesta fase; documentar no README.

### Front

- `lib/usePoll.ts`: `usePoll<T extends {id:number}>(path, intervaloMs)` guarda a lista e o maior `id`, chama
  `path?desde=<maior>` e concatena. Pausa quando a aba está oculta (`document.visibilityState`).
- `lib/agents.ts`:

```ts
export const AGENTES = [
  { id: "tech",     nome: "Tech",         nivel: "N2", cor: "#3FC1C9", ocioso: "observando a main",  x: 60,  y: 60  },
  { id: "agenda",   nome: "Agenda",       nivel: "N2", cor: "#7BD88F", ocioso: "sem pendências",     x: 612, y: 60  },
  { id: "orq",      nome: "Orquestrador", nivel: "N1", cor: "#4C8DFF", ocioso: "ouvindo o grupo",    x: 336, y: 250 },
  { id: "negocios", nome: "Negócios",     nivel: "N2", cor: "#A58BFF", ocioso: "aguardando eventos", x: 60,  y: 450 },
  { id: "work",     nome: "Workers",      nivel: "N3", cor: "#8FA3C7", ocioso: "na fila",            x: 612, y: 450 },
] as const;
```

- **Escritório** (`components/Office.tsx`): área 872×688 com piso quadriculado, mesas de 200×160 nas posições
  acima, linhas tracejadas do Orquestrador para cada especialista. Estado de cada mesa derivado das
  atividades: última atividade do agente; ativo se tipo ∈ {inicio, pensando, ferramenta, delegou} e idade < 30 s;
  espera se existe aprovação pendente (Agenda). Envelope: a cada `delegou` novo, posiciona na mesa `de` e
  anima até a `para` (transição CSS de `left/top`). Barra lateral: log + tokens do dia.
- **Chat**: bolhas (Orquestrador à esquerda, humanos à direita), cartões de aprovação pendente no topo,
  indicador "trabalhando…" com o detalhe da última atividade do run atual.
- Referência visual: mockup "Escritório dos Agentes" feito no Claude (pixel art, tema escuro).

### Paleta e tipografia

| Token | Valor |
|---|---|
| fundo | `#0B1020` |
| piso | `#0E1528` com grade `#16203A` a cada 32 px |
| painel | `#121A2E` |
| borda | `#1C2744` / `#2A3A5E` |
| texto | `#E8EEF9` |
| texto secundário | `#8C9AB8` |
| destaque | `#4C8DFF` |
| espera/aprovação | `#F2A541` |

Fontes (Google Fonts via `<link>`): **Silkscreen** (títulos e nomes em pixel), **IBM Plex Sans** (texto),
**IBM Plex Mono** (log e números). Botões com altura mínima de 44 px e foco visível.

## Data Models

```sql
create table if not exists mensagens (
  id bigserial primary key, autor text not null, texto text not null, run_id text,
  criado_em timestamptz not null default now()
);

create table if not exists atividades (
  id bigserial primary key, run_id text, agente text not null, tipo text not null,
  detalhe text, dados jsonb, tokens integer not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists atividades_criado_idx on atividades (criado_em);

create table if not exists changelog (
  id bigserial primary key, fonte text not null, referencia text, titulo text not null,
  resumo text not null, url text, autor text, criado_em timestamptz not null default now(),
  busca tsvector generated always as (
    to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(resumo,''))
  ) stored
);
create index if not exists changelog_busca_idx on changelog using gin (busca);
create unique index if not exists changelog_ref_idx on changelog (fonte, referencia) where referencia is not null;

create table if not exists aprovacoes (
  id bigserial primary key, run_id text not null,
  chave text not null unique,              -- run_id:passo (idempotência do nó de aprovação)
  tipo text not null, proposta jsonb not null, pedido_por text,
  status text not null default 'pendente', -- pendente | aprovada | recusada
  decidido_por text, criado_em timestamptz not null default now(), decidido_em timestamptz
);

create table if not exists reunioes (
  id bigserial primary key, titulo text not null, inicio timestamptz not null, fim timestamptz not null,
  participantes text[] not null default '{}', pauta text[] not null default '{}',
  criado_por text, run_id text, criado_em timestamptz not null default now()
);
```

**Atividade (contrato com o front):**

```json
{ "id": 812, "run_id": "a1b2c3d4e5f6", "agente": "tech", "tipo": "ferramenta",
  "detalhe": "buscar_changelog(consulta=\"onboarding\")", "dados": {}, "tokens": 0,
  "criado_em": "2026-09-26T14:02:11-03:00" }
```

`delegou` sempre tem `dados.de` e `dados.para`. `aguardando_aprovacao` tem `dados.aprovacao_id`.
`concluiu` da Agenda aprovada tem `dados.google` e `dados.ics`.

## Error Handling

- Qualquer exceção no run → atividade `erro` (mensagem curta) + mensagem amigável no chat; log completo no servidor.
- Erro de ferramenta vira texto para o modelo decidir (não derruba o loop).
- `emitir()` nunca lança exceção.
- Proposta de reunião com data inválida → relatório da Agenda explicando; o Orquestrador pede outra data.
- Webhook com assinatura inválida → 401; evento irrelevante → 200 `{"ignorado": true}`.

## Testing Strategy

- **Banco:** Postgres real local (Docker `postgres:16` ou o pacote `pgserver` via pip). Fixture que aplica o
  schema e roda `PostgresSaver.setup()`, e limpa as tabelas entre testes.
- **Modelo simulado:** substituir com `monkeypatch` as funções isoladas (`grafo.decidir`, `grafo.redigir`,
  `especialistas.propor_reuniao`, e o `llm.principal` do loop de ferramentas por um fake que retorna
  `AIMessage` com/sem `tool_calls`). Nenhum teste chama a API da Anthropic.
- **Cenários obrigatórios:** os listados no Requirement 11.1.
- **API:** `fastapi.testclient.TestClient` para login, 401, `/chat`, `/aprovacoes/{id}` e webhook.
- **Front:** `npm run build` sem erros de tipo; verificação manual do escritório com atividades inseridas
  direto no banco (script `scripts/seed_demo.py`).

## Configuração da Vercel

`next.config.mjs`:

```js
export default {
  rewrites: async () => [{
    source: "/api/:path*",
    destination: process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/:path*" : "/api/",
  }],
};
```

`vercel.json`:

```json
{
  "functions": { "api/index.py": { "maxDuration": 300 } },
  "crons": [{ "path": "/api/cron/resumo-semanal", "schedule": "0 12 * * 1" }]
}
```

(12:00 UTC = 09:00 em São Paulo.) Conferir na documentação da Vercel os limites atuais de duração do plano usado.

`requirements.txt`: `fastapi`, `langgraph`, `langgraph-checkpoint-postgres`, `langchain-anthropic`,
`psycopg[binary]`, `httpx`, `pydantic`. Dev: `pytest`, `uvicorn`. Fixar versões após o primeiro install.
