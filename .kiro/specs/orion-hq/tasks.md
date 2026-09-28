# Implementation Plan

- [x] 1. Estrutura do projeto e configuração
  - Criar o projeto Next.js (App Router, TypeScript) e a pasta `api/` conforme `structure.md`
  - `package.json` com script `dev` usando `concurrently` (next dev + `uvicorn api.index:app --reload --port 8000`)
  - `next.config.mjs` (rewrite), `vercel.json`, `requirements.txt`, `.env.example`, `.gitignore`
  - `api/index.py` com FastAPI mínimo e `GET /api/saude`
  - _Requirements: 11.3_

- [x] 2. Banco de dados
- [x] 2.1 Criar `db/schema.sql` e `scripts/setup_db.py` (aplica schema + `PostgresSaver.setup()`, idempotente)
  - _Requirements: 11.2_
- [x] 2.2 Implementar `_orion/config.py` (env em funções, `TZ`, ids dos agentes, `agora_formatado()` em PT-BR)
  e `_orion/db.py` (conexão curta, `consultar`/`um`/`executar`, `salvar_mensagem`, `historico_recente`)
  - _Requirements: 2.1, 2.6_
- [x] 2.3 Fixture de testes com Postgres local e limpeza entre testes
  - _Requirements: 11.1_

- [x] 3. Autenticação
- [x] 3.1 `_orion/auth.py`: token HMAC, cookie, dependência `usuario_atual`, `exigir_aprovador`
- [x] 3.2 Rotas `/login`, `/logout`, `/me` + testes (sucesso, senha errada, rota protegida sem cookie)
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 4. Atividades e modelos
- [x] 4.1 `_orion/atividades.py`: `emitir()` que nunca lança, `listar(desde)`, `tokens_hoje()`
  - _Requirements: 3.2, 8.5_
- [x] 4.2 `_orion/llm.py`: `principal()`, `worker()`, `texto()` (string ou blocos), `tokens()`
- [x] 4.3 Rotas `GET /atividades` e `GET /atividades/tokens`
  - _Requirements: 8.5, 8.6_

- [x] 5. Especialistas
- [x] 5.1 `_orion/ferramentas.py`: `buscar_changelog` (full-text + fallback ILIKE), `mudancas_recentes`, `registrar_decisao`
  - _Requirements: 4.1, 7.1_
- [x] 5.2 `_orion/especialistas.py`: `rodar_com_ferramentas` (máx. 6 voltas, atividade por ferramenta), `tech`, `negocios`
  - Testar com modelo fake que faz uma chamada de ferramenta e depois responde
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 7.2_
- [x] 5.3 `propor_reuniao` com saída estruturada `PropostaReuniao` e contexto das mudanças de 7 dias
  - _Requirements: 6.1, 6.2_

- [x] 6. Grafo do Orquestrador
- [x] 6.1 `_orion/grafo.py`: `Estado`, `Rota`, `decidir`, `redigir`, nós `supervisor`/`tech`/`negocios`/`agenda`/`responder`, limite de 4 passos
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
- [x] 6.2 Nó `aprovacao` com `interrupt()`, registro idempotente por `chave`, criação da reunião e links (Google + .ics)
  - _Requirements: 6.3, 6.4, 6.5_
- [x] 6.3 `_orion/execucao.py`: `conversar()` (inclui atalho `/nota`), `decidir_aprovacao()` com update atômico, finalização e tratamento de erro
  - _Requirements: 2.1, 2.2, 2.5, 2.7, 3.6, 6.6, 6.7_
- [x] 6.4 Testes do fluxo completo: pergunta → Tech → resposta; reunião → interrupt → aprovar; recusar; dupla decisão; `/nota`
  - _Requirements: 11.1_

- [x] 7. Rotas de chat, aprovações e reuniões
  - `GET /mensagens`, `POST /chat`, `GET /aprovacoes`, `POST /aprovacoes/{id}`, `GET /reunioes`, `GET /reunioes/{id}.ics`
  - Testes com `TestClient`
  - _Requirements: 2.1, 2.3, 6.4, 6.5, 6.6, 9.1_

- [x] 8. GitHub e resumo semanal
- [x] 8.1 `_orion/github.py` + `POST /webhooks/github` (assinatura, filtro de evento, arquivos do PR, resumo worker, upsert, aviso no chat)
  - Testes: assinatura válida/inválida, evento ignorado, upsert sem duplicar (httpx e modelo simulados)
  - _Requirements: 5.1–5.7_
- [x] 8.2 `_orion/resumo.py` + `GET /cron/resumo-semanal` com Bearer `CRON_SECRET`
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 9. Front: base
- [x] 9.1 `app/layout.tsx` (pt-BR, fontes, `globals.css` com a paleta do design), `lib/api.ts`, `lib/usePoll.ts`, `lib/agents.ts`
  - _Requirements: 1.4, 2.3_
- [x] 9.2 `app/login/page.tsx` e `app/(hq)/layout.tsx` (checa `/me`, navegação Chat/Escritório/Aprovações, contador de pendentes, sair)
  - _Requirements: 1.4, 9.2_

- [x] 10. Front: chat
  - Lista de mensagens por polling, envio sem bloquear a tela, indicador "trabalhando…" com a última atividade do run, cartões de aprovação no topo
  - _Requirements: 2.3, 2.4, 9.3_

- [x] 11. Front: escritório virtual
- [x] 11.1 `components/Office.tsx` e `Desk.tsx`: mesas em pixel art, linhas da hierarquia, estados ativo/ocioso/espera derivados das atividades
  - _Requirements: 8.1, 8.2, 8.3, 8.6_
- [x] 11.2 Envelope animado a cada `delegou`, log lateral, tokens do dia, `prefers-reduced-motion`
  - _Requirements: 8.4, 8.5, 8.7_
- [x] 11.3 `scripts/seed_demo.py` que insere uma sequência de atividades de exemplo para testar a tela sem gastar tokens

- [x] 12. Front: aprovações
  - Pendentes com Aprovar/Recusar e histórico das decididas; tratar "já decidida"
  - _Requirements: 9.1, 6.6_

- [x] 13. Documentação e verificação final
  - README: setup local, Neon, variáveis, webhook do GitHub (evento Pull requests, content type JSON, segredo), deploy na Vercel, limitação do timeout de 10 s do GitHub
  - Rodar `pytest` e `npm run build` sem erros
  - _Requirements: 11.4_
