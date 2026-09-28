---
inclusion: always
---

# Orion HQ — estrutura do projeto

```
orion-hq/
├── api/
│   ├── index.py                 # app FastAPI (todas as rotas /api/*)
│   └── _orion/
│       ├── config.py            # env, fuso, ids dos agentes, data formatada em PT-BR
│       ├── db.py                # conexão, consultar/um/executar, helpers de mensagens
│       ├── atividades.py        # emitir(), listar(), tokens_hoje()
│       ├── auth.py              # login, cookie assinado (HMAC), dependência usuario_atual
│       ├── llm.py               # modelos (principal/worker), texto(), tokens()
│       ├── ferramentas.py       # tools dos especialistas (busca no changelog etc.)
│       ├── especialistas.py     # tech, negocios, agenda (loop de ferramentas próprio)
│       ├── grafo.py             # StateGraph: supervisor, especialistas, aprovacao, responder
│       ├── execucao.py          # conversar(), decidir_aprovacao(), finalização
│       ├── github.py            # webhook: verificar assinatura, resumir PR (worker)
│       └── resumo.py            # resumo semanal (cron)
├── app/                         # Next.js App Router
│   ├── layout.tsx               # html pt-BR, fontes, globals.css
│   ├── page.tsx                 # redireciona para /chat
│   ├── login/page.tsx
│   └── (hq)/
│       ├── layout.tsx           # checa sessão, cabeçalho e navegação
│       ├── chat/page.tsx
│       ├── escritorio/page.tsx
│       └── aprovacoes/page.tsx
├── components/                  # Office, Desk, ChatMessage, ApprovalCard, ActivityLog
├── lib/
│   ├── api.ts                   # fetch + tratamento de 401
│   ├── usePoll.ts               # hook de polling incremental
│   └── agents.ts                # metadados dos agentes (id, nome, nível, cor, posição)
├── db/schema.sql
├── scripts/setup_db.py
├── tests/                       # pytest do backend
├── requirements.txt
├── package.json
├── next.config.mjs              # rewrite /api/* (dev → 127.0.0.1:8000, prod → /api/)
├── vercel.json                  # maxDuration e crons
└── .env.example
```

## Nomes

- Domínio em **português** (mensagens, atividades, aprovacoes, reunioes, changelog), código em estilo
  idiomático de cada linguagem (snake_case no Python, camelCase no TS).
- Ids de agente idênticos no Python e no TS: `orq`, `tech`, `agenda`, `negocios`, `work`.
- Tipos de atividade: `inicio`, `pensando`, `delegou`, `ferramenta`, `aguardando_aprovacao`, `concluiu`,
  `resposta`, `erro`.
