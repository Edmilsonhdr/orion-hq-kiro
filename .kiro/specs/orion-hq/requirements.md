# Requirements Document

## Introdução

Primeira entrega do Orion HQ: uma aplicação web (Vercel) em que Dimi e Jullyana conversam com um Orquestrador
de IA que delega para agentes especialistas (Tech, Agenda, Negócios, Workers), com memória do projeto
alimentada pelo GitHub, aprovação humana para ações sensíveis e um escritório virtual que mostra os agentes
trabalhando em tempo real. Contexto de produto em `.kiro/steering/product.md`.

## Requirements

### Requirement 1 — Acesso

**User Story:** Como sócio, quero entrar com meu usuário e senha, para que só Dimi e Jullyana usem o Orion HQ.

#### Acceptance Criteria

1. QUANDO um usuário envia usuário e senha que constam em `ORION_USERS` ENTÃO o sistema DEVE criar uma sessão
   por cookie `httpOnly`, `SameSite=Lax`, assinado com HMAC (`ORION_SESSION_SECRET`) e válido por 30 dias.
2. QUANDO as credenciais forem inválidas ENTÃO o sistema DEVE responder 401 sem revelar qual campo errou.
3. QUANDO qualquer rota `/api/*` (exceto login, saúde, webhook e cron) for chamada sem sessão válida ENTÃO o
   sistema DEVE responder 401.
4. QUANDO o front receber 401 ENTÃO o sistema DEVE redirecionar para `/login`.
5. O sistema DEVE comparar senhas e assinaturas em tempo constante.

### Requirement 2 — Chat do grupo

**User Story:** Como sócio, quero um chat compartilhado com o Orquestrador, para que nós dois vejamos as mesmas
perguntas e respostas.

#### Acceptance Criteria

1. QUANDO um usuário envia uma mensagem ENTÃO o sistema DEVE salvá-la com autor e horário e iniciar um novo
   processamento (run) do grafo com um `run_id` próprio.
2. QUANDO o run termina ENTÃO o sistema DEVE salvar a resposta do Orquestrador como mensagem do autor
   "Orquestrador" vinculada ao mesmo `run_id`.
3. ENQUANTO a tela de chat estiver aberta o sistema DEVE buscar mensagens novas por polling incremental, de
   modo que uma mensagem enviada por um sócio apareça para o outro em até ~3 s.
4. ENQUANTO um run estiver em andamento o sistema DEVE mostrar no chat um indicador com a atividade mais
   recente dos agentes (ex.: "Tech · buscar_changelog(onboarding)").
5. QUANDO a mensagem começa com `/nota ` ENTÃO o sistema DEVE registrar o texto como nota no histórico do
   projeto sem chamar o modelo e responder "Anotado no histórico do projeto."
6. O Orquestrador DEVE receber como contexto as últimas 12 mensagens do grupo.
7. SE o run falhar ENTÃO o sistema DEVE registrar uma atividade `erro` e responder no chat com uma mensagem
   curta pedindo para tentar de novo, sem expor stack trace.

### Requirement 3 — Orquestrador e hierarquia

**User Story:** Como sócio, quero falar só com o Orquestrador e que ele decida qual especialista resolve, para
não precisar saber quem faz o quê.

#### Acceptance Criteria

1. QUANDO um pedido chega ENTÃO o Orquestrador DEVE escolher entre `tech`, `agenda`, `negocios` ou `responder`,
   com uma instrução autocontida e um motivo curto (saída estruturada).
2. QUANDO o Orquestrador delega ENTÃO o sistema DEVE registrar uma atividade `delegou` com `dados.de` e
   `dados.para`.
3. QUANDO um especialista termina ENTÃO o controle DEVE voltar ao Orquestrador com o relatório do especialista.
4. QUANDO o número de delegações do run chegar a 4 ENTÃO o Orquestrador DEVE responder com o que tiver.
5. A resposta final DEVE usar apenas o conteúdo dos relatórios e citar a fonte quando houver.
6. Somente o Orquestrador DEVE escrever mensagens no chat.

### Requirement 4 — Especialista Tech e memória do projeto

**User Story:** Como Jullyana, quero perguntar o que mudou no Orion e receber uma resposta com fonte, para
acompanhar o projeto sem depender do Dimi.

#### Acceptance Criteria

1. O agente Tech DEVE ter as ferramentas `buscar_changelog(consulta)` (full-text em português com fallback
   `ILIKE`) e `mudancas_recentes(dias)`.
2. QUANDO o Tech responde ENTÃO ele DEVE citar PR ou nota e data de cada item usado.
3. SE nada for encontrado ENTÃO o Tech DEVE dizer isso explicitamente.
4. CADA chamada de ferramenta DEVE gerar uma atividade `ferramenta` com o nome e os argumentos.
5. O loop de ferramentas DEVE ter no máximo 6 voltas.

### Requirement 5 — Ingestão do GitHub (Worker)

**User Story:** Como Dimi, quero que cada PR mergeado no repositório do Orion vire automaticamente um item do
histórico, para que os agentes saibam o que mudou sem eu precisar contar.

#### Acceptance Criteria

1. QUANDO o GitHub enviar um webhook `pull_request` com `action=closed` e `merged=true` ENTÃO o sistema DEVE
   buscar os arquivos alterados do PR e gerar um resumo em português com o modelo worker.
2. O sistema DEVE validar `X-Hub-Signature-256` com `GITHUB_WEBHOOK_SECRET` e responder 401 se inválida.
3. O resumo DEVE ser salvo no changelog com fonte `github`, referência `PR #<n>`, título, URL e autor; um
   mesmo PR NÃO DEVE gerar duas entradas (upsert).
4. O diff enviado ao modelo DEVE ser truncado (~12.000 caracteres).
5. QUANDO o resumo for salvo ENTÃO o Orquestrador DEVE postar no chat uma linha curta: "Novo no Orion: PR #n — título".
6. O processamento DEVE gerar atividades do agente `work`.
7. Eventos que não sejam PR mergeado DEVEM ser respondidos com 200 e ignorados.

### Requirement 6 — Agenda com aprovação humana

**User Story:** Como sócio, quero pedir uma reunião em linguagem natural e aprovar antes de ela ser criada, para
que nenhum agente aja sozinho fora do sistema.

#### Acceptance Criteria

1. QUANDO o Orquestrador delega para a Agenda ENTÃO ela DEVE produzir uma proposta estruturada (título, início
   ISO 8601 com fuso, duração, participantes, pauta) usando as mudanças dos últimos 7 dias para a pauta.
2. Datas relativas ("terça", "amanhã") DEVEM ser resolvidas para a próxima ocorrência no fuso de São Paulo.
3. QUANDO a proposta existir ENTÃO o grafo DEVE pausar com `interrupt()`, registrar a aprovação pendente e uma
   atividade `aguardando_aprovacao`; o registro DEVE ser idempotente (o nó reexecuta ao retomar).
4. QUANDO um usuário em `ORION_APPROVERS` aprovar ENTÃO o sistema DEVE retomar o grafo, criar a reunião no
   banco e devolver um link "adicionar ao Google Agenda" e um link `.ics`.
5. QUANDO um usuário recusar ENTÃO o sistema DEVE retomar o grafo sem criar a reunião e o Orquestrador DEVE
   informar no chat quem recusou.
6. SE os dois sócios decidirem ao mesmo tempo ENTÃO apenas a primeira decisão DEVE valer (update atômico com
   `status = 'pendente'`); a segunda DEVE receber "já decidida".
7. A aprovação DEVE funcionar mesmo que horas se passem entre o pedido e a decisão (estado no Postgres).

### Requirement 7 — Especialista Negócios

**User Story:** Como sócio, quero perguntar e registrar decisões de negócio, para ter um histórico do que
combinamos.

#### Acceptance Criteria

1. O agente Negócios DEVE ter `buscar_changelog`, `mudancas_recentes` e `registrar_decisao(titulo, descricao)`.
2. O agente NÃO DEVE inventar números; SE não houver dado ENTÃO DEVE dizer isso.

### Requirement 8 — Escritório virtual

**User Story:** Como sócio, quero ver os agentes trabalhando em tempo real, para entender o que está
acontecendo e achar problemas.

#### Acceptance Criteria

1. A tela DEVE mostrar a planta do escritório (872×688, pixel art, `docs/mockup-escritorio.dc.html`): 3 salas
   em cima (Engenharia, Sala do Chefe no centro, Agenda), corredor de madeira com a guarita do Vigia na ponta
   esquerda e 3 salas embaixo (Negócios, Copa, Baia dos Workers). Cada sala tem paredes, porta para o
   corredor, piso próprio, rótulo, 2–3 decorações e uma estação (mesa, cadeira, monitor, teclado, caneca).
2. ENQUANTO um agente tiver atividade de trabalho nos últimos 30 s E estiver na mesa ENTÃO a sala DEVE aparecer
   ativa (borda na cor do agente com brilho interno, tela "digitando", leve movimento, balão com o detalhe).
3. ENQUANTO houver aprovação pendente ENTÃO a sala da Agenda DEVE aparecer em espera (borda âmbar `#F2A541`
   pulsando).
4. QUANDO chegar uma atividade `delegou` ENTÃO um envelope DEVE sair da mesa `dados.de`, ir ao corredor, andar
   por ele e entrar na sala `dados.para` (4 pontos, ~0,5 s por trecho), sem passar pela guarita.
5. A tela DEVE mostrar um log com as atividades recentes (horário, cor do agente, detalhe) e os tokens
   gastos hoje por agente e no total.
6. A tela DEVE funcionar para quem abre no meio de um run (estado derivado das atividades, não de memória local).
7. Animações DEVEM respeitar `prefers-reduced-motion`.

### Requirement 9 — Tela de aprovações

**User Story:** Como sócio, quero uma fila de aprovações, para decidir rapidamente o que os agentes propuseram.

#### Acceptance Criteria

1. A tela DEVE listar pendentes (proposta legível + quem pediu + quando) com botões Aprovar e Recusar, e o
   histórico das decididas.
2. O cabeçalho de todas as telas DEVE mostrar um contador de aprovações pendentes.
3. As aprovações pendentes DEVEM aparecer também como cartão no topo do chat.

### Requirement 10 — Resumo semanal

**User Story:** Como sócio, quero um resumo semanal automático no chat, para começar a semana alinhados.

#### Acceptance Criteria

1. QUANDO o cron de segunda às 09:00 (São Paulo) disparar ENTÃO o sistema DEVE resumir o changelog dos últimos
   7 dias com o modelo worker e postar como mensagem do Orquestrador.
2. A rota DEVE exigir `Authorization: Bearer <CRON_SECRET>`.
3. SE não houver mudanças na semana ENTÃO a mensagem DEVE dizer isso em uma linha.

### Requirement 11 — Qualidade e operação

**User Story:** Como Dimi, quero testes e um setup simples, para evoluir o sistema com segurança.

#### Acceptance Criteria

1. Os testes do backend DEVEM cobrir, sem chamar a API da Anthropic: pergunta → Tech → resposta; pedido de
   reunião → interrupt → aprovação → reunião criada; recusa; dupla decisão concorrente; `/nota`; webhook com
   assinatura válida e inválida.
2. `scripts/setup_db.py` DEVE ser idempotente.
3. `GET /api/saude` DEVE responder 200 sem autenticação, informando se o banco está acessível.
4. O README DEVE explicar setup local, criação do Neon, variáveis, configuração do webhook do GitHub e deploy.

### Requirement 12 — Rotina do escritório (personagens, café, turnos, fim do dia)

**User Story:** Como sócio, quero que o escritório tenha personagens com rotina (café, turnos, noite), para a
tela ser agradável de acompanhar sem deixar de refletir o que os agentes estão fazendo de verdade.

#### Acceptance Criteria

1. Nomes, papéis, níveis, cores, pele/cabelo, acessórios e frases de ociosidade DEVEM ficar centralizados em
   `lib/agents.ts`: Atlas ou Nara (Orquestrador · N1, turnos), Tobias (Tech · N2), Lia (Agenda · N2), Bento
   (Negócios · N2), Pipo (Worker · N3) e Rui (Vigia · N2, cor `#FF7A59`, guarita no corredor). Componentes NÃO
   DEVEM ter nomes fixos; ids e valores no banco NÃO DEVEM mudar (nomes são só de exibição).
2. Todo estado visual (plantão, copa, noite) DEVE ser DERIVADO do relógio (fuso de São Paulo) e das atividades
   do banco, por funções puras em `lib/rotina.ts`; nada sorteado nem guardado só no navegador. Duas telas com os
   mesmos dados no mesmo instante DEVEM mostrar a mesma cena.
3. Cada sala DEVE ter crachá "Nome · Papel · Nível" acima do personagem e rodapé com ponto de status, última
   atividade (ou "na copa ☕") e tokens de hoje.
4. QUANDO um especialista (Tobias, Lia, Bento, Pipo, Rui) ficar mais de 2 min sem atividade durante o dia ENTÃO
   ele DEVE ir pela porta e pelo corredor até a Copa e sentar numa cadeira livre com uma xícara; a cadeira da
   sala fica vazia. A Copa tem 3 lugares; o próximo espera em pé perto da máquina de café e senta quando vagar,
   em ordem determinística.
5. QUANDO houver delegação para alguém na Copa ENTÃO o envelope DEVE ir até a Copa e a pessoa DEVE voltar mais
   rápido do que foi, antes de a sala ficar ativa. Com 2+ sentados, um balão "…" DEVE aparecer de vez em quando.
6. ENQUANTO houver aprovação pendente a Lia NÃO DEVE ir à Copa; ENQUANTO houver incidente aberto o Rui NÃO DEVE
   sair da guarita, e a luz da guarita DEVE piscar em `#FF7A59`.
7. A Sala do Chefe NUNCA DEVE ficar vazia: exatamente um Orquestrador de plantão, em turnos alternados de
   90 min a partir da meia-noite (00:00–01:30 Atlas, 01:30–03:00 Nara…), duração configurável em
   `lib/rotina.ts`. Na troca, quem sai vai à Copa por alguns minutos e some; quem entra vem da Copa até a mesa.
8. SE houver run em andamento na hora da troca ENTÃO a troca DEVE esperar o run terminar; o fim do adiamento
   DEVE ser derivado das atividades.
9. Mensagens do "Orquestrador" no chat DEVEM ser assinadas por quem estava de plantão no `criado_em`, com a cor
   e o avatar dessa pessoa (o banco continua guardando "Orquestrador"). Log e cartões DEVEM usar o nome de
   exibição no horário da atividade.
10. Das 19:00 às 08:00 (São Paulo) os especialistas NÃO DEVEM estar nas salas (sombra, cadeira vazia; o servidor
    da Engenharia continua piscando). Trabalho noturno DEVE acender a sala e mostrar a pessoa na mesa, que sai
    pela porta 2 min depois de terminar. O Orquestrador de plantão fica com luminária; o Rui fica na guarita com
    as câmeras acesas.
11. Com `prefers-reduced-motion` ninguém DEVE andar (personagens aparecem no destino). A planta DEVE ter
    `aria-label`; salas e guarita DEVEM ter texto acessível ("Tobias, Tech: na copa"); decoração DEVE ser
    `aria-hidden`; rodapés e rótulos DEVEM ter contraste ≥ 4,5:1, inclusive à noite.
12. Em desenvolvimento, `?relogio=HH:MM` DEVE simular o horário (as datas das atividades são deslocadas junto).
