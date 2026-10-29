# Orion — catálogo de rotas da API

Fonte: as definições de rota em `orion_back/src/**/*.route.ts` e `app.ts`, lidas do código em outubro/2026 (222 rotas). A documentação interativa gerada pelo servidor (`/docs`, Scalar, e `/swagger.json`) **vence** em caso de divergência com este arquivo.

## Como ler

- **Sem prefixo:** as rotas de domínio não têm prefixo de versão (exceção: o chat, em `/chat`; e o login em `/api/auth/*`).
- **Coluna Acesso:**
  - *Logado*: exige sessão válida. A regra de papel e de vínculo (quem é paciente, quem é profissional, se há vínculo com o paciente) é aplicada dentro do serviço da rota.
  - *Profissional*: exige sessão de profissional (a conta entra liberada após o cadastro).
  - *· módulo X*: além disso, só a área do profissional que tem o módulo X (veja "Áreas e módulos" em `01-backend.md`); outra área recebe `403 MODULE_NOT_AVAILABLE`.
  - *Equipe da clínica*: dono, administrador, profissional ou secretária da clínica.
  - *—*: pública (sem sessão).
- **Erros:** erros de regra voltam como `{ "error": "mensagem", "code": "CODIGO" }` com o status correspondente (400 validação, 403 sem permissão, 404 não encontrado, 409 conflito, 429 limite de uso). Erro inesperado vira `500 INTERNAL_ERROR` sem expor detalhes.
- **Limites de uso:** 300 requisições por minuto por usuário logado (por IP quando não há sessão); 30 por minuto nas rotas de IA (`/chat`, `/meals/transcribe`, `/meals/photo`); `/api/auth/*` 20 por minuto por IP; leitura de sessão 300 por minuto por IP. Há ainda um freio por conta no login: 10 senhas erradas em 15 minutos bloqueiam novas tentativas daquele e-mail.

## Sistema e login

Login, logout, sessão e e-mail passam todos pelo Better Auth em `/api/auth/*` (não existem `/auth/login` nem `/users/me`). A sessão é um cookie HttpOnly.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/swagger.json` | — | — |
| GET | `/` | Hello World | — |
| GET | `/api/auth/get-session` | — | — |
| GET, POST | `/api/auth/*` | — | — |

## Cadastro e perfil do profissional

O cadastro aberto (`/professionals/register`) cria conta e perfil numa chamada e envia o e-mail de confirmação.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/professionals/onboarding` | Primeiros passos do profissional: perfil, clínica, primeiro paciente, protocolo, primeira consulta e equipe, com o que já foi feito | Profissional |
| GET | `/professionals/today` | Quem o profissional precisa ver hoje, do mais urgente ao menos, com os motivos (consulta hoje, retorno vencido, falta sem remarcar, dias sem registrar, macros, alertas abertos, fome reduzida) e a agenda do dia | Profissional · módulo `meals` |
| POST | `/professionals/register` | Cadastro aberto do profissional: cria a conta, completa o perfil e envia o e-mail de confirmação (quando exigido) | — |
| POST | `/professionals/profile` | Completa o perfil profissional e define role professional | Logado |
| GET | `/professionals/profile` | Retorna o perfil do profissional logado | Profissional |
| PUT | `/professionals/clinic` | Cria ou atualiza os dados da clínica do profissional | Profissional |
| GET | `/professionals/stats` | Retorna estatísticas do painel do profissional | Profissional |
| GET | `/professionals/overview` | Retorna a visão geral agregada do profissional | Profissional · módulo `meals` |
| GET | `/professionals/code/:code` | Busca profissional pelo código de convite | Logado |

## Clínica e equipe

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/clinics/members` | Lista a equipe da clínica do usuário logado | Logado |
| POST | `/clinics/members` | Adiciona alguém à equipe da clínica. Se o e-mail ainda não tem conta, cria a conta e envia o convite para definir a senha | Logado |
| DELETE | `/clinics/members/:memberId` | Remove um membro da clínica | Logado |

## Pacientes (visão do profissional e do próprio paciente)

Rotas `/patients/me/*` são do paciente logado. As demais pedem profissional com vínculo (a equipe da clínica lê a lista, conforme o papel).

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/patients/:patientId/evolution` | Evolução do paciente: peso com meta e projeção (ritmo das últimas 8 semanas) e linha do tempo única com pesagens, protocolos, consultas, alertas, planos alimentares e bioimpedância | Profissional |
| POST | `/patients` | Nutricionista cadastra paciente (User + UserProfile + vínculo) | Profissional |
| POST | `/patients/inbody/preview` | Lê a folha de resultados do InBody e devolve as medidas, sem salvar o arquivo | Profissional |
| POST | `/patients/:patientId/invitation` | Envia o convite de primeiro acesso ao paciente | Profissional |
| POST | `/patients/me/profile` | Cria o UserProfile do paciente autenticado (autoatendimento / onboarding) | Logado |
| GET | `/patients/me/profile` | Retorna o perfil do paciente autenticado | Logado |
| GET | `/patients/me/journey` | Jornada do paciente logado: últimos 7 dias, sequência e linha do tempo do cuidado | Logado |
| PUT | `/patients/me/onboarding` | Salva o rascunho do onboarding de primeiro acesso (etapa atual + respostas parciais) | Logado |
| PATCH | `/patients/me/onboarding/preferences` | Ajusta como o Orion ajuda e avisa o paciente, depois do onboarding concluído | Logado |
| POST | `/patients/me/onboarding/complete` | Conclui o onboarding: grava as respostas e marca onboardingCompletedAt | Logado |
| PATCH | `/patients/me/profile` | Atualiza dados pessoais do paciente autenticado | Logado |
| GET | `/patients` | Lista pacientes: a clínica inteira para owner/admin/secretária (secretária sem meta/peso); só os vínculos do profissional para os demais | Equipe da clínica ou profissional |
| GET | `/patients/:patientId` | Detalhe do paciente (com perfil) se vinculado ao profissional | Profissional |
| GET | `/patients/:patientId/overview` | Resumo analítico do paciente para a visão geral profissional | Profissional |
| POST | `/patients/:patientId/goals` | Define novas metas de macros para o paciente | Profissional · módulo `protocols` |
| POST | `/patients/:patientId/protocol` | Ativa uma nova versão completa do protocolo nutricional | Profissional · módulo `protocols` |
| POST | `/patients/:patientId/evolution` | Registra peso e composição corporal de forma atômica | Profissional |
| GET | `/patients/:patientId/meals` | Retorna o histórico de refeições paginado do paciente (Profissional) | Profissional · módulo `meals` |
| PUT | `/patients/:patientId` | Atualiza UserProfile do paciente vinculado | Profissional |
| POST | `/patients/weight` | Registra uma nova pesagem do paciente | Logado |
| POST | `/patients/:patientId/weight` | Registra uma nova pesagem para um paciente vinculado (Profissional) | Profissional |
| GET | `/patients/weight` | Retorna o histórico de pesagens do paciente | Logado |
| POST | `/patients/composition` | Registra uma nova composição corporal do paciente | Logado |
| POST | `/patients/:patientId/composition` | Registra uma nova composição corporal para um paciente vinculado (Profissional) | Profissional |
| POST | `/patients/:patientId/composition/inbody` | Lê o PDF do InBody, guarda o arquivo em bucket privado e registra a composição corporal (Profissional) | Profissional |
| GET | `/patients/:patientId/composition/:compositionId/file` | Devolve um link temporário (5 min) para abrir o PDF do InBody de uma medição | Profissional |
| GET | `/patients/composition` | Retorna o histórico de composição corporal do paciente | Logado |
| GET | `/patients/monitoring` | Retorna dados consolidados para o dashboard de monitoramento do nutricionista | Profissional · módulo `meals` |
| POST | `/patients/link` | Paciente se vincula a um profissional via código de convite | Logado |
| GET | `/patients/alerts` | Lista alertas de todos os pacientes vinculados ao profissional | Profissional |
| PATCH | `/patients/alerts/:alertId/read` | Marca um alerta como lido | Profissional |
| POST | `/patients/alerts/read-all` | Marca todos os alertas do profissional como lidos | Profissional |
| GET | `/patients/appointments` | Lista agendamentos do paciente logado | Logado |
| GET | `/patients/professionals` | Lista os profissionais vinculados ao paciente logado | Logado |
| POST | `/patients/professionals/:professionalId/accept` | O aluno aceita o vínculo criado pelo profissional. Recusar é desvincular (DELETE). | Logado |
| GET | `/patients/:patientId/link-status` | O aluno já aceitou o vínculo com este profissional? | Profissional |
| DELETE | `/patients/professionals/:professionalId` | Paciente remove o vínculo com um profissional | Logado |
| GET | `/patients/:patientId/report/pdf` | Gera PDF do paciente: clínico (IA), protocolo ou evolução | Profissional · módulo `reports` |

## Registro do dia do paciente (água, sono, treino, check-ins) e rotina

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| POST | `/patients/me/hydration` | Registra água (ml) do paciente logado | Logado |
| POST | `/patients/me/workouts` | Registra um treino concluído do paciente logado | Logado |
| PUT | `/patients/me/sleep` | Registra (ou substitui) o sono de uma noite do paciente logado | Logado |
| POST | `/patients/me/check-ins` | Registra a resposta a uma pergunta rápida (fome, hidratação, sono, energia) | Logado |
| GET | `/patients/me/check-ins/today` | Última resposta de cada pergunta rápida no dia de hoje | Logado |
| GET | `/patients/:patientId/lifestyle` | Rotina do paciente no período: sono, água, treinos e respostas das perguntas rápidas (fome, hidratação, sono, energia), com pontos de atenção | Profissional |

## Refeições e resumo do dia

A IA identifica os alimentos; os macros são calculados no servidor pela Tabela TACO.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/professionals/meal-review` | Fila de revisão: refeições recentes dos pacientes cujos macros são estimativa da IA (total ou parcial) e ainda não foram conferidas | Profissional · módulo `meals` |
| POST | `/professionals/meal-review/:mealId` | Aprova os macros de uma refeição como estão, ou corrige os números (passa a origem 'manual') | Profissional · módulo `meals` |
| POST | `/meals/transcribe` | Transcreve áudio da refeição via OpenAI Whisper | Logado |
| POST | `/meals/photo` | Analisa foto de refeição com IA Vision e estima macros (não salva — retorna para confirmação do usuário) | Logado |
| POST | `/meals` | Registra uma nova refeição e gera análise de IA | Logado |
| GET | `/meals` | Lista o histórico de refeições do usuário logado | Logado |
| GET | `/meals/:id` | Obtém detalhes de uma refeição específica | Logado |
| PATCH | `/meals/:id` | Atualiza uma refeição existente | Logado |
| DELETE | `/meals/:id` | Remove uma refeição do histórico | Logado |
| GET | `/summaries/daily` | Obtém macros diários e metas para a Home | Logado |
| POST | `/summaries/goals` | Define meta nutricional do próprio usuário autenticado. Exige profissional — paciente usa o fluxo prescrito em POST /patients/:id/goals. | Profissional |

## Protocolos nutricionais

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/protocols` | Lista protocolos ativos dos pacientes do profissional | Profissional |
| GET | `/protocols/:patientId` | Ficha do protocolo vigente do paciente | Profissional |
| POST | `/protocols/:patientId/:protocolId/archive` | Desativa o protocolo vigente | Profissional |
| POST | `/protocols/:patientId/:protocolId/activate` | Reativa um protocolo arquivado | Profissional |

## Plano alimentar, receitas e lista de compras

Rotas `/patients/me/meal-plan*` são do paciente; as demais, do profissional com o módulo de planos.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/patients/:patientId/meal-plans` | Planos alimentares do paciente (rascunho, ativo e arquivados) | Profissional · módulo `meal_plans` |
| GET | `/patients/:patientId/meal-plan/adherence` | Aderência do paciente ao plano ativo: grade por dia e refeição (seguiu, comeu outra coisa, sem registro), resumo e a refeição mais difícil. Dia sem nenhum registro fica fora do percentual. Null sem plano ativo | Profissional · módulo `meal_plans` |
| GET | `/patients/:patientId/meal-plans/active` | Plano alimentar ativo do paciente, com totais e comparação com a meta do protocolo (`plan: null` se não há) | Profissional · módulo `meal_plans` |
| POST | `/patients/:patientId/meal-plans` | Cria um rascunho com as refeições do protocolo ativo | Profissional · módulo `meal_plans` |
| GET | `/meal-plans/:planId` | Um plano alimentar | Profissional · módulo `meal_plans` |
| PUT | `/meal-plans/:planId` | Grava o plano inteiro (refeições e itens). Os macros são recalculados no servidor a partir do alimento e das gramas | Profissional · módulo `meal_plans` |
| POST | `/meal-plans/:planId/activate` | Ativa o plano e arquiva o ativo anterior do paciente. Um plano sugerido pela IA exige confirmAiReview: true (o profissional confirma que revisou) | Profissional · módulo `meal_plans` |
| POST | `/patients/:patientId/meal-plans/suggest` | A IA sugere um rascunho de plano alimentar a partir do protocolo, das restrições, das preferências e do diário do paciente. O sistema resolve cada alimento na TACO, remove o que as restrições proíbem, ajusta as quantidades para a meta e devolve um relatório. Nada é ativado. Sem identificação do paciente na chamada da IA; limite de 10 gerações por hora | Profissional · módulo `meal_plans` |
| POST | `/meal-plans/:planId/meals/:mealId/recipe/generate` | Gera com a IA a receita de uma refeição: ingredientes e quantidades vêm do plano, a IA escreve só o preparo, e o servidor recusa receita que cita alimento proibido pelas restrições (e avisa de alimento fora da refeição). Nasce como rascunho; libere para o paciente ver | Profissional · módulo `meal_plans` |
| POST | `/meal-plans/:planId/recipes/generate` | Gera as receitas das refeições que ainda não têm receita ou cuja receita ficou desatualizada, uma por vez. Devolve o plano e o que falhou | Profissional · módulo `meal_plans` |
| PUT | `/meal-plans/:planId/meals/:mealId/recipe` | Grava a receita escrita à mão (vale mais que a da IA). `published` libera ou recolhe para o paciente | Profissional · módulo `meal_plans` |
| POST | `/meal-plans/:planId/meals/:mealId/recipe/publish` | Libera (ou recolhe) para o paciente a receita de uma refeição, sem mudar o texto | Profissional · módulo `meal_plans` |
| POST | `/meal-plans/:planId/recipes/publish` | Libera (ou recolhe) para o paciente todas as receitas do plano | Profissional · módulo `meal_plans` |
| DELETE | `/meal-plans/:planId/meals/:mealId/recipe` | Apaga a receita de uma refeição | Profissional · módulo `meal_plans` |
| POST | `/meal-plans/:planId/meals/:mealId/regenerate` | Refaz uma refeição de um rascunho com a IA (pedido opcional, como "mais proteína"), trocando só os alimentos dela | Profissional · módulo `meal_plans` |
| POST | `/meal-plans/:planId/duplicate` | Cria um rascunho com o conteúdo do plano (para ajustar sem mexer no que está valendo) | Profissional · módulo `meal_plans` |
| DELETE | `/meal-plans/:planId` | Apaga um rascunho (planos já ativados ficam no histórico) | Profissional · módulo `meal_plans` |
| GET | `/meal-plans/:planId/shopping-list` | Lista de compras do plano para o período (padrão 7 dias): soma cada alimento em todas as refeições, agrupa por categoria da TACO e avisa quando o plano usa alimento cozido | Profissional · módulo `meal_plans` |
| GET | `/meal-plans/:planId/shopping-list/pdf` | PDF da lista de compras para entregar ao paciente | Profissional · módulo `meal_plans` |
| GET | `/meal-plans/:planId/pdf` | PDF do plano para entregar ao paciente | Profissional · módulo `meal_plans` |
| GET | `/patients/me/meal-plan` | O plano alimentar ativo do paciente logado (refeições, itens, trocas e totais), ou null se não há plano ativo | Logado |
| GET | `/patients/me/meal-plan/shopping-list` | Lista de compras do plano ativo para o período (padrão 7 dias), agrupada por corredor de mercado; alimentos básicos cozidos vêm convertidos para o que se compra cru. Null sem plano ativo | Logado |
| POST | `/patients/me/meal-plan/meals/:planMealId/log` | — | Logado |
| GET | `/patients/me/meal-plan/pdf` | PDF do plano alimentar ativo do paciente logado | Logado |

## Alimentos da clínica e medidas caseiras

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/foods/search` | Busca de alimentos para o editor do plano: os da clínica e os da TACO (aceita o começo das palavras), com as medidas caseiras | Profissional · módulo `clinic_foods` |
| GET | `/foods/equivalent` | Gramas de um alimento que igualam a energia de um item do plano, com a diferença de macros (para montar substituições) | Profissional · módulo `clinic_foods` |
| GET | `/clinic-foods` | Alimentos próprios da clínica (ou do profissional, se não tem clínica) | Profissional · módulo `clinic_foods` |
| POST | `/clinic-foods` | Cadastra um alimento próprio, com os macros por 100 g | Profissional · módulo `clinic_foods` |
| PUT | `/clinic-foods/:id` | Edita um alimento próprio. Planos já salvos não mudam | Profissional · módulo `clinic_foods` |
| DELETE | `/clinic-foods/:id` | Arquiva um alimento próprio: some da busca, mas continua nos planos que já o usam | Profissional · módulo `clinic_foods` |
| POST | `/foods/measures` | Cria uma medida caseira própria ("1 concha = 90 g") para um alimento da TACO ou da clínica | Profissional · módulo `clinic_foods` |
| DELETE | `/foods/measures/:id` | Apaga uma medida caseira própria | Profissional · módulo `clinic_foods` |

## Modelos e biblioteca

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/library/templates` | Modelos de protocolo e de plano alimentar: os meus e os que colegas da clínica compartilharam | Profissional |
| GET | `/library/templates/:id` | Um modelo com o conteúdo completo | Profissional |
| POST | `/library/templates` | Salva um protocolo ou um plano alimentar de um paciente seu como modelo (sem os dados do paciente). Compartilhar com a clínica é opcional | Profissional |
| PATCH | `/library/templates/:id` | Renomeia, descreve ou muda o compartilhamento de um modelo meu | Profissional |
| DELETE | `/library/templates/:id` | Apaga um modelo meu (o que já foi aplicado a pacientes não é afetado) | Profissional |
| POST | `/library/templates/:id/apply` | Usa o modelo num paciente seu. Plano alimentar: cria um rascunho (macros recalculados pela TACO). Protocolo: devolve as metas para pré-preencher o assistente, sem ativar nada | Profissional |

## Anamnese

Rotas `/patients/me/anamneses*` são do paciente; as demais, do profissional.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/anamnesis-templates` | Modelos de anamnese: os do Orion (nutricional completa, retorno rápido, esportiva), os seus e os que a clínica compartilhou | Profissional |
| GET | `/anamnesis-templates/:id` | Um modelo completo (seções e perguntas), para editar, pré-visualizar ou usar como base | Profissional |
| POST | `/anamnesis-templates` | Cria um modelo próprio. O servidor valida a estrutura e gera os ids das perguntas novas | Profissional |
| PUT | `/anamnesis-templates/:id` | Edita um modelo próprio (só o dono). As anamneses já feitas não mudam: guardam uma cópia das perguntas | Profissional |
| DELETE | `/anamnesis-templates/:id` | Apaga um modelo próprio (só o dono). As anamneses já feitas com ele continuam | Profissional |
| GET | `/patients/:patientId/anamneses` | Anamneses do paciente, da mais recente para a mais antiga, com quantas perguntas foram respondidas | Profissional |
| POST | `/patients/:patientId/anamneses` | Começa uma anamnese (rascunho) a partir de um modelo. Guarda uma cópia das perguntas do modelo | Profissional |
| GET | `/anamneses/:id` | Uma anamnese com as perguntas e as respostas | Profissional |
| PUT | `/anamneses/:id` | Salva as respostas do rascunho. Com complete=true, conclui e atualiza no perfil do paciente os campos ligados às perguntas respondidas (alergias, doenças, medicações...). Anamnese concluída não se edita | Profissional |
| DELETE | `/anamneses/:id` | Apaga um rascunho de anamnese (a concluída é registro clínico e não se apaga) | Profissional |
| POST | `/anamneses/:id/send` | Envia a anamnese ao paciente responder no app (gera um aviso na caixa de avisos e, se o paciente não desligou, um e-mail). O que ele responde só vai para o perfil quando você revisar e concluir | Profissional |
| POST | `/anamneses/:id/unsend` | Cancela o envio ao paciente enquanto ele não respondeu: volta a ser rascunho seu | Profissional |
| GET | `/patients/me/anamneses` | Formulários que o profissional enviou ao paciente logado e que ainda não foram concluídos | Logado |
| GET | `/patients/me/anamneses/:id` | Um formulário enviado ao paciente, com as perguntas e as respostas salvas | Logado |
| PUT | `/patients/me/anamneses/:id` | Salva as respostas do paciente (rascunho, quantas vezes quiser até enviar) | Logado |
| POST | `/patients/me/anamneses/:id/submit` | Envia as respostas ao profissional, que revisa e conclui | Logado |

## Antropometria e gasto energético

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/patients/:patientId/anthropometry` | Avaliações antropométricas do paciente, da mais recente para a mais antiga, com IMC, relação cintura-quadril, % de gordura e massa magra calculados | Profissional |
| POST | `/patients/:patientId/anthropometry` | Registra uma avaliação. Tudo é opcional, mas é preciso ao menos uma medida; valores fora de faixa plausível são recusados. Peso e altura também atualizam o histórico de peso e o perfil quando é a avaliação mais recente | Profissional |
| DELETE | `/anthropometry/:id` | Apaga uma avaliação lançada por engano (o peso já gravado no histórico de peso permanece) | Profissional |
| POST | `/patients/:patientId/energy-expenditure` | Calcula taxa metabólica basal, gasto diário (GET) e a sugestão de calorias pelo objetivo. É só uma estimativa: não grava o protocolo. Guarda o fator de atividade escolhido no perfil | Profissional |

## Agenda e teleconsulta

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/appointments` | Lista as consultas da clínica ou do profissional. `date` traz um dia; `from` e `to` (AAAA-MM-DD, até 62 dias) trazem um período, em dias de Brasília. Sem nada, hoje | Logado |
| POST | `/patients/appointments/:id/response` | O paciente logado responde ao aviso da consulta: confirma ou pede para remarcar (consulta marcada e futura) | Logado |
| POST | `/appointments` | Cria uma nova consulta | Logado |
| PATCH | `/appointments/:id` | Remarca a consulta (novo horário e/ou observações). Consulta realizada não se remarca; faltou e cancelada voltam a marcada. 409 se o profissional já tem consulta sobreposta ao horário (repita com allowOverlap) | Logado |
| PATCH | `/appointments/:id/status` | Atualiza o status de uma consulta | Logado |
| GET | `/professionals/meeting-link` | Link padrão da sala de teleconsulta do profissional (preenche o campo ao marcar consulta online) | Logado |
| PUT | `/professionals/meeting-link` | Define (ou apaga, com null) o link padrão da sala de teleconsulta. Precisa ser https | Logado |

## Alertas e sinais

O alerta é gerado por jobs e pelo resumo do dia; o sinal é calculado na hora a partir do diário, do plano e do relógio.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/professionals/alerts` | Central de alertas: alertas do profissional por estado (abertos, adiados, resolvidos) e tipo, agrupados por paciente | Profissional · módulo `meals` |
| POST | `/professionals/alerts/:alertId/resolve` | Dá o alerta por tratado | Profissional · módulo `meals` |
| POST | `/professionals/alerts/:alertId/snooze` | Adia o alerta por 1, 3 ou 7 dias; o job não cria outro do mesmo tipo até lá | Profissional · módulo `meals` |
| POST | `/professionals/alerts/reopen` | Desfaz resolver ou adiar dos alertas indicados (o Desfazer logo depois de uma ação) | Profissional · módulo `meals` |
| POST | `/professionals/alerts/patients/:patientId/resolve` | Resolve todos os alertas abertos de um paciente | Profissional · módulo `meals` |
| POST | `/professionals/alerts/patients/:patientId/snooze` | Adia todos os alertas abertos de um paciente por 1, 3 ou 7 dias | Profissional · módulo `meals` |
| GET | `/signals` | Lista sinais ativos dos pacientes do profissional | Profissional |
| GET | `/signals/:patientId/:code` | Dossiê de um sinal do paciente | Profissional |
| POST | `/signals/:patientId/:code/feedback` | Registra se o contexto do sinal ajudou | Profissional |
| POST | `/signals/:patientId/:code/actions` | Registra ação ou observação no sinal | Profissional |

## Relatórios

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| POST | `/patients/:patientId/reports/send` | Envia ao e-mail do paciente o PDF do protocolo, da evolução ou do plano alimentar ativo (o relatório clínico, com a leitura da IA, não pode ser enviado). O profissional vinculado recebe as respostas do paciente | Profissional · módulo `reports` |
| GET | `/patients/:patientId/reports/deliveries` | Documentos já enviados por e-mail ao paciente, do mais recente para o mais antigo | Profissional · módulo `reports` |
| GET | `/professionals/monthly-report` | Números do mês do profissional: pacientes ativos e parados, adesão média, variação de peso e consultas (realizadas, faltas e taxa de falta) | Profissional · módulo `reports` |
| GET | `/clinics/report` | Relatório do mês da clínica, com a adesão e as consultas de cada profissional. Só o titular e os administradores | Equipe da clínica |
| GET | `/professionals/report-preferences` | Preferências de relatório do profissional: receber ou não o resumo mensal por e-mail | Profissional · módulo `reports` |
| PUT | `/professionals/report-preferences` | Liga ou desliga o resumo mensal por e-mail | Profissional · módulo `reports` |

## Chat com o copiloto de IA

Limite de 30 requisições por minuto por usuário.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| POST | `/chat` | Envia uma mensagem ao copiloto de IA (limite de 30 por minuto por usuário) | Logado |
| POST | `/chat/messages/:messageId/register-meal` | Registra no diário a refeição sugerida num cartão do chat | Logado |
| GET | `/chat/conversations` | Lista as conversas do usuário | Logado |
| GET | `/chat/conversations/:conversationId` | Histórico de uma conversa | Logado |

## Dados do relógio (Health Connect)

Liberado pela variável `WEARABLES_ENABLED`.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/patients/me/wearables/status` | Se o recurso de relógio está liberado para o paciente logado, a versão do texto de consentimento e o consentimento atual | Logado |
| PUT | `/patients/me/wearables/consent` | Registra o consentimento para ler os dados do relógio (tipos de dado e versão do texto aceito) | Logado |
| DELETE | `/patients/me/wearables/consent` | Revoga o consentimento e para a sincronização. Com deleteData=true, apaga também os dados vindos do relógio | Logado |
| POST | `/patients/me/wearables/sync` | Envia resumos diários do relógio e treinos, já calculados no celular. Tudo é opcional: cada aparelho mede coisas diferentes. Idempotente por dia (e por treino). Só grava o que foi consentido; o sono digitado à mão não é sobrescrito | Logado |
| GET | `/patients/me/wearables/summary` | Dados do relógio do paciente logado: dia a dia e a semana contra a anterior | Logado |
| GET | `/patients/:patientId/wearables` | Dados do relógio do paciente para o profissional: a semana contra a anterior, pontos de atenção e o dia a dia. Sem consentimento ativo, devolve connected=false | Profissional |

## Treino: biblioteca de exercícios e fichas

Só para profissionais de Educação Física (módulos `workouts` e `exercises`).

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/workout-templates` | Modelos de ficha: os meus e os compartilhados pela clínica | Profissional · módulo `workouts` |
| POST | `/workout-templates` | Salva uma ficha como modelo | Profissional · módulo `workouts` |
| POST | `/workout-templates/:id/apply` | Cria um rascunho de ficha para o aluno a partir do modelo | Profissional · módulo `workouts` |
| DELETE | `/workout-templates/:id` | Apaga um modelo meu | Profissional · módulo `workouts` |
| GET | `/exercises` | Biblioteca de exercícios: o catálogo do Orion, os meus e os que colegas da clínica compartilharam | Profissional · módulo `exercises` |
| POST | `/exercises` | Cria um exercício próprio | Profissional · módulo `exercises` |
| PATCH | `/exercises/:id` | Altera um exercício meu | Profissional · módulo `exercises` |
| DELETE | `/exercises/:id` | Apaga um exercício meu que não esteja em nenhuma ficha | Profissional · módulo `exercises` |
| GET | `/patients/:patientId/workout-programs` | Fichas de treino que montei para o aluno | Profissional · módulo `workouts` |
| POST | `/patients/:patientId/workout-programs` | Cria uma ficha de treino (rascunho) para o aluno | Profissional · módulo `workouts` |
| GET | `/workout-programs/:id` | Uma ficha de treino completa | Profissional · módulo `workouts` |
| PUT | `/workout-programs/:id` | Salva a ficha inteira (dias e exercícios) | Profissional · módulo `workouts` |
| POST | `/workout-programs/:id/activate` | Ativa a ficha; a ativa anterior do aluno é arquivada | Profissional · módulo `workouts` |
| POST | `/workout-programs/:id/archive` | Arquiva a ficha | Profissional · módulo `workouts` |
| POST | `/workout-programs/:id/duplicate` | Copia a ficha como rascunho, para o mesmo aluno ou outro vinculado | Profissional · módulo `workouts` |
| DELETE | `/workout-programs/:id` | Apaga uma ficha que não esteja ativa | Profissional · módulo `workouts` |

## Treino: execução pelo aluno e acompanhamento

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/professionals/training-panel` | Painel do educador físico: quem precisa de atenção (sem ficha, parado, meta da semana em risco) e quem está em dia | Profissional · módulo `workouts` |
| GET | `/patients/:patientId/workout-followup` | Frequência, evolução de carga e últimos treinos do aluno (90 dias) | Profissional · módulo `workouts` |
| GET | `/patients/:patientId/workout-sessions/:sessionId` | Um treino concluído do aluno, com as séries feitas | Profissional · módulo `workouts` |
| GET | `/patients/:patientId/workout-report/pdf` | Relatório em PDF da evolução do aluno no treino (90 dias): frequência, carga, avaliação física e ficha atual | Profissional · módulo `workouts` |
| POST | `/patients/:patientId/workout-report/send` | Envia ao e-mail do aluno o relatório de treino em PDF. As respostas do aluno chegam ao educador | Profissional · módulo `workouts` |
| GET | `/patients/:patientId/workout-report/deliveries` | Relatórios de treino já enviados por e-mail ao aluno | Profissional · módulo `workouts` |
| GET | `/patients/me/workout-program` | Ficha de treino ativa do paciente logado, a meta da semana e o treino em andamento | Logado |
| POST | `/patients/me/workout-days/:id/start` | Começa (ou retoma) o treino de uma divisão da ficha ativa | Logado |
| GET | `/patients/me/workout-sessions` | Treinos concluídos do paciente logado, do mais recente para o mais antigo | Logado |
| PATCH | `/patients/me/workout-sessions/:id` | Guarda as séries marcadas do treino em andamento | Logado |
| POST | `/patients/me/workout-sessions/:id/complete` | Conclui o treino: vira um registro de treino do dia | Logado |
| DELETE | `/patients/me/workout-sessions/:id` | Descarta um treino não concluído | Logado |

## Resumo cruzado entre áreas

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/patients/:patientId/cross-summary` | Resumo da outra área do mesmo aluno: o nutricionista vê o treino, o educador vê a alimentação, ambos em termos gerais | Profissional |

## Documentos e arquivos

Documentos (prescrições, declarações) só existem com `DOCUMENTS_ENABLED=true`; sem ela as rotas respondem 404. Arquivos/exames dependem do armazenamento S3 configurado.

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/patients/:id/documents` | Documentos emitidos para o paciente (prescrições, declarações, atestados), do mais novo ao mais antigo, com os cancelados | Profissional |
| POST | `/patients/:id/documents` | Emite um documento para o paciente. Recebe um número sequencial do profissional e não se edita depois: para corrigir, cancele e emita outro | Profissional |
| POST | `/patients/:id/documents/:documentId/cancel` | Cancela um documento emitido (continua na lista, marcado como cancelado, e some para o paciente) | Profissional |
| GET | `/patients/:id/documents/:documentId/pdf` | PDF do documento, para o profissional que o emitiu | Profissional |
| GET | `/patients/me/documents` | Documentos do paciente logado (os cancelados não aparecem) | Logado |
| GET | `/patients/me/documents/:documentId/pdf` | PDF de um documento do paciente logado | Logado |
| GET | `/patients/me/files` | Exames e outros arquivos que o paciente logado enviou, do mais novo ao mais antigo | Logado |
| POST | `/patients/me/files` | Envia um exame, bioimpedância ou outro arquivo (PDF, JPG, PNG ou HEIC, até 10 MB). Multipart: os campos category (lab \| bioimpedance \| other), title e examDate (AAAA-MM-DD) vão antes do arquivo | Logado |
| GET | `/patients/me/files/:fileId/download` | Link temporário (5 min) para baixar um arquivo do paciente logado | Logado |
| DELETE | `/patients/me/files/:fileId` | Apaga um arquivo que o próprio paciente enviou (some do app e do armazenamento) | Logado |
| GET | `/patients/:id/files` | Exames e arquivos enviados pelo paciente (Profissional com acesso ao paciente) | Profissional |
| GET | `/patients/:id/files/:fileId/download` | Link temporário (5 min) para baixar um arquivo do paciente (Profissional com acesso ao paciente) | Profissional |

## Financeiro

Só existe com `CHARGES_ENABLED=true`; sem ela todas as rotas respondem 404 (`FEATURE_DISABLED`).

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| POST | `/patients/:id/charges` | Registra uma cobrança para um paciente vinculado (com `repeatMonths`, cria uma por mês) | Profissional |
| GET | `/charges` | Cobranças do profissional logado, com filtros por situação, paciente e mês de vencimento | Profissional |
| GET | `/charges/summary` | Resumo do mês: recebido, a receber e atrasado | Profissional |
| POST | `/charges/:chargeId/pay` | Marca a cobrança como paga e emite o recibo | Profissional |
| POST | `/charges/:chargeId/cancel` | Cancela a cobrança (continua na lista, marcada) | Profissional |
| GET | `/charges/:chargeId/receipt.pdf` | Recibo em PDF de uma cobrança paga | Profissional |

## Avisos ao paciente

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| GET | `/patients/me/notices` | Caixa de avisos do paciente logado, do mais recente para o mais antigo, com a contagem de não lidos | Logado |
| GET | `/patients/me/notice-settings` | Escolhas do paciente logado sobre os avisos (e-mail ligado por padrão) | Logado |
| PATCH | `/patients/me/notice-settings` | Liga ou desliga o aviso por e-mail do paciente logado. A caixa de avisos do app continua funcionando. | Logado |
| POST | `/patients/me/notices/read-all` | Marca todos os avisos do paciente logado como lidos | Logado |
| POST | `/patients/me/notices/:id/read` | Marca um aviso do paciente logado como lido | Logado |

## Privacidade e direitos do titular (LGPD)

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| POST | `/patients/me/delete-account` | Exclui a conta do paciente logado (LGPD, lojas de apps). Apaga na hora o que é só do paciente e mantém, sem acesso pelo app, o que os profissionais registraram, pelo prazo legal. Pede a senha. Não dá para desfazer. | Logado |
| GET | `/patients/me/export` | Baixa, em JSON, todos os dados que o Orion guarda sobre o paciente logado (portabilidade, LGPD). Não inclui senha, sessões nem o arquivo PDF do InBody. | Logado |
| GET | `/me/terms` | Versões vigentes dos termos de uso e da política de privacidade e se o usuário logado já aceitou | Logado |
| POST | `/me/terms/accept` | Registra o aceite dos termos de uso e da política de privacidade (só vale para as versões vigentes) | Logado |
