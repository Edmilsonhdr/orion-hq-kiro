---
inclusion: always
---

# Orion HQ — stack técnica

## Visão geral

Um único projeto na **Vercel** com front Next.js e backend Python (FastAPI) como função serverless,
no padrão do template oficial `nextjs-fastapi` da Vercel.

| Camada | Escolha |
|---|---|
| Front | Next.js (App Router) + TypeScript + React. CSS puro (`app/globals.css`), sem framework de UI. |
| Backend | Python 3.12 + FastAPI em `api/index.py` (função Python da Vercel). |
| Agentes | LangGraph (Python) para o grafo; `langchain-anthropic` só para o modelo e tools. Não usar chains/agents prontos do LangChain. |
| Modelos | Principal: `claude-sonnet-5` (env `ORION_MODEL`). Worker: `claude-haiku-4-5` (env `ORION_WORKER_MODEL`). |
| Banco | Postgres no **Neon** (via Vercel Marketplace). Driver `psycopg` 3 (`psycopg[binary]`). |
| Estado do grafo | `langgraph-checkpoint-postgres` (`PostgresSaver`) no mesmo Neon. |
| Busca | Full-text search do Postgres (`tsvector`, config `portuguese`). pgvector fica para depois. |
| Pacotes Python | `requirements.txt` na raiz, só produção e com versões fixas (é o que a Vercel lê). Local: `requirements-dev.txt`. |
| Cron | Vercel Cron (`vercel.json`). |

## Restrições da Vercel que moldam o design

- **Sem WebSocket.** O front atualiza por **polling incremental** (`?desde=<ultimo_id>`) a cada ~1,5 s.
  Isso permite que Dimi e Jullyana vejam o mesmo escritório de dispositivos diferentes.
- **Tempo máximo por função.** `maxDuration: 300` em `vercel.json`. Um pedido deve terminar dentro disso.
- **Nada fica rodando esperando humano.** A aprovação usa `interrupt()` do LangGraph: o estado vai para o
  Postgres, a função termina, e uma nova requisição retoma com `Command(resume=...)`.
- **Conexões curtas com o banco.** Abrir conexão por operação, `autocommit=True`, `prepare_threshold=None`
  (necessário com o pooler do Neon).
- Nunca rodar agentes em rotas do Next.js; toda IA vive no Python.

## Convenções de código

- Python: tipado, funções pequenas, módulos em `api/_orion/` (o `_` impede a Vercel de tratar como função).
  `api/index.py` adiciona o próprio diretório ao `sys.path` e importa `_orion`.
- Chamadas ao modelo ficam isoladas em funções próprias (`decidir`, `redigir`, `propor_reuniao`...) para que os
  testes possam substituí-las sem chamar a API.
- Toda configuração vem de variáveis de ambiente lidas **dentro de funções** (não no import).
- Registrar atividade nunca pode derrubar o fluxo (try/except + log).
- Front: componentes client só onde há interatividade; um wrapper `lib/api.ts` para `fetch` que redireciona
  para `/login` em 401.

## Variáveis de ambiente

```
DATABASE_URL=postgresql://...          # Neon
ANTHROPIC_API_KEY=...
ORION_MODEL=claude-sonnet-5
ORION_WORKER_MODEL=claude-haiku-4-5
ORION_USERS=dimi:<senha>,jullyana:<senha>
ORION_APPROVERS=dimi,jullyana
ORION_SESSION_SECRET=<aleatório longo>
GITHUB_TOKEN=<token só leitura do repo do Orion>
GITHUB_WEBHOOK_SECRET=<segredo do webhook>
CRON_SECRET=<a Vercel envia como Bearer no cron>
```

## Comandos

- `npm run dev` — sobe Next (3000) e uvicorn (8000) juntos com `concurrently`; o Next reescreve `/api/*` para o 8000.
- `python scripts/setup_db.py` — aplica `db/schema.sql` e roda `PostgresSaver.setup()`.
- `pytest` — testes do backend (Postgres local + modelo simulado).
- `npm run build` — build do front.
