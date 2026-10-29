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
│       ├── ferramentas.py       # tools dos especialistas (changelog, documentos)
│       ├── documentos.py        # Docs: CRUD, versões, busca (full-text, ILIKE, aproximada)
│       ├── propostas_docs.py    # propostas dos agentes (criar/editar) que dependem de aprovação
│       ├── comercial.py         # Comercial: organizações, contatos, negócios (funil), interações
│       ├── propostas_comercial.py # propostas do Negócios para o CRM (dependem de aprovação)
│       ├── conversas.py         # chat: conversas além da "Geral"
│       ├── tarefas.py           # quadro Kanban por pessoa
│       ├── anexos.py            # arquivos no banco (documento/negócio)
│       ├── backup.py            # exportação geral em JSON
│       ├── texto.py             # sem_acento/radicais, compartilhados pelas buscas
│       ├── importacao.py        # importa markdown/Notion (pasta ou .zip)
│       ├── exportacao.py        # exporta os documentos para markdown
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
│       ├── docs/                # lista, novo/ e [id]/ (leitura, edição, histórico)
│       ├── comercial/           # abas Hoje/Funil/Organizações, negocios/[id], organizacoes/[id]
│       └── aprovacoes/page.tsx
├── components/                  # Office, Desk, ChatMessage, ApprovalCard, ActivityLog, Funil, Modal, NegocioForm, Paleta (Ctrl+K), EscalaPlanta, LogLateral, EditorVisual (Tiptap), ListaConversas, Comentarios, PainelAgente
├── lib/
│   ├── api.ts                   # fetch + tratamento de 401
│   ├── docs.ts                  # tipos e utilitários do módulo Docs
│   ├── comercial.ts             # tipos, etapas, moeda/data pt-BR, situação do próximo passo
│   ├── markdown.ts              # parser de markdown seguro (árvore, nunca HTML)
│   │                            #   títulos, listas, tarefas, tabelas, código, links
│   ├── paleta.ts / blocos.ts / modelos.ts  # busca Ctrl+K, menu "/" do editor, modelos de página
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
