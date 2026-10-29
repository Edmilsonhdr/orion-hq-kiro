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
| `GITHUB_TOKEN` | Token **só leitura** (fine-grained: Pull requests e Contents = Read) para ler os arquivos dos PRs. Usado para qualquer repositório sem token específico. |
| `GITHUB_TOKEN_<DONO>` | Opcional. Token de um dono específico (perfil ou organização), já que um token fine-grained só enxerga um dono. Nome em maiúsculas, com `-` virando `_`: dono `minha-org` → `GITHUB_TOKEN_MINHA_ORG`. |
| `GITHUB_WEBHOOK_SECRET` | Segredo configurado no webhook do GitHub (valida `X-Hub-Signature-256`). |
| `CRON_SECRET` | Segredo que a Vercel envia como `Bearer` nas chamadas de cron. |
| `ORION_BASE_URL` | URL pública do app, para links absolutos (ex.: `.ics` da reunião). Opcional na Vercel: sem ela, usa `VERCEL_PROJECT_PRODUCTION_URL`. Local: `http://localhost:3000`. |

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

## Docs (documentação própria)

Espaço de documentos em markdown dentro do Orion HQ, no lugar de Notion/Confluence (sem custo extra: usa o
mesmo Postgres). Acesse em **Docs** no cabeçalho (`/docs`).

- Criar/editar documentos com pasta e tags. O editor tem barra de formatação (títulos, negrito, listas,
  tarefas, citação, link, tabela), pré-visualização ao vivo lado a lado, **Ctrl+S** para salvar, aviso ao
  sair com alterações e **rascunho local** (recupera o texto se a aba fechar). O markdown é renderizado de
  forma segura, sem HTML bruto, com tabelas, listas de tarefas e **sumário lateral**.
- **Histórico de versões**: cada edição de título/conteúdo guarda a versão anterior (últimas 50), com
  restauração. Não há exclusão definitiva: só **arquivar**.
- **Busca** em título e conteúdo, em três passos: full-text em português (título pesa mais), substring
  (siglas, nomes próprios) e uma busca aproximada que **ignora acentos e plural** ("decisao" acha
  "Decisões"). A tecla `/` foca a busca; a barra lateral filtra por pasta e tag, com contagens.
- **Os agentes leem os documentos**: o Tech e o Negócios têm as ferramentas `buscar_documentos` e
  `ler_documento` e citam o documento (id, pasta e data) na resposta.
- **Escrita pelos agentes, só com aprovação**: pedindo no chat ("registra em docs a ata de hoje"), o agente
  usa `propor_documento` / `propor_edicao_documento`, que **só registram uma proposta**. Ela aparece em
  **Aprovações** com prévia; só ao aprovar o documento é criado/editado (autor
  `tech (aprovado por dimi)`), e o Orquestrador avisa no chat. Se o documento mudou depois da proposta,
  a edição não é aplicada (status `obsoleta`). Spec em `.kiro/specs/docs-escrita/`.
- Rotas: `/api/documentos*` (todas exigem sessão). Spec em `.kiro/specs/docs/`.

### Exportar (backup)

```bash
.venv/bin/python scripts/exportar_docs.py backup-docs.zip      # ou uma pasta; --arquivados inclui arquivados
```

Um `.md` por documento, em subpastas conforme a pasta, com frontmatter (título, pasta, tags, autor, datas).
É reimportável com `scripts/importar_docs.py`, que entende esse frontmatter.

### Importar do Notion / Confluence

Para trazer o que vocês já escreveram: no Notion, **Exportar → Markdown & CSV** (para o Confluence,
exporte as páginas para markdown). Depois, com `DATABASE_URL` configurada:

```bash
# simulação (padrão): mostra o que entraria, não grava nada
.venv/bin/python scripts/importar_docs.py caminho/export.zip
# grava de verdade
.venv/bin/python scripts/importar_docs.py caminho/export.zip --aplicar --autor dimi
```

O id do Notion no nome é removido, o título vem do primeiro `# Título` (ou do nome do arquivo), as
pastas viram a pasta do documento e tudo recebe a tag `importado`. Rodar de novo não duplica (mesmo
título na mesma pasta é pulado) e nunca sobrescreve. CSV, imagens e anexos são ignorados.

**Atalhos:** `Ctrl+K` abre a busca global (documentos, negócios, organizações e atalhos de navegação).
Em "Nova página" há modelos (ata, one-pager, retrospectiva, plano de lançamento). No editor, digitar `/` no
começo de uma linha abre o menu de blocos (títulos, listas, tarefas, tabela, citação, código).

**Escritório:** clique numa sala (ou na legenda) para abrir o painel do agente e filtrar o feed; selos
na planta levam a Aprovações e Incidentes; há mapa de calor de tokens, replay do dia, tema claro e quem
está online (heartbeat em `/api/presenca`; rode `scripts/setup_db.py` para criar a tabela `presenca`).

**Telas:** Início (resumo do dia), Chat com markdown, "consultou: …" e "Salvar no Docs", Comercial com
gráfico, importação de CSV e modelos de mensagem, Aprovações com filtros, lote e diff, Incidentes por
projeto, Docs com links `[[Título]]`, comentários com `@menção` e ordem das subpáginas. O login bloqueia
por 15 minutos após 5 falhas (tabela `login_tentativas`).

**Editor visual e conversas:** o editor de documentos abre no modo Visual (Tiptap, com tabelas, tarefas,
código e `[[links]]`) e tem o modo Markdown; o conteúdo é sempre markdown e só é reescrito quando você edita
no modo visual. O chat tem várias conversas (a "Geral" reúne avisos e resumos dos agentes); cada conversa
tem o seu histórico, que é o contexto dos agentes. Rode `scripts/setup_db.py` para criar a tabela `conversas`.

**Árvore do Docs:** a lateral do Docs tem a árvore de páginas; arraste uma página para antes, dentro ou
depois de outra (ou use Alt+↑/↓). No editor Markdown, digitar `[[` sugere páginas existentes.

**Subpáginas:** cada documento pode ter uma página pai (até 6 níveis, sem ciclos). A tela do documento mostra
as migalhas com os ancestrais, a lista de subpáginas e "Nova subpágina"; o editor tem o seletor "Página pai".
Arquivar uma página arquiva as subpáginas; desarquivar reabre só ela. A `pasta` continua existindo. A
exportação e a importação ainda não preservam a hierarquia de subpáginas (só a pasta).

Fora do escopo por enquanto: busca semântica, anexos e edição simultânea.

## Comercial (CRM leve)

Módulo para a venda do Orion a **clínicas, empresas e profissionais autônomos** (nutricionistas, nutrólogos e
educadores físicos). Fica em `/comercial`, com três abas:

- **Hoje:** próximos passos vencidos, de hoje, dos próximos 7 dias e negócios sem próximo passo.
- **Funil:** quadro com as etapas Lead → Contato → Demonstração → Piloto → Proposta → Ganho/Perdido (arrastar o
  cartão ou usar o seletor; "Perdido" pede o motivo). O funil segue o processo de piloto do Orion.
- **Organizações:** clínicas, empresas e autônomos, com contatos e negócios.

Cada negócio guarda valor mensal estimado, número de pacientes/alunos, pacote de interesse, o que o cliente usa
hoje, próximo passo com data e um histórico (ligações, reuniões, e-mails, WhatsApp, notas e mudanças de etapa).

**Só dados comerciais.** O CRM nunca deve guardar dados de saúde de pessoas; os formulários avisam disso e o
prompt do agente proíbe registrá-los.

No chat, o **Negócios** consulta o funil (`resumo_funil`, `buscar_negocios`, `ver_negocio`, `negocios_parados`,
`agenda_comercial`) e **propõe** criar negócios, atualizar etapa/dados e registrar interações. Nada é gravado
até um sócio aprovar em Aprovações; se o negócio mudou desde a proposta, ela vira `obsoleta` e nada é aplicado.
Toda segunda, junto do resumo do changelog, o cron posta no chat o resumo do funil (texto fixo, sem modelo).

Biblioteca comercial: modelos em `docs/comercial/` (roteiro de descoberta e demonstração, objeções, proposta e
checklist do piloto), com campos `[preencher]` e sem preços. Para levá-los ao Docs (pasta "Comercial"):

```bash
.venv/bin/python scripts/seed_comercial_docs.py            # simulação
.venv/bin/python scripts/seed_comercial_docs.py --aplicar  # grava (não duplica nem sobrescreve)
```

Fora do escopo: envio de e-mail/WhatsApp, importação de planilhas, metas por vendedor e perfis de permissão.

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
evento recebe **200** e é ignorado. Ao processar, busca os arquivos do PR (paginado), o worker resume o diff
(truncado em ~12.000 caracteres), grava no changelog e o Orquestrador posta uma linha curta no chat.

- PR que já está no changelog (reentrega): responde **200** sem resumir de novo nem repostar no chat.
- Sem token para o dono do repositório: responde **200** com um aviso e registra atividade `erro` do agente `work`.

O Orion tem front e back em repositórios separados (donos diferentes). Configure o webhook nos dois,
com a mesma URL e o mesmo secret. A referência no changelog inclui o repositório
(`dono/repo PR #n`), então PRs com o mesmo número em repositórios diferentes não se confundem.
- Qualquer outra falha: atividade `erro` do agente `work` e resposta **502** (dá para reenviar pelo GitHub).

### Limitação do timeout de 10 s do GitHub

O GitHub espera a resposta do webhook em **10 segundos**. Resumir o diff de um PR com o modelo pode passar
disso. Nesse caso o GitHub marca o envio como **timeout** na lista de entregas (Recent Deliveries), mas a
função serverless **continua rodando** até terminar (o `maxDuration` da função é 300 s) e o changelog é
gravado normalmente. Ou seja: o "timeout" no painel do GitHub é esperado e **aceitável nesta fase** — não
significa que o resumo falhou. Se necessário, é possível reenviar o evento pelo botão **Redeliver** do
GitHub; um PR já registrado não é resumido nem postado de novo.

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
.venv/bin/pytest -q
```

Build do front:

```bash
source ~/.nvm/nvm.sh
npm run build
```

## Pendências

Itens conhecidos, fora desta rodada:

- **Revogação de sessão:** o cookie assinado vale até expirar; não há como invalidar uma sessão antes disso
  (exceto trocando o `ORION_SESSION_SECRET`, o que derruba todas).
- **Rate limit no login:** não há limite de tentativas no `POST /api/login`.
- **Teste concorrente real:** a dupla decisão de aprovação é coberta por teste sequencial; falta um teste com
  requisições realmente simultâneas.
- **Escape do `.ics`:** título e pauta entram no iCalendar sem escapar `,`, `;` e `\`, nem quebrar linhas longas.
- **README para Windows:** as instruções assumem WSL/Linux; falta o passo a passo para rodar direto no Windows.

## Documentação do projeto

- Produto e regras de comportamento: `.kiro/steering/product.md`
- Stack técnica e convenções: `.kiro/steering/tech.md`
- Estrutura de pastas e nomes: `.kiro/steering/structure.md`
- Ambiente de execução (WSL): `.kiro/steering/ambiente.md`
- Spec (requisitos, design, tarefas): `.kiro/specs/orion-hq/`
