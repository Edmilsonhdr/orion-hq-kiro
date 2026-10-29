# Orion — fluxos, regras de negócio e pendências

Reúne o que atravessa os três repositórios: os **fluxos de ponta a ponta**, as **regras de negócio em lista** (consulta rápida), as **divergências confirmadas** entre código e documentação, e as **pendências declaradas** pelos próprios repositórios. Lido em 29/10/2026; estado dos branches em [00](00-visao-geral.md).

## 1. Fluxos de ponta a ponta

### 1.1 Do cadastro do profissional à primeira consulta
1. O profissional **cria a conta** no site (`/cadastro`, 4 passos), recebe o e-mail de confirmação e confirma. A conta entra liberada, sem análise de documentos.
2. No **Painel**, segue a lista de **primeiros passos**: completar o perfil, cadastrar a clínica, definir o link da teleconsulta, convidar a equipe.
3. **Cadastra o paciente** (4 passos). A API cria a conta com senha temporária e envia o **convite por e-mail** (link de 7 dias para definir a senha).
4. O paciente abre o link, define a senha, instala o app, aceita os termos e faz o **onboarding**. O vínculo fica **aguardando aceite** dele no app; isso não bloqueia o acesso do profissional.
5. O profissional configura o **protocolo** (metas e diretrizes) e monta o **plano alimentar** (do zero, de um modelo ou sugerido pela IA); ao **ativar**, o paciente recebe um aviso e o plano aparece no app.
6. Marca a **consulta** (presencial ou online).

*Alternativa:* o paciente já tem conta e se vincula sozinho, digitando o código `OR-XXXXXX` do profissional na aba Mais; esse vínculo já nasce aceito.

### 1.2 O dia a dia do paciente (nutrição)
1. Registra refeições (texto, foto ou voz), água, sono, treino e, em *Meu corpo*, o peso.
2. A IA identifica os alimentos; o **servidor calcula os macros pela TACO**. O dia é atualizado e a **sequência** sobe.
3. No plano, usa **Comi isso** e **Como fazer**; na dúvida, conversa com o Orion.
4. Responde as **perguntas rápidas** por notificação.
5. Se tiver relógio conectado, os dados entram sozinhos ao abrir o app.

### 1.3 O que o profissional vê e faz (nutrição)
1. **Painel** e **Para ver hoje** apontam quem precisa de atenção, com os motivos.
2. Em **Sinais** e **Alertas**, entende o problema e **resolve, adia ou contata** o paciente pelo WhatsApp (mensagem pronta; sai do WhatsApp do próprio profissional).
3. Em **Revisar refeições**, confere o que a IA estimou.
4. Na **ficha**, ajusta metas (nova versão do protocolo), muda o plano e registra a evolução.
5. Em **Relatórios**, gera os PDFs para a consulta e pode enviá-los ao e-mail do paciente.

### 1.4 Anamnese respondida pelo paciente
1. Ficha → Prontuário → **Nova anamnese**, escolhendo um modelo; a API guarda uma **cópia** das perguntas.
2. O profissional abre o rascunho e **envia ao paciente**. O paciente recebe um aviso (e e-mail, se não desligou).
3. No app, em **Formulários**, o paciente responde uma pergunta por vez (salvo sozinho) e **envia**.
4. As respostas voltam como **rascunho**. O profissional **revisa e conclui**; só então os campos ligados ao perfil (alergias, doenças, medicamentos) atualizam o prontuário. Concluída, a anamnese não se apaga.

### 1.5 Plano alimentar e aderência
1. O profissional **ativa** o plano (o ativo anterior é arquivado) e o paciente o vê em *Meu plano*.
2. O paciente toca **Comi isso** em cada refeição (previsto, pulou ou troca).
3. O Orion calcula a **aderência** por refeição; se ficar baixa, gera o sinal **Pouca aderência ao plano**.
4. Mudou o plano? As **receitas** ficam desatualizadas e somem para o paciente até serem revisadas e liberadas.

### 1.6 Teleconsulta
1. Ao marcar a consulta, o profissional escolhe **Consulta online** e confirma o link (`https`, com padrão do perfil).
2. O paciente recebe um aviso na caixa do app e vê, na tela inicial, o **banner** da consulta; de 15 minutos antes até 1 hora depois, o banner fica em destaque com **Entrar**. O profissional entra pelo botão **Entrar** da agenda.

### 1.7 Educação Física: da ficha ao acompanhamento
1. O educador cadastra o aluno (ou o aluno se vincula pelo código) e **monta a ficha** (do zero, de um modelo ou duplicando), a **ativa**; o aluno recebe um aviso.
2. No app, o aluno escolhe o treino do dia (o sugerido é o que está há mais tempo sem fazer), registra **série a série**, usa o **cronômetro de descanso** e **conclui** com esforço e anotação.
3. O educador acompanha pelo **painel** (quem está sem ficha, parado, com meta em risco) e pelo **acompanhamento** do aluno (frequência, evolução de carga), e pode enviar o **relatório de treino** em PDF por e-mail.

### 1.8 Exclusão de conta pelo paciente
1. No app: Mais → **Excluir minha conta**; a tela mostra o que é apagado e o que os profissionais guardam, oferece baixar os dados antes, pede a **senha** e uma confirmação.
2. A API apaga na hora o que é só do paciente e deixa a conta **sem login e sem dado pessoal**, âncora do prontuário retido, até o fim do prazo de guarda (padrão provisório de 20 anos).
3. O job diário de purga (4h) apaga o que venceu.

## 2. Regras de negócio — consulta rápida

| Assunto | Regra |
|---|---|
| Macros | Sempre calculados no servidor (TACO + alimentos da clínica); a IA só identifica alimentos e gramas. Origem: `taco`, `mixed`, `estimated` ou `manual` (revisado) |
| Plano por IA | Só ativa com confirmação de revisão; porções ajustadas a ±5% da meta de cada refeição; alimento que a TACO não conhece sai; restrições e alergias travam |
| Plano e ficha | Ativar arquiva o ativo anterior; arquivado não se edita (duplica-se); só rascunho de plano se apaga; ficha ativa não se apaga |
| Protocolo | Toda mudança é nova versão; a anterior é arquivada com motivo; pode comparar, duplicar e reativar |
| Meta de calorias | O Orion **sugere** pelo gasto energético; nunca grava sozinho |
| Receita | Nasce rascunho; só o publicado e em dia com o plano aparece ao paciente |
| Anamnese | Cópia das perguntas no início; resposta do paciente volta como rascunho; concluída não se apaga |
| Sequência | +1 por dia seguido; 1 escudo a cada 10 dias (máx. 3); faltar um dia gasta um escudo; sem escudo volta a 1 |
| Alerta | Máx. um por paciente por dia e nenhum igual enquanto houver um não lido; adiar por 1, 3 ou 7 dias; inatividade = mais de 48 h sem registro |
| Sinal | Calculado na hora, janela de 14 dias; gravidade alta, média ou baixa; 23 códigos (inclui 4 do relógio e 1 de aderência ao plano) |
| Consulta | Estados marcada, realizada, falta, cancelada; realizada não se remarca; conflito de horário avisa mas permite; online exige link `https`; motivo de cancelamento é interno |
| Aviso | Caixa do app; sem dado clínico; só plano atualizado e formulário enviado também vão por e-mail; lidos apagados em 90 dias |
| Documentos | Emitido não se edita (cancela e emite outro); sequência por profissional; **desligado por padrão** |
| Financeiro | Centavos inteiros; repetição de 1 a 12 meses; recibo numerado por profissional e ano; registro manual; **desligado por padrão** |
| Relógio | Consentimento por tipo de dado; liberado por `WEARABLES_ENABLED`; treino do relógio dentro da janela da ficha (±10 min) não conta em dobro |
| Arquivos do paciente | PDF, JPG, PNG ou HEIC até 10 MB; link de download de 5 minutos |
| Acesso | Profissional lê só quem tem vínculo (ou, como dono/admin, a clínica); secretária não vê dado clínico; cada área vê um recorte do aluno |
| Login | 10 senhas erradas por e-mail em 15 min bloqueiam o e-mail; 20/min por IP no login |
| Retenção | Dados clínicos retidos por prazo provisório de 20 anos após a exclusão da conta |
| Termos | Versão provisória; mudou a versão, todos aceitam de novo |

## 3. Divergências confirmadas

Cada item abaixo foi **conferido no código**. "Documento" é a documentação antiga dos repositórios.

| # | O que o código faz | O que diz ou espera o outro lado | Onde |
|---|---|---|---|
| 1 | O back **não tem** as rotas `GET` e `PATCH /clinics/modules`. | O front (`/funcionalidades` e o menu) as consulta para saber os módulos que a clínica ligou; sem resposta, **mostra tudo**. O teste do front até simula "Route GET:/clinics/modules not found". Portanto o **liga-desliga de módulos por clínica não funciona** hoje | back × front |
| 2 | Na `master` do back **não existe** `/me/push-token`. | O app (branch `feat/push-expo`) registra o aparelho nessa rota; a falha é silenciosa. O push só existe no branch `feat/push-expo` do back, não mesclado | back × app |
| 3 | O back (`master`) já aceita a **resposta do paciente à consulta** (`POST /patients/appointments/:id/response`). | Nenhuma tela usa isso nos branches lidos: as telas estão em `feat/confirmar-consulta` (app) e `feat/resposta-do-paciente` (web), não mesclados | back × front/app |
| 4 | A aba **Segurança** das Configurações do web tem campos e o botão "Atualizar Senha", **sem ação ligada**. | Parece uma troca de senha funcional. Hoje a senha só muda por "Esqueci minha senha" | front |
| 5 | O catálogo `/funcionalidades` do web lista **Financeiro** e **Prescrições e documentos** como "Planejado". | A API e as telas já existem, desligadas por chave (`CHARGES_ENABLED`, `DOCUMENTS_ENABLED`) | front |
| 6 | O aviso de plano, formulário e consulta vai para a **caixa do app** (e e-mail em alguns casos); **sem push** na `master`. | `ORION_ECOSSISTEMA.md` (back) ainda cita Firebase e `/api/notifications/fcm-token`; ambos foram removidos | docs do back |
| 7 | A aba **Registro** do app tem **6** atalhos (peso fica em *Meu corpo*). | `TELAS-DO-ORION.md` diz 7, incluindo Peso | docs do back |
| 8 | O `next.config.mjs` do front **não ignora mais** erros de ESLint e de tipo. | `docs/DEBITO_TECNICO.md` (front) e `ORION_ECOSSISTEMA.md` dizem que ignora | docs |
| 9 | `/mensagens` no web **redireciona para `/sinais`**. | `ORION_ECOSSISTEMA.md` fala em uma tela de mensagens sem backend; o chat entre profissional e paciente **não existe** (só o chat com a IA) | docs do back |
| 10 | `ORION_ECOSSISTEMA.md` lista cerca de 12 módulos do back. | O código tem 27 módulos (por exemplo `meal-plans`, `workouts`, `charges`, `documents`, `notices`, `data-rights`) | docs do back |
| 11 | O campo de **status de verificação** do profissional (`pending_documents`, `in_review`, `verified`, `rejected`) existe no banco. | A API **não o aplica**: `requireVerifiedProfessional` só exige perfil de profissional | back |
| 12 | Há cliente de reserva para o OpenRouter. | Ele **não está ligado** como alternativa automática à OpenAI | back |
| 13 | A versão do `better-auth` difere: back `1.4.18` (fixa), front declara `^1.2.7` (instalado `1.6.5`), app `^1.4.18`. | O `STATUS.md` do back registra que alinhar versões exige uma rodada própria, com teste de login | os três |
| 14 | A correção "falha na verificação de sessão não derruba o usuário" existe no branch `fix/sessao-nao-derruba` do web (já na árvore lida) e do app (**não mesclada** no branch lido). | Sem ela, uma falha de rede na leitura de sessão pode mandar o usuário para o login | front, app |

## 4. Pendências declaradas nos repositórios

Vêm do `docs/STATUS.md` do back (entradas de 22 a 24/10/2026) e de comentários no código. **Não foram resolvidas por este trabalho de documentação.**

- **Jurídico (antes da publicação pública nas lojas):** textos finais dos termos e da política de privacidade; prazo e lista do que reter na exclusão de conta (hoje provisório, 20 anos); declarações de privacidade das lojas (Google e Apple); regras de cada conselho (CRN, CRM, CREF) para prescrições e documentos.
- **Testes manuais pendentes:** os fluxos novos de privacidade (exportação, aceite, avisos, exclusão) num aparelho; a execução de treino e o alarme do cronômetro de descanso no celular real (o Android pode adiar alarmes em economia de bateria).
- **Segurança:** as chaves do armazenamento (S3) apareceram no histórico do git do back e **precisam ser rotacionadas**; o bloqueio de login por conta é em memória e permite travar a conta de outra pessoa por 15 minutos (quem sabe o e-mail); rodar `prisma migrate deploy` em produção e, no Railway, definir `TRUST_PROXY_HOPS=1`.
- **Plataforma:** o app é só Android (iPhone fica para depois); sem push, o paciente só vê avisos ao abrir o app (decisão pendente: e-mail, push via Expo ou aviso dentro do app; ver `feat/push-expo`).
- **Produto (planejado, sem data):** chat entre profissional e paciente; agendamento pelo paciente e Google Agenda; exames e fotos de evolução; IA lendo a anamnese; integração de pagamento; paciente convidado por outro paciente; avatar de evolução.
- **Alerta com vários profissionais:** com nutricionista e educador no mesmo paciente, o alerta crítico do dia vai para o **primeiro** profissional vinculado (a busca é `findFirst` sem filtro de área, confirmada no código), e não necessariamente o nutricionista que definiu a meta.
- **Aceite do aluno:** o vínculo criado pelo profissional não exige o aceite para o profissional ler os dados; a decisão de exigir está em aberto.
- **Treino:** o PDF de relatório do educador conta só os treinos da ficha, enquanto o painel e a retenção contam todos.
