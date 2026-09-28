# Orion HQ

Ecossistema de agentes de IA de Dimi e Jullyana, sócios do **Orion** (app B2C de saúde com copiloto de IA).
O Orion HQ é o "chefe de gabinete" dos dois: responde perguntas sobre o projeto, acompanha o que muda no
código, propõe reuniões e registra decisões. É um produto **separado** do app Orion — ele observa o
repositório do Orion, mas não altera o app.

Interface e respostas em **português do Brasil**. Fuso: `America/Sao_Paulo`.

## Arquitetura

Projeto único na Vercel: front **Next.js** (App Router + TypeScript) e backend **FastAPI** (Python) como
função serverless. Toda a IA vive no backend, orquestrada por um `StateGraph` do LangGraph com estado
persistido no Postgres (Neon). O front não usa WebSocket: lê mensagens, atividades e aprovações por
**polling incremental** (`?desde=<ultimo_id>`).

```
Navegador (Dimi / Jullyana)
   │  polling /api/mensagens, /api/atividades, /api/aprovacoes   POST /api/chat, /api/aprovacoes/{id}
   ▼
Next.js (Vercel) ──rewrite /api/*──► FastAPI api/index.py (Vercel Python, maxDuration 300)
                                        ├── LangGraph (supervisor → especialistas → aprovação → resposta)
                                        │       └── Claude (Sonnet: orq/especialistas · Haiku: worker)
                                        └── Neon Postgres (mensagens, atividades, changelog, aprovacoes,
                                                            reunioes + tabelas do checkpointer)
GitHub ──webhook PR merged──► /api/webhooks/github ──► worker resume o diff ──► changelog
Vercel Cron (seg 09:00 BRT) ──► /api/cron/resumo-semanal
```

Estrutura de pastas detalhada em `.kiro/steering/structure.md`.

## Setup local

O ambiente de desenvolvimento roda dentro do **WSL (Ubuntu-22.04)**. Todos os comandos abaixo devem ser
executados no shell do WSL, na raiz do projeto.

### Pré-requisitos

- **Node** via `nvm` (o front usa Next.js 16). Carregue o nvm antes de comandos de Node:
  ```bash
  source ~/.nvm/nvm.sh
  ```
- **Python 3.10** local (a Vercel usa 3.12 — o código funciona nos dois, sem recursos exclusivos do 3.12).
- Um banco Postgres acessível (Neon para produção; ver seção abaixo). Para testes, o projeto sobe um
  Postgres local efêmero via `pgserver`.

### Dependências

```bash
# Front
source ~/.nvm/nvm.sh
npm install

# Backend — sempre no virtualenv do projeto (.venv)
.venv/bin/python -m pip install -r requirements-dev.txt
```

`requirements.txt` tem só o que roda em produção (é o que a Vercel instala), com versões fixas.
`requirements-dev.txt` inclui o de produção e acrescenta `pytest`, `uvicorn` e `pgserver`.

Se precisar recriar o `.venv` (o Ubuntu não tem `python3-venv`):

```bash
python3 -m venv --without-pip .venv
# instalar pip com get-pip.py (sem sudo)
```

### Variáveis de ambiente

Copie o modelo e preencha os valores:

```bash
cp .env.example .env
```

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do Postgres no Neon. Use o endpoint do **pooler** (`…-pooler…`) para conexões curtas de função serverless. Ex.: `postgresql://usuario:senha@ep-exemplo-pooler.us-east-1.aws.neon.tech/orion?sslmode=require` |
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic. |
| `ORION_MODEL` | Modelo principal (orquestrador e especialistas). Padrão: `claude-sonnet-5`. |
| `ORION_WORKER_MODEL` | Modelo worker (tarefas curtas/baratas). Padrão: `claude-haiku-4-5`. |
| `ORION_USERS` | Usuários no formato `usuario:senha` separados por vírgula. Ex.: `dimi:<senha>,jullyana:<senha>`. |
| `ORION_APPROVERS` | Quem pode aprovar ações sensíveis (subconjunto de `ORION_USERS`). Ex.: `dimi,jullyana`. |
| `ORION_SESSION_SECRET` | Segredo aleatório longo para assinar o cookie de sessão (HMAC). |
| `GITHUB_TOKEN` | Token **só leitura** do repositório do Orion (para ler arquivos de PRs). |
| `GITHUB_WEBHOOK_SECRET` | Segredo configurado no webhook do GitHub (valida `X-Hub-Signature-256`). |
| `CRON_SECRET` | Segredo que a Vercel envia como `Bearer` nas chamadas de cron. |

### Preparar o banco

Aplica `db/schema.sql` e roda `PostgresSaver.setup()` (idempotente — pode rodar de novo sem problema):

```bash
.venv/bin/python scripts/setup_db.py
```

### Rodar em desenvolvimento

```bash
source ~/.nvm/nvm.sh
npm run dev
```

Sobe o Next (porta 3000) e o uvicorn (porta 8000) juntos com `concurrently`. O Next reescreve `/api/*`
para `127.0.0.1:8000` em desenvolvimento (ver `next.config.mjs`).

Para popular o escritório virtual com atividades de exemplo (sem gastar tokens):

```bash
.venv/bin/python scripts/seed_demo.py
```

## Criar o banco no Neon

1. No painel da **Vercel**, abra o projeto → aba **Storage** → **Marketplace** → **Neon** e crie um banco
   Postgres (ou crie direto em [neon.tech](https://neon.tech) e conecte).
2. A integração provisiona as variáveis de conexão no projeto da Vercel automaticamente. Copie a string de
   conexão do **pooler** (o host contém `-pooler`) para `DATABASE_URL`.
3. Localmente, cole o mesmo valor em `.env` e rode `scripts/setup_db.py` para criar as tabelas e as tabelas
   do checkpointer do LangGraph.

O driver usado é o `psycopg` 3. As conexões são curtas (uma por operação), com `autocommit=True` e
`prepare_threshold=None`, necessário com o pooler do Neon.

## Configurar o webhook do GitHub

No repositório do **Orion** (não neste repositório): **Settings → Webhooks → Add webhook**.

- **Payload URL**: `https://<seu-projeto>.vercel.app/api/webhooks/github`
- **Content type**: `application/json`
- **Secret**: o mesmo valor de `GITHUB_WEBHOOK_SECRET`
- **Which events**: selecione **Let me select individual events** e marque apenas **Pull requests**
- Deixe o webhook **Active**

O backend valida a assinatura `X-Hub-Signature-256` com o segredo e responde **401** se for inválida.
Só processa eventos de **pull request fechado com merge** (`action=closed` e `merged=true`); qualquer outro
evento recebe **200** e é ignorado. Ao processar, o worker resume o diff (truncado em ~12.000 caracteres),
grava no changelog (upsert por `PR #<n>`, sem duplicar) e o Orquestrador posta uma linha curta no chat.

### Limitação do timeout de 10 s do GitHub

O GitHub espera a resposta do webhook em **10 segundos**. Resumir o diff de um PR com o modelo pode passar
disso. Nesse caso o GitHub marca o envio como **timeout** na lista de entregas (Recent Deliveries), mas a
função serverless **continua rodando** até terminar (o `maxDuration` da função é 300 s) e o changelog é
gravado normalmente. Ou seja: o "timeout" no painel do GitHub é esperado e **aceitável nesta fase** — não
significa que o resumo falhou. Se necessário, é possível reenviar o evento pelo botão **Redeliver** do
GitHub; o upsert evita entradas duplicadas.

## Deploy na Vercel

1. Conecte o repositório do Orion HQ a um projeto na Vercel.
2. Configure todas as variáveis de ambiente da tabela acima em **Settings → Environment Variables**
   (o `DATABASE_URL` do Neon já entra pela integração do Marketplace; `CRON_SECRET` é gerado pela Vercel).
3. O `requirements.txt` na raiz (só dependências de produção, versões fixas) é o que a Vercel usa para o backend Python; o `api/index.py` vira a função
   serverless (o prefixo `_` em `api/_orion/` impede a Vercel de tratar os módulos internos como funções).
4. `vercel.json` define `maxDuration: 300` para `api/index.py` e o cron do resumo semanal
   (`0 12 * * 1` em UTC = segunda-feira 09:00 em São Paulo). Confira na documentação da Vercel os limites
   de duração do plano em uso.
5. Após o deploy, configure o webhook do GitHub apontando para a URL de produção (seção acima).

## Testes e build

Backend (Postgres local efêmero + modelo simulado, sem chamar a API da Anthropic):

```bash
.venv/bin/pytest
```

Build do front:

```bash
source ~/.nvm/nvm.sh
npm run build
```

## Documentação do projeto

- Produto e regras de comportamento: `.kiro/steering/product.md`
- Stack técnica e convenções: `.kiro/steering/tech.md`
- Estrutura de pastas e nomes: `.kiro/steering/structure.md`
- Ambiente de execução (WSL): `.kiro/steering/ambiente.md`
- Spec (requisitos, design, tarefas): `.kiro/specs/orion-hq/`
