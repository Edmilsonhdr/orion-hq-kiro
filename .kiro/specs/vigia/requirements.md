# Requirements Document

## Introdução

Segunda entrega do Orion HQ: o **Vigia** (id `vigia`, nome de exibição **Rui**), um novo agente N2 que
detecta erros de produção do Orion (app React Native/Expo e backend Fastify) via Sentry, investiga com a
ajuda do Tobias (Tech) e explica o problema no chat com causa provável e arquivos suspeitos.

Esta fase cobre **somente detectar e diagnosticar**. O Vigia NÃO altera código, NÃO abre PR e NÃO faz
deploy — isso será uma fase futura, que dependerá da confiabilidade desta.

Pré-requisitos já existentes no projeto: a spec original em `.kiro/specs/orion-hq/`, o escritório virtual
com o Rui na guarita do corredor e o `lib/agents.ts` com os nomes de exibição.

## Requirements

### Requirement 1 — Receber erros do Sentry

**User Story:** Como Dimi, quero que todo erro novo do Orion em produção chegue ao Orion HQ
automaticamente, para não depender de usuário reclamando.

#### Acceptance Criteria

1. O sistema DEVE expor `POST /api/webhooks/sentry` sem sessão, protegido pela assinatura
   `Sentry-Hook-Signature` (HMAC-SHA256 hex do corpo bruto com `SENTRY_CLIENT_SECRET`), verificada com
   `hmac.compare_digest`.
2. SE a assinatura for inválida ou ausente, ou `SENTRY_CLIENT_SECRET` estiver vazio, ENTÃO o sistema DEVE
   responder 401.
3. QUANDO o recurso (`Sentry-Hook-Resource`) for `issue` com ação `created`, ou `event_alert`, ENTÃO o
   sistema DEVE registrar ou atualizar um incidente.
4. QUANDO o recurso for `issue` com ação `resolved` ou `ignored` ENTÃO o sistema DEVE atualizar o status
   do incidente correspondente (`resolvido` / `ignorado`).
5. Outros recursos e ações DEVEM ser respondidos com 200 `{"ignorado": true}`.
6. O mesmo `sentry_issue_id` NÃO DEVE gerar dois incidentes: evento repetido só atualiza `ocorrencias`,
   `usuarios_afetados` e `ultima_vez`, sem novo diagnóstico.
7. O projeto do Sentry DEVE ser mapeado para `app` ou `backend` via `ORION_SENTRY_PROJETOS`
   (ex.: `orion-app:app,orion-api:backend`); slug desconhecido → `desconhecido`.
8. O parser DEVE ser tolerante: campos ausentes no payload não podem derrubar a requisição.

### Requirement 2 — Privacidade dos dados de erro

**User Story:** Como sócio de um app de saúde, quero garantir que dados pessoais e de saúde dos usuários
nunca sejam enviados ao modelo de IA nem guardados no Orion HQ.

#### Acceptance Criteria

1. O sistema DEVE filtrar os dados do Sentry por **lista de permissão** (whitelist), guardando e enviando
   ao modelo apenas: título, tipo e mensagem do erro, nível, culpado, stack trace (arquivo, função, linha,
   módulo), release, ambiente, tags técnicas permitidas, contagens e URL do Sentry.
2. E-mail, IP, nome, id de usuário, headers, cookies, query string, corpo de requisição, variáveis locais
   de stack frames, breadcrumbs e contexto de usuário NUNCA DEVEM ser guardados nem enviados ao modelo.
3. A mensagem de erro DEVE passar por uma máscara que substitui e-mails, CPFs, telefones e números longos
   por `[removido]`.
4. Os testes DEVEM provar os critérios 2.1 a 2.3 com um payload contendo dados pessoais.

### Requirement 3 — Diagnóstico pelo Rui com ajuda do Tobias

**User Story:** Como Dimi, quero receber a causa provável do erro e os arquivos suspeitos, para corrigir
rápido ou decidir se é grave.

#### Acceptance Criteria

1. QUANDO um incidente NOVO for registrado ENTÃO o sistema DEVE disparar um diagnóstico (fora do chat,
   como o webhook do GitHub), com atividades do agente `vigia`.
2. O Rui DEVE ter apenas ferramentas somente leitura: `detalhe_incidente`, `incidentes_abertos`,
   `buscar_changelog`, `mudancas_recentes`, `commits_recentes(dias)` e `pedir_ao_tobias(pergunta)`.
3. `pedir_ao_tobias` DEVE executar o Tobias com a ferramenta `ler_arquivo_repo(caminho, ref)` e emitir
   atividades `delegou` de `vigia` para `tech` e de volta, para aparecer no escritório.
4. `ler_arquivo_repo` e `commits_recentes` DEVEM usar a API do GitHub no repositório `ORION_GITHUB_REPO`,
   com `GITHUB_TOKEN` somente leitura; `ler_arquivo_repo` DEVE recusar `.env*`, chaves e arquivos acima de
   40.000 caracteres (trunca com aviso).
5. O resultado DEVE ser salvo em `incidentes.diagnostico` com: `resumo`, `causa_provavel`, `confianca`
   (baixa | media | alta), `arquivos_suspeitos` [{caminho, motivo}], `pr_relacionado`, `impacto`,
   `proximo_passo`, `corrigivel_automaticamente` e `motivo`.
6. `corrigivel_automaticamente` DEVE ser forçado para `false` **por código** (não pelo modelo) quando o
   culpado ou qualquer arquivo suspeito casar com os padrões de `ORION_AREAS_PROIBIDAS`.
7. SE o Rui não encontrar a causa ENTÃO a confiança DEVE ser `baixa` e o `proximo_passo` DEVE dizer o que
   falta investigar. O Rui NÃO DEVE inventar arquivos, PRs ou números.
8. QUANDO o diagnóstico terminar ENTÃO o status DEVE ir para `diagnosticado` e o Orquestrador DEVE postar
   no chat um resumo de 1–3 frases com projeto, usuários afetados, causa provável e "Detalhes em Incidentes".
9. SE o diagnóstico falhar ENTÃO o incidente continua `aberto`, uma atividade `erro` do `vigia` é registrada
   e o chat avisa que o diagnóstico falhou.
10. SE não houver stack trace disponível ENTÃO o diagnóstico DEVE seguir com o que houver e marcar
    confiança `baixa`.

### Requirement 4 — Limite de custo

**User Story:** Como sócio, quero que uma enxurrada de erros não gere uma conta alta de IA.

#### Acceptance Criteria

1. O sistema NÃO DEVE executar mais de `ORION_MAX_DIAGNOSTICOS_HORA` diagnósticos (padrão 5) numa janela
   móvel de 60 minutos.
2. Acima do limite, o incidente DEVE ser registrado como `aberto` sem diagnóstico, e o chat DEVE receber
   no máximo UM aviso por hora dizendo que há incidentes na fila.
3. Todas as chamadas ao modelo do diagnóstico DEVEM registrar tokens nas atividades.
4. O diagnóstico DEVE usar no máximo 8 voltas de ferramentas do Rui e 6 do Tobias.

### Requirement 5 — Perguntar sobre erros no chat

**User Story:** Como Jullyana, quero perguntar no chat se tem algo quebrado, para acompanhar a saúde do
app sem abrir o Sentry.

#### Acceptance Criteria

1. O supervisor DEVE ganhar a rota `vigia` para perguntas sobre erros, falhas, instabilidade ou incidentes.
2. Nessa rota, o Rui DEVE responder a partir dos incidentes e diagnósticos já registrados, sem iniciar um
   novo diagnóstico.
3. SE não houver incidentes abertos ENTÃO a resposta DEVE dizer isso claramente.

### Requirement 6 — Tela de incidentes

**User Story:** Como sócio, quero uma tela com os incidentes e seus diagnósticos, para decidir o que fazer.

#### Acceptance Criteria

1. Nova página `Incidentes` na navegação, com contador de incidentes `aberto` no cabeçalho.
2. A lista DEVE mostrar título, projeto, nível, ocorrências, usuários afetados, última vez e status, com
   os abertos primeiro.
3. O detalhe DEVE mostrar o diagnóstico de forma legível (confiança com rótulo, arquivos suspeitos com
   motivo, PR relacionado como link) e o link para o Sentry.
4. Botões: "Marcar como resolvido", "Ignorar" e, para incidentes na fila sem diagnóstico,
   "Diagnosticar agora" (respeitando o limite do Requirement 4).
5. Botão "Propor correção" visível e desabilitado, com o texto "em breve".
6. Todas as rotas de incidentes DEVEM exigir sessão.

### Requirement 7 — Escritório

**User Story:** Como sócio, quero ver o Rui trabalhando quando algo quebra.

#### Acceptance Criteria

1. ENQUANTO houver incidente `aberto` a luz de alerta da guarita DEVE piscar em `#FF7A59`.
2. As atividades do `vigia` DEVEM aparecer no balão do Rui e no log, como as dos outros agentes.
3. As delegações `vigia → tech` DEVEM mostrar o envelope andando da guarita até a Engenharia e de volta.
4. O Rui NÃO DEVE ir para a copa enquanto houver incidente `aberto`.

### Requirement 8 — Qualidade e documentação

**User Story:** Como Dimi, quero testar tudo sem depender do Orion nem gastar tokens.

#### Acceptance Criteria

1. Os testes NÃO DEVEM chamar a Anthropic, o GitHub nem o Sentry de verdade.
2. Cenários obrigatórios: assinatura válida/inválida/sem segredo; deduplicação; resolved/ignored;
   remoção de dados pessoais; área proibida força `false`; limite por hora e aviso único; diagnóstico
   salvo + mensagem no chat; falha no diagnóstico; rota `vigia` do supervisor; rotas exigem sessão.
3. `scripts/seed_incidente.py` DEVE simular um webhook assinado do Sentry contra o servidor local ou de
   produção (URL e segredo por argumento/env).
4. O README DEVE ganhar a seção "Conectar o Orion ao Vigia" (ver design) e a lista das novas variáveis.
5. `schema.sql` e `setup_db.py` continuam idempotentes.
