# Orion — backend (`orion_back`)

A API do Orion. Concentra as regras de negócio, o banco de dados, a inteligência artificial e os jobs agendados. Web e app são só clientes dela.

Lido do código em 29/10/2026. Convenção: o texto diz o que o código faz; quando algo está desligado por padrão ou provisório, isso está dito.

## 1. Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/index.ts` e `src/app.ts` | Sobe o servidor, registra os módulos e liga os cinco jobs agendados |
| `src/modules/<assunto>/` | Um módulo por assunto, no padrão `rota → controller → serviço → repositório`, com testes ao lado (`*.test.ts`) |
| `src/lib/` | Peças compartilhadas: autenticação, variáveis de ambiente, Prisma, cliente da OpenAI, e-mail, armazenamento, PDFs, nota do dia, fuso da clínica, cifra de campos, Tabela TACO |
| `src/jobs/` | Os jobs agendados (seção 7) |
| `prisma/` | `schema.prisma`, migrações, scripts de dados iniciais e de demonstração |
| `docs/` | Documentação própria do back, incluindo planejamentos (`DESIGN-*.md`) |
| `qa-agents/` | Ferramenta de homologação com personas e cenários; não é para produção |

Módulos existentes em `src/modules`: `activity`, `anamnesis`, `anthropometry`, `appointments`, `behavior`, `charges`, `chat`, `clinics`, `cross-summary`, `data-rights`, `demo`, `documents`, `foods`, `library`, `meal-plans`, `meals`, `notices`, `patient-files`, `patients`, `professionals`, `protocols`, `reports`, `shared`, `signals`, `summaries`, `wearables`, `workouts`.

Documentação interativa: `/docs` (Scalar) e `/swagger.json`, gerados do código. O catálogo de rotas está em [02-api-rotas.md](02-api-rotas.md).

Comandos (`package.json`): `pnpm dev` (desenvolvimento), `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm db:seed`, `pnpm db:seed-edf`, `pnpm db:demo-data`, `pnpm db:populate-invites`, `pnpm qa` e `pnpm taco:build`. Exige Node 24 e pnpm 10.

## 2. Autenticação e sessão

- **Better Auth** cuida de cadastro, login, confirmação de e-mail e redefinição de senha, sempre em `/api/auth/*`. O código não tem `/auth/login`.
- **Sessão** é um cookie HttpOnly. O web envia com `credentials: include`; o app guarda o cookie no armazenamento seguro e o reenvia. Entre subdomínios, o cookie usa `sameSite: none` e `secure`.
- **CORS** aceita as origens de `WEB_APP_BASE_URL` e `API_BASE_URL`.
- **Confirmação de e-mail** é exigida para entrar quando `REQUIRE_EMAIL_VERIFICATION=true` ou, sem a variável, quando há `RESEND_API_KEY` (sem como enviar e-mail, ninguém conseguiria confirmar). Entrar sem confirmar dá 403 e reenvia o link.
- **Freio de força bruta no login:** 10 senhas erradas para o mesmo e-mail em 15 minutos bloqueiam novas tentativas daquele e-mail pelo resto da janela; o acerto zera a contagem. A contagem fica **em memória, por instância** da API (com mais de uma instância, o limite efetivo é maior, e reiniciar zera).
- **Limites de uso:** 300 requisições por minuto por usuário logado (por IP sem sessão); 30 por minuto nas rotas de IA; 20 por minuto por IP em `/api/auth/*`; 300 por minuto por IP na leitura de sessão. Passou do limite: `429 RATE_LIMITED` com `Retry-After`.
- **Erros:** `DomainError` vira `{ error, code }` com o status da classe; qualquer outro erro vira `500 INTERNAL_ERROR` sem expor a mensagem.

## 3. Papéis, clínica e acesso aos dados

### 3.1 Quem é quem
- `User.role`: `patient`, `professional` ou `secretary`.
- `Professional` (perfil): conselho (`CRM`, `CRN` ou `CREF`), **área** (`nutrition` ou `physical_education`), especialidade, código de convite no formato `OR-XXXXXX` e link padrão de teleconsulta. O campo de status de verificação existe no banco (`pending_documents`, `in_review`, `verified`, `rejected`), mas **a API não o aplica**: a conta entra liberada após o cadastro (`requireVerifiedProfessional` apenas exige perfil de profissional).
- `Clinic` com `ClinicMember` (papéis `owner`, `admin`, `professional`, `secretary`) e `ClinicPatient`.
- `ProfessionalPatient`: vínculo entre profissional e paciente (muitos para muitos). Guarda a data do vínculo, o aceite do paciente (`acceptedAt`) e a versão do texto aceito.

### 3.2 Como o vínculo nasce
1. **O paciente pede:** `POST /patients/link` com o código `OR-XXXXXX` do profissional. O vínculo já nasce aceito.
2. **O profissional cadastra:** `POST /patients` cria a conta do paciente com senha temporária (a senha enviada no corpo é ignorada) e envia por e-mail o convite para definir a senha (link de 7 dias). O vínculo fica **aguardando aceite** do aluno no app. **A espera não bloqueia o acesso** do profissional: a ficha mostra "Aguardando aceite do aluno", e vínculos antigos entram como "legado".
3. O paciente pode remover o vínculo quando quiser (`DELETE /patients/professionals/:professionalId`); recusar um vínculo é o mesmo que desvincular.

### 3.3 O que cada um vê
- **Lista de pacientes** (`GET /patients`): dono, administrador e secretária veem a **clínica inteira**; a secretária recebe meta e peso como `null`. Profissional comum vê só os pacientes vinculados a ele.
- **Leitura clínica** (detalhe, visão geral, refeições): profissional **vinculado** ou dono/administrador da clínica do paciente. **Escrita** (metas, protocolo, peso, perfil, convite) e o **PDF clínico** exigem vínculo direto. A secretária não acessa dado clínico.
- **Recorte por área do vínculo** (`link-consent.ts`): o nutricionista vê refeições, macros, plano e treinos concluídos; o educador físico vê fichas, cargas e treinos, e da alimentação **só o resumo** (aderência do dia e meta de proteína). Ambos veem peso, medidas, composição, sono, água, dados do relógio e as anamneses que o paciente respondeu para eles. O paciente vê essa lista no app, em "Minha equipe". A versão atual do texto de aceite é `2026-10-v1`.
- **Um profissional não enxerga o que o outro registrou** do mesmo paciente além do recorte acima (por exemplo, o resumo cruzado: o nutricionista vê treinos da semana e último treino; o educador vê a regularidade da alimentação, sem macros).

### 3.4 Áreas e módulos
O que cada área enxerga é decidido por `modulesFor` (`professionals/areas.ts`) e aplicado nas rotas por `requireModule`. Fora do módulo, a API devolve `403 MODULE_NOT_AVAILABLE`.

| Área | Módulos |
|---|---|
| Nutrição | `meal_plans`, `protocols`, `meals`, `clinic_foods`, `signals`, `reports` + comuns |
| Educação Física | `workouts`, `exercises` + comuns |
| Comuns às duas | `agenda`, `anamnesis`, `anthropometry`, `library`, `documents` |

A área sai do conselho no cadastro: `CRN` → nutrição, `CREF` → educação física; quem tem `CRM` escolhe. Conselho e área que não combinam (CREF com nutrição, CRN com educação física) são recusados. Sem nenhum dos dois, vale nutrição.

## 4. Inteligência artificial

- **Modelos:** o modelo de chat vem de `OPENAI_MODEL` (padrão `gpt-4o-mini`); a sugestão de plano alimentar pode usar um modelo próprio (`OPENAI_PLAN_MODEL`); a transcrição de voz usa `OPENAI_WHISPER_MODEL`; a foto usa visão. Existe um cliente de reserva para o OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), mas **não está ligado como alternativa automática**: o próprio comentário do código diz que basta chamá-lo no tratamento de erro.
- **Tentativas:** a chamada à OpenAI repete até 2 vezes, com espera crescente, em erro 429 e 5xx; cada tentativa tem 20 s de limite por padrão.
- **Limite por hora** (por profissional): 10 sugestões de plano e 30 gerações de receita.
- **Macros:** ver seção 5.2.

### Chat com o copiloto (`/chat`)
O servidor monta o contexto (perfil, metas, consumo e check-ins do dia, memória comportamental), pede uma resposta estruturada à OpenAI e grava a conversa. A resposta traz uma mensagem curta, um **cartão** e **ações rápidas** (`suggest_meal`, `log_meal`, `contact_professional`, `view_progress`). Tipos de cartão: `nutrition_info`, `meal_suggestion`, `adaptation`, `hormonal_context`, `emotional_support`, `training_guidance`, `daily_summary`, `alert` e `general`. Num cartão de refeição sugerida, o app oferece registrar no diário com um toque (`/chat/messages/:id/register-meal`).

## 5. Regras por módulo

### 5.1 Pacientes, perfil e onboarding
- O paciente tem `UserProfile` com dados pessoais e clínicos, meta de peso com prazo, sequência de registro e escudos, e o rascunho do onboarding.
- O **onboarding do paciente** salva o rascunho por etapa e é concluído em `/patients/me/onboarding/complete`. Depois, as preferências de como o Orion ajuda e avisa podem ser ajustadas.
- **Sequência (streak) e escudos:** registrar uma refeição no dia seguinte ao último registro soma 1 à sequência. A cada **10 dias** seguidos o paciente ganha **1 escudo** (máximo **3**). Se pular um dia, **um escudo é gasto** e a sequência continua; sem escudo, a sequência volta a 1.
- **Evolução:** peso com meta e **projeção pelo ritmo das últimas 8 semanas**, mais uma linha do tempo única (pesagens, protocolos, consultas, alertas, planos, composição).
- **InBody:** o PDF da bioimpedância é lido e as medidas são extraídas; o arquivo é guardado em armazenamento privado (se o S3 não estiver configurado, o envio responde 503) e aberto por link temporário de 5 minutos.

### 5.2 Refeições e macros
1. O paciente registra por **texto**, **voz** (transcrita pelo Whisper) ou **foto** (visão). Transcrição e foto **não salvam**: devolvem a leitura para confirmação.
2. A IA separa alimentos e gramas; o servidor calcula os macros pela **Tabela TACO** (591 alimentos em `src/lib/taco`) e pelos alimentos da clínica.
3. Cada refeição guarda a **origem** dos macros: `taco`, `mixed` (parte TACO, parte IA) ou `estimated` (só IA); a revisão do profissional marca `manual`.
4. Salvar uma refeição recalcula o **resumo do dia** (`DailySummary`) e atualiza a sequência.
5. Estado do dia: `on_track`, `warning` ou `off_track`; para médias, valem as notas 100, 70 e 40.
6. **Revisão** (`/professionals/meal-review`): fila das refeições recentes cujos macros são estimativa da IA; o profissional aprova como está ou corrige os números.

### 5.3 Protocolo nutricional
- Cada mudança cria uma **nova versão** do protocolo; a anterior é arquivada com o motivo. É possível comparar, duplicar, reativar uma versão antiga e salvar como modelo.
- Ajustar só as metas (calorias, proteína, carboidrato, gordura) também gera nova versão. A regra de calorias é 4/4/9 (proteína e carboidrato 4 kcal/g, gordura 9 kcal/g).
- O gasto energético (`/patients/:id/energy-expenditure`) calcula taxa basal, gasto diário e **sugere** calorias pelo objetivo; **nunca grava sozinho**.

### 5.4 Plano alimentar
- Estados: `draft` (rascunho), `active` e `archived`. **Ativar** arquiva o plano ativo anterior do paciente. Plano arquivado não se edita: **duplica-se** para um rascunho. Só rascunho pode ser apagado.
- **Os macros são sempre recalculados no servidor** a partir dos alimentos e das gramas; o front só informa o alimento e a quantidade.
- Cada alimento tem **medida caseira** (por exemplo, "1 pão francês"), e as **substituições** mostram o equivalente em energia para trocar um alimento por outro.
- **Sugestão por IA:** a IA recebe um resumo **sem identificação do paciente** e devolve nomes de alimentos e uma quantidade inicial. O servidor resolve cada nome na TACO (o que não existir sai e é listado), aplica a **trava de restrições** (alergias e restrições do paciente) e ajusta as porções para **±5% da meta de cada refeição** (de 5 em 5 g). Sem meta por refeição, divide as calorias do dia pelas fatias padrão: café 25%, almoço 30%, lanche 15%, jantar 25%, ceia 5%. O plano sugerido por IA **só ativa com confirmação de revisão**.
- **Receitas:** geradas pela IA a partir dos alimentos do plano ou escritas à mão (a manual vale mais). Nascem como rascunho; o profissional **libera** (por refeição ou todas). Mudou o plano: a receita fica marcada como desatualizada e some para o paciente até ser revisada.
- **Lista de compras:** soma cada alimento em todas as refeições para o período (7 dias por padrão; o app oferece 7, 15 e 30), agrupa por corredor de mercado e, para arroz, feijão, lentilha, frango e carne, mostra a quantidade aproximada para comprar crua. Também em PDF.
- **Aderência ao plano:** compara o diário com o plano ativo nos últimos dias (7 por padrão), por refeição: seguiu, comeu outra coisa ou pulou. "Comi isso", no app, registra a refeição com os alimentos escolhidos: vale só para hoje e uma vez por refeição.
- **Modelos:** um plano ou protocolo vira modelo (sem dados do paciente), privado ou compartilhado com a clínica; aplicar um modelo de plano cria um rascunho com macros recalculados.

### 5.5 Anamnese
- Modelos do Orion (nutricional completa, retorno rápido, esportiva) são só leitura; cada profissional cria os seus ou duplica um do Orion. Tipos de pergunta: texto, texto longo, escolha única, escolha múltipla, sim/não, número e escala; algumas perguntas preenchem campos do perfil (alergias, doenças, medicamentos).
- Começar uma anamnese guarda **uma cópia** das perguntas do modelo: editar ou apagar o modelo depois **não muda** anamneses já feitas.
- Fluxo: rascunho → (opcional) **enviar ao paciente** → o paciente responde no app (rascunho salvo sozinho) e **envia** → as respostas voltam ao profissional **como rascunho** → ele **conclui**. Só ao concluir os campos ligados ao perfil são atualizados. Enviar pode ser **cancelado** (`unsend`) enquanto o paciente não respondeu. Rascunho pode ser apagado; **anamnese concluída não se apaga** (é registro clínico).

### 5.6 Antropometria
Avaliação com medidas, dobras e circunferências; o servidor calcula índices como IMC e relação cintura-quadril. É preciso informar **ao menos uma medida**; valores fora da faixa são recusados. Apagar uma avaliação lançada por engano **mantém** o peso já gravado no histórico.

### 5.7 Agenda e teleconsulta
- Estados da consulta: `scheduled`, `completed`, `missed`, `cancelled`. **Consulta realizada não se remarca**; falta ou cancelamento voltam a "marcada" ao remarcar.
- Há **aviso de conflito de horário** do profissional, que considera a duração da consulta; consultas antigas, sem duração, valem 30 minutos. O profissional pode marcar mesmo assim.
- **Consulta online:** guarda o link da sala, que precisa ser `https`. O profissional tem um **link padrão** em `/professionals/meeting-link`.
- O **paciente responde** ao aviso da consulta (confirma ou pede para remarcar) pelo app; a resposta volta a nulo quando o horário muda.
- O motivo do cancelamento é **interno**: o paciente recebe o aviso, mas não vê o motivo.
- O aviso ao paciente (criada, remarcada, cancelada) vai para a caixa de avisos (seção 5.13).
- A **API** de resposta do paciente já existe na `master`, mas as telas que a usam (no app e no web) estão em branches ainda não mesclados.

### 5.8 Alertas e sinais
- **Alerta** é gerado por jobs e pelo resumo do dia (seção 7). Tipos: inatividade e desvio nutricional. É **deduplicado**: no máximo um por paciente por dia e nenhum enquanto houver um igual não lido. O profissional pode **resolver** ou **adiar** (1, 3 ou 7 dias; enquanto adiado, o job não cria outro do mesmo tipo) e **desfazer** logo depois. Na central, cada paciente aparece uma vez. Alertas, e o painel "para ver hoje", exigem o módulo de refeições: o educador físico recebe 403.
- **Sinal** é calculado na hora (não é gravado) a partir dos últimos **14 dias** do diário, do plano e do relógio. Cada sinal tem gravidade (`alto`, `medio`, `baixo`), os fatos, a interpretação, as fontes e uma **ação sugerida**. O profissional pode dizer se o contexto ajudou e registrar ação ou observação.

Catálogo dos 23 sinais (código, título, gravidade):

| Título | Gravidade |
|---|---|
| Proteína abaixo da meta (`low_protein`) | alto |
| Sem registro no diário (`no_log`) | alto |
| Registro incompleto (`incomplete_log`) | médio |
| Hidratação abaixo da meta (`low_hydration`) | médio |
| Macros fora da meta (`high_macros`) | alto |
| Queda de adesão no fim de semana (`weekend_relapse`) | médio |
| Proteína baixa no café da manhã (`low_protein_breakfast`) | alto |
| Intervalos longos sem registro (`skipped_meals`) | médio |
| Café da manhã pulado (`skipped_breakfast`) | alto |
| Jantar com pouca proteína (`low_protein_dinner`) | médio |
| Jantar pulado (`skipped_dinner`) | alto |
| Proteína baixa no fim de semana (`weekend_low_protein`) | médio |
| Lanche tardio frequente (`late_snack`) | médio |
| Excesso alimentar no fim de semana (`weekend_pizza`) | alto |
| Compulsão no período noturno (`night_binge`) | alto |
| Doce tarde da noite (`late_night_sweet`) | baixo |
| Horários irregulares (`irregular_meal_timing`) | alto |
| Intervalos longos entre refeições (`long_meal_gap`) | alto |
| Noites de sono curtas (`short_sleep`, do relógio) | médio |
| Queda na atividade diária (`steps_drop`, do relógio) | médio |
| Frequência cardíaca em repouso em alta (`resting_hr_up`, do relógio) | baixo |
| Variabilidade da frequência cardíaca em queda (`hrv_drop`, do relógio) | baixo |
| Pouca aderência ao plano (`low_plan_adherence`) | alto |

Em "intervalos longos", o limite do código é **7 horas** entre refeições.

### 5.9 Relatórios
- **PDF por paciente** (módulo de relatórios, nutrição): clínico (com leitura da IA), de protocolo e de evolução; envio por e-mail ao paciente (plano alimentar, protocolo ou evolução) com registro dos envios.
- **Resumo do mês do profissional** e **relatório da clínica** (por profissional; só titular e administradores).
- **E-mail mensal** no dia 1º, que o profissional pode desligar em `report-preferences`. O resumo não traz nome de paciente.
- Em ambiente local, `REPORT_EMAIL_REDIRECT` desvia todo documento enviado ao paciente para um endereço de teste.

### 5.10 Dados do relógio (Health Connect)
- Liberado por `WEARABLES_ENABLED`: vazio ou `off` desliga; `*` liga para todos; uma lista de e-mails liga só para eles (uso de piloto).
- O paciente dá **consentimento por tipo de dado**; revogar para a sincronização e, com `deleteData=true`, apaga os dados já enviados.
- O celular calcula resumos diários e treinos e os envia em `/patients/me/wearables/sync`. O profissional vê semana contra semana e pontos de atenção. Dado de relógio é **estimativa**, não diagnóstico.
- **Treino em dobro:** o treino medido pelo relógio dentro da janela do treino da ficha (margem de 10 minutos) é somado ao treino da ficha e não conta duas vezes.

### 5.11 Educação Física: treino
- **Biblioteca de exercícios:** catálogo do Orion (66 exercícios, carregados na subida da API), mais os do profissional e os que colegas da clínica compartilham. Aceita **link de vídeo** do YouTube ou Vimeo (só esses sites, forçando `https`); o Orion guarda o link, nunca o vídeo. Não se apaga exercício que esteja numa ficha.
- **Ficha de treino:** divisões (dias), exercícios, séries, repetições, carga e descanso. Estados e regras iguais às do plano alimentar: ativar arquiva a ativa anterior; **não se apaga ficha ativa**; duplicar cria rascunho para o mesmo aluno ou outro vinculado. **Modelos de ficha** podem ser salvos (privados ou da clínica) e aplicados a outro aluno como rascunho.
- **Execução pelo aluno:** começar um treino **congela** a divisão na sessão; as séries são gravadas uma a uma; concluir cria o registro de treino do dia, que entra na meta semanal e na sequência. A sessão em andamento pode ser retomada ou descartada.
- **Acompanhamento:** frequência da semana contra a meta, 30 dias, esforço médio, evolução de carga por exercício e últimos treinos. **Painel do educador:** prioriza quem está sem ficha, parado há 7 ou 14 dias, que nunca treinou depois de 3 dias da ficha, com meta da semana em risco ou com anotação no último treino. **Retenção:** Engajado (até 3 dias sem treinar), Oscilando (4 a 6), Em risco (7 a 13), Abandono (14 ou mais, ou nunca), Recuperado e Começando.
- **Relatório de treino em PDF** (90 dias) e envio ao e-mail do aluno; o resumo mensal do dia 1º traz os números de treino para educadores.
- A anamnese do educador inclui o PAR-Q (7 perguntas); resposta "sim" em alguma pede liberação médica.

### 5.12 Financeiro (desligado por padrão)
Só existe com `CHARGES_ENABLED=true` (sem isso, as rotas respondem 404 `FEATURE_DISABLED`; o menu do web só mostra se `NEXT_PUBLIC_CHARGES_ENABLED=true`).
- **Cobrança:** descrição, valor em **centavos** (inteiro), vencimento (dia, no fuso de Brasília), opcionalmente ligada a uma consulta. Estados: `pending`, `paid`, `cancelled`, `overdue`. Pode **repetir por N meses** (de 1 a **12**): cria uma por mês, na mesma série.
- **Pagar** emite o **recibo** (não é nota fiscal), numerado em sequência **por profissional e por ano**, que nunca se edita; formas: `pix`, `cash`, `card`, `transfer`, `other`.
- **Cancelar** mantém a cobrança na lista, marcada. O resumo do mês mostra recebido, a receber e atrasado.
- É **registro manual**: não há integração com meio de pagamento.

### 5.13 Documentos, arquivos e avisos
- **Documentos** (desligado por padrão, `DOCUMENTS_ENABLED=true`): prescrição de suplementos, de fitoterápicos, declaração de comparecimento e atestado. Cada documento recebe um número sequencial do profissional, **não se edita depois de emitido** (corrige-se cancelando e emitindo outro) e some para o paciente quando cancelado. O app só mostra "Meus documentos" com a chave de compilação ligada. Há uma pendência declarada sobre as regras de cada conselho (CRN, CRM) antes de liberar.
- **Exames e arquivos do paciente:** PDF, JPG, PNG ou HEIC, **até 10 MB**; o profissional vinculado vê e baixa por link temporário de 5 minutos; o próprio paciente pode apagar o que enviou.
- **Avisos ao paciente** (caixa de avisos do app; **na `master` não há push**, ver seção 6): tipos `plan_updated`, `workout_updated`, `document_issued`, `document_cancelled`, `anamnesis_sent`, `appointment_created`, `appointment_rescheduled`, `appointment_cancelled`. O texto **não leva dado clínico**: diz que algo mudou e para onde ir. Só **plano atualizado** e **formulário enviado** também vão por e-mail (o paciente pode desligar o e-mail; a caixa do app continua). Avisos lidos são apagados após **90 dias** (`NOTICES_RETENTION_DAYS`).

### 5.14 Privacidade e direitos do titular (LGPD)
- **Exportação:** `GET /patients/me/export` entrega em JSON tudo o que o Orion guarda do paciente.
- **Termos de uso e política de privacidade:** o aceite é versionado; mudou a versão, todos aceitam de novo. As versões atuais são **provisórias** (`provisoria-2026-10`), à espera da revisão jurídica.
- **Exclusão de conta pelo paciente:** apaga na hora o que é só do paciente e **mantém, sem acesso pelo app e sem dado pessoal**, o prontuário que os profissionais precisam guardar por lei. O prazo padrão é **20 anos** (`ACCOUNT_RETENTION_YEARS`), valor **provisório** até o jurídico definir por área (CRN, CRM, CREF). Depois do prazo, o job de purga apaga a linha e tudo o que dela depende. Há um registro de auditoria da exclusão.

## 6. Integrações externas
- **OpenAI** (chat, planos, receitas, voz, foto) — `OPENAI_API_KEY`.
- **Resend** (e-mail) — `RESEND_API_KEY`, remetente `EMAIL_FROM` (padrão `contato@projetoorion.com`). Há suporte a SendGrid (`SENDGRID_API_KEY`) declarado nas variáveis.
- **Armazenamento S3 privado** (PDFs do InBody e exames) — quatro variáveis `STORAGE_*`.
- **Firebase/push:** **removidos** da `master` do back (o app usa lembretes locais e a caixa de avisos). Existe um branch não mesclado, `feat/push-expo`, que acrescenta push via **Expo** (tabela `PushToken` e rotas `POST /me/push-token` e `/me/push-token/remove`); ele **não faz parte** do que este documento descreve.

## 7. Jobs agendados

Todos usam o fuso `America/Sao_Paulo` e iniciam junto com o servidor.

| Job | Quando (padrão) | O que faz | Variável para mudar |
|---|---|---|---|
| Resumo semanal | domingo, 20h | Texto da IA enviado por e-mail aos **pacientes ativos** (os que têm resumo do dia nos últimos 7 dias e conta não excluída). Com `WEEKLY_SUMMARY_TEST_EMAIL`, só processa o primeiro paciente e envia a esse endereço | `WEEKLY_SUMMARY_CRON` (e `WEEKLY_SUMMARY_TEST_EMAIL` para testes) |
| Alertas de inatividade | todo dia, 9h | Gera alerta para paciente **sem registro há mais de 48 h** | `ALERTS_INACTIVITY_CRON` |
| Alertas nutricionais | todo dia, 21h | Gera alerta por desvio nutricional do dia | `ALERTS_NUTRITION_CRON` |
| Relatório mensal | dia 1º, 8h | E-mail com os números do mês (profissional; educador inclui treino) | `MONTHLY_REPORT_CRON` |
| Limpeza de avisos | todo dia, 3h | Apaga avisos lidos há mais de 90 dias | `NOTICES_CLEANUP_CRON`, `NOTICES_RETENTION_DAYS` |
| Purga de contas | todo dia, 4h | Apaga contas excluídas cujo prazo de guarda venceu | `ACCOUNT_PURGE_CRON`, `ACCOUNT_RETENTION_YEARS` |

## 8. Variáveis de ambiente

Obrigatórias: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `API_BASE_URL`, `WEB_APP_BASE_URL`. A API não sobe sem elas.

| Grupo | Variáveis |
|---|---|
| Servidor | `PORT` (padrão 8081), `TRUST_PROXY_HOPS` (1 a 9; quantos proxies confiar em `X-Forwarded-For`; valor inválido impede a subida), `NODE_ENV` |
| E-mail | `RESEND_API_KEY`, `SENDGRID_API_KEY`, `EMAIL_FROM`, `REQUIRE_EMAIL_VERIFICATION`, `REPORT_EMAIL_REDIRECT` |
| IA | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_PLAN_MODEL`, `OPENAI_WHISPER_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| Recursos | `WEARABLES_ENABLED`, `DOCUMENTS_ENABLED`, `CHARGES_ENABLED` |
| Armazenamento | `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION` (padrão `auto`) |
| Jobs e retenção | as variáveis da tabela de jobs |

## 9. Testes e qualidade
Testes com Vitest ao lado do código (`*.test.ts`), checagem de tipos (`pnpm typecheck`) e ESLint. No GitHub Actions, o `ci-cd.yml` roda instalação, `prisma generate`, checagem de tipos e testes, e aplica as migrações no Neon; o `orion-qa.yml` roda a ferramenta de homologação.
