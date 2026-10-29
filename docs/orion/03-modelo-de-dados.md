# Orion — modelo de dados

Fonte: `orion_back/prisma/schema.prisma` (Prisma 7, PostgreSQL). Gerado a partir do arquivo em outubro/2026; **o schema vence** em caso de divergência. Os campos de relação (que apontam para outras tabelas) aparecem na coluna *Relações* de cada modelo; só os campos gravados na tabela estão na lista de campos. A tabela real de `User` se chama `user` (`@@map`).

São 52 modelos e 29 enums, organizados por assunto abaixo.


## Pessoas, equipes e acesso


### User (tabela `user`)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave |
| `email` | String | único |
| `password` | String? |  |
| `role` | Role | padrão patient; enum Role |
| `createdAt` | DateTime | padrão now() |
| `name` | String |  |
| `deletedAt` | DateTime? | Conta excluída pelo paciente: a linha fica só como âncora do prontuário retido (sem login, sem dado pessoal). |
| `retainUntil` | DateTime? | Fim do prazo legal de guarda; depois dele o job de purga apaga a linha e a cascata leva o resto. |
| `emailVerified` | Boolean | padrão false |
| `image` | String? |  |
| `updatedAt` | DateTime |  |

**Relações:** `professionalProfile`→Professional, `patients`→ProfessionalPatient[], `profile`→UserProfile, `goals`→NutritionalGoal[], `nutritionalProtocols`→NutritionalProtocol[], `mealPlans`→MealPlan[], `meals`→Meal[], `summaries`→DailySummary[], `messages`→Message[], `conversations`→Conversation[], `alertsAsPatient`→Alert[], `weightRecords`→WeightRecord[], `anthropometries`→Anthropometry[], `anamneses`→Anamnesis[], `reportDeliveries`→ReportDelivery[], `wearableConsent`→WearableConsent, `termsAcceptances`→TermsAcceptance[], `notices`→PatientNotice[], `wearableDays`→WearableDaily[], `bodyCompositions`→BodyComposition[], `appointmentsAsPatient`→Appointment[], `documentsAsPatient`→PatientDocument[], `patientFiles`→PatientFile[], `chargesAsPatient`→Charge[], `workoutPrograms`→WorkoutProgram[], `workoutSessions`→WorkoutSession[], `sessions`→Session[], `accounts`→Account[], `behavioralMemory`→BehavioralMemory, `clinicMemberships`→ClinicMember[], `clinicsAsPatient`→ClinicPatient[], `hydrationLogs`→HydrationLog[], `workoutLogs`→WorkoutLog[], `sleepLogs`→SleepLog[], `checkIns`→CheckIn[], `noticeSettings`→NoticeSettings

### Session (tabela `session`)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave |
| `expiresAt` | DateTime |  |
| `token` | String |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |
| `ipAddress` | String? |  |
| `userAgent` | String? |  |
| `userId` | String |  |

**Relações:** `user`→User

### Account (tabela `account`)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave |
| `accountId` | String |  |
| `providerId` | String |  |
| `userId` | String |  |
| `accessToken` | String? |  |
| `refreshToken` | String? |  |
| `idToken` | String? |  |
| `accessTokenExpiresAt` | DateTime? |  |
| `refreshTokenExpiresAt` | DateTime? |  |
| `scope` | String? |  |
| `password` | String? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `user`→User

### Verification (tabela `verification`)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave |
| `identifier` | String |  |
| `value` | String |  |
| `expiresAt` | DateTime |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

### Professional

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String | único |
| `specialty` | String? |  |
| `crnCrm` | String? |  |
| `inviteCode` | String? | único; NOVO: código único para convites de pacientes |
| `phone` | String? |  |
| `council` | ProfessionalCouncil? | enum ProfessionalCouncil |
| `registrationNumber` | String? |  |
| `registrationRegion` | String? |  |
| `primaryArea` | String? |  |
| `area` | ProfessionalArea | padrão nutrition; enum ProfessionalArea; Área que liga os módulos do profissional. Quem já existia é nutrição. |
| `otherAreas` | String[] | padrão [] |
| `yearsExperience` | String? |  |
| `cpf` | String? |  |
| `birthDate` | DateTime? |  |
| `verificationStatus` | ProfessionalVerificationStatus | padrão pending_documents; enum ProfessionalVerificationStatus |
| `monthlyReportEnabled` | Boolean | padrão true; Recebe por e-mail, todo dia 1º, o resumo do mês anterior. Pode ser desligado nas preferências. |
| `defaultMeetingUrl` | String? | Link padrão da sala de teleconsulta (por exemplo, a sala fixa do Google Meet). Preenche o campo ao marcar consulta online. |
| `clinicId` | String? |  |

**Relações:** `user`→User, `patients`→ProfessionalPatient[], `alerts`→Alert[], `nutritionalProtocols`→NutritionalProtocol[], `mealPlans`→MealPlan[], `anthropometries`→Anthropometry[], `anamneses`→Anamnesis[], `reportDeliveries`→ReportDelivery[], `libraryTemplates`→LibraryTemplate[], `exercises`→Exercise[], `workoutPrograms`→WorkoutProgram[], `appointments`→Appointment[], `documents`→PatientDocument[], `charges`→Charge[], `receipts`→Receipt[], `clinic`→Clinic

### Clinic

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `name` | String |  |
| `cnpj` | String? |  |
| `logoUrl` | String? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `professionals`→Professional[], `members`→ClinicMember[], `patients`→ClinicPatient[]

### ClinicMember

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `clinicId` | String |  |
| `userId` | String |  |
| `role` | ClinicRole | enum ClinicRole |
| `createdAt` | DateTime | padrão now() |

**Relações:** `clinic`→Clinic, `user`→User

### ClinicPatient

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `clinicId` | String |  |
| `patientId` | String |  |
| `linkedAt` | DateTime | padrão now() |

**Relações:** `clinic`→Clinic, `patient`→User

### ProfessionalPatient

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `professionalId` | String |  |
| `patientId` | String |  |
| `linkedAt` | DateTime | padrão now() |
| `acceptedAt` | DateTime? | Quando o aluno aceitou o vínculo. Vazio enquanto o profissional que cadastrou o aluno espera o aceite. |
| `consentVersion` | String? | Versão do texto que o aluno viu ao aceitar ("legado" para os vínculos anteriores ao aceite). |

**Relações:** `professional`→Professional, `patient`→User

### UserProfile

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String | único |
| `sex` | String |  |
| `age` | Int |  |
| `weightKg` | Float | peso atual (snapshot — histórico em WeightRecord) |
| `heightCm` | Float |  |
| `goal` | Goal | enum Goal |
| `medicationStatus` | MedicationStatus | enum MedicationStatus |
| `appetiteStatus` | AppetiteStatus | enum AppetiteStatus |
| `currentStreak` | Int | padrão 0 |
| `shields` | Int | padrão 0 |
| `lastLoggedAt` | DateTime? |  |
| `updatedAt` | DateTime |  |
| `birthDate` | DateTime? |  |
| `socialName` | String? |  |
| `gender` | String? |  |
| `phone` | String? |  |
| `cpf` | String? |  |
| `profession` | String? |  |
| `city` | String? |  |
| `state` | String? |  |
| `cep` | String? |  |
| `targetWeightKg` | Float? |  |
| `targetDate` | DateTime? |  |
| `onboardingCompletedAt` | DateTime? |  |
| `onboardingDraft` | Json? |  |
| `acquisitionSource` | String? |  |
| `wakeTimeMinutes` | Int? |  |
| `waterGoalMl` | Int | padrão 2500 |
| `weeklyWorkoutGoal` | Int | padrão 4 |
| `sleepGoalMinutes` | Int | padrão 450 |
| `glp1Details` | Json? |  |
| `activityFactor` | Float? | Último fator de atividade usado no cálculo de gasto energético (1,2 a 1,9). |
| `diseases` | String? |  |
| `medications` | String? |  |
| `dietaryRestrictions` | String? |  |
| `allergies` | String? |  |
| `eatingRoutine` | String? |  |
| `activityLevel` | String? |  |
| `preferences` | String? |  |

**Relações:** `user`→User

### BehavioralMemory

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String | único |
| `lowProteinMorningCount` | Int | padrão 0 |
| `skippedMealsCount` | Int | padrão 0 |
| `lowAppetiteDays` | Int | padrão 0 |
| `highAdherenceStreak` | Int | padrão 0 |
| `weekendRelapseCount` | Int | padrão 0 |
| `last7DaysProteinAvg` | Float | padrão 0 |
| `commonFailures` | String[] | Ex: ["late_night_snack", "weekend_low_protein"] |
| `lastPatternAnalysis` | DateTime | padrão now() |
| `detectedPatterns` | Json? | Ex: { "morning_resistance": true, "night_binge_risk": "high" } |

**Relações:** `user`→User

## Nutrição: metas, protocolos, plano alimentar e refeições


### NutritionalGoal

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `proteinG` | Float |  |
| `carbG` | Float |  |
| `fatG` | Float |  |
| `calories` | Int |  |
| `source` | GoalSource | enum GoalSource |
| `setAt` | DateTime | padrão now() |

**Relações:** `user`→User

### NutritionalProtocol

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `professionalId` | String |  |
| `goal` | Goal | enum Goal |
| `calories` | Int |  |
| `proteinG` | Float |  |
| `carbG` | Float |  |
| `fatG` | Float |  |
| `mealsPerDay` | Int |  |
| `waterMl` | Int |  |
| `notes` | String? |  |
| `mealPlan` | String? |  |
| `prioritizeProtein` | Boolean | padrão true |
| `alertCalories` | Boolean | padrão true |
| `respectRestrictions` | Boolean | padrão true |
| `considerMedication` | Boolean | padrão true |
| `guidance` | String? |  |
| `returnInDays` | Int? |  |
| `breakfastProteinG` | Float? |  |
| `lunchProteinG` | Float? |  |
| `snackProteinG` | Float? |  |
| `dinnerProteinG` | Float? |  |
| `breakfastCalories` | Int? |  |
| `lunchCalories` | Int? |  |
| `snackCalories` | Int? |  |
| `dinnerCalories` | Int? |  |
| `status` | ProtocolStatus | padrão active; enum ProtocolStatus |
| `activatedAt` | DateTime | padrão now() |
| `archivedAt` | DateTime? |  |
| `archiveReason` | String? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `patient`→User, `professional`→Professional, `mealPlans`→MealPlan[]

### MealPlan

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `professionalId` | String |  |
| `protocolId` | String? | Protocolo cujas metas o plano segue. Nulo se o protocolo foi removido ou nunca existiu. |
| `name` | String | padrão "Plano alimentar" |
| `status` | MealPlanStatus | padrão draft; enum MealPlanStatus |
| `notes` | String? |  |
| `source` | String | padrão "manual"; "manual" ou "ai" (rascunho sugerido pela IA: pede confirmação de revisão para ativar). |
| `aiReport` | Json? | Relatório da geração pela IA: avisos, alimentos não encontrados, removidos por restrição e ajustes de quantidade. |
| `activatedAt` | DateTime? |  |
| `archivedAt` | DateTime? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `patient`→User, `professional`→Professional, `protocol`→NutritionalProtocol, `meals`→MealPlanMeal[]

### MealPlanMeal

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `planId` | String |  |
| `position` | Int |  |
| `label` | String | "Café da manhã", "Lanche da tarde"…: o profissional pode renomear. |
| `mealType` | MealType? | enum MealType |
| `time` | String? | "07:30" |
| `notes` | String? |  |
| `recipe` | Json? | Receita da refeição: título, tempo, passos, dica, origem e avisos. Os ingredientes não ficam aqui: vêm do plano. |
| `recipeItemsHash` | String? | Impressão dos alimentos e gramas quando a receita foi escrita; mudou depois = receita desatualizada. |
| `recipePublished` | Boolean | padrão false; O paciente só vê receita liberada (e em dia). |

**Relações:** `plan`→MealPlan, `items`→MealPlanItem[]

### MealPlanItem

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `mealId` | String |  |
| `position` | Int |  |
| `tacoFoodId` | Int? | Id do alimento na TACO. Nulo = alimento livre (fora da TACO), com os macros digitados. |
| `name` | String |  |
| `grams` | Float |  |
| `household` | String? | Medida caseira em texto livre ("2 colheres de sopa"). |
| `kcal` | Int | Macros da porção, copiados na hora de salvar: o plano não muda se a tabela mudar. |
| `proteinG` | Float |  |
| `carbG` | Float |  |
| `fatG` | Float |  |
| `clinicFoodId` | String? | Alimento próprio da clínica (`ClinicFood`). Nulo = TACO (`tacoFoodId`) ou alimento livre. |
| `substituteOfId` | String? | Preenchido nas substituições: aponta para o item principal. Substituição não entra nos totais do dia. |

**Relações:** `meal`→MealPlanMeal, `substituteOf`→MealPlanItem, `substitutes`→MealPlanItem[]

### ClinicFood

Alimento próprio: marca, suplemento ou algo que a TACO não tem. Macros por 100 g. Arquivar em vez de apagar.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `clinicId` | String? | Nulo = catálogo pessoal do profissional (sem clínica). |
| `ownerId` | String |  |
| `name` | String |  |
| `kcalPer100` | Float |  |
| `proteinPer100` | Float |  |
| `carbPer100` | Float |  |
| `fatPer100` | Float |  |
| `archivedAt` | DateTime? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

### FoodMeasure

Medida caseira criada pelo profissional ("1 concha = 90 g") para um alimento da TACO ou próprio. As medidas do sistema ficam em código (`lib/taco/measures.ts`).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `tacoFoodId` | Int? |  |
| `clinicFoodId` | String? |  |
| `label` | String |  |
| `grams` | Float |  |
| `clinicId` | String? |  |
| `ownerId` | String |  |
| `createdAt` | DateTime | padrão now() |

### Meal

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `description` | String |  |
| `quantity` | Float? |  |
| `unit` | String? |  |
| `mealType` | MealType | enum MealType |
| `loggedAt` | DateTime |  |
| `planMealId` | String? | Refeição do plano alimentar de onde veio o registro ("Comi isso"). Sem chave estrangeira: o plano pode ser refeito. |
| `planAdjusted` | Boolean | padrão false; O paciente desmarcou ou trocou algum alimento ao registrar pelo plano. |
| `idempotencyKey` | String? |  |

**Relações:** `user`→User, `mealItem`→MealItem

### MealItem

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `mealId` | String | único |
| `proteinG` | Float? |  |
| `carbG` | Float? |  |
| `fatG` | Float? |  |
| `calories` | Int? |  |
| `leucineScore` | Float? |  |
| `leucineStatus` | LeucineStatus? | enum LeucineStatus |
| `aiFeedback` | String? |  |
| `macroSource` | String? | Origem dos macros: "taco" (tabela), "mixed" (parte TACO, parte IA), "estimated" (só IA) ou "manual" (editado pelo usuário). |
| `macroBreakdown` | Json? | Por alimento: gramas, valor e se veio da TACO ou da IA. Nulo em registros antigos e em edição manual. |
| `reviewedAt` | DateTime? | Quando o profissional conferiu (aprovou ou corrigiu) estes macros. Nulo = ainda não revisado. |

**Relações:** `meal`→Meal

### DailySummary

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `summaryDate` | DateTime |  |
| `proteinTotalG` | Float |  |
| `carbTotalG` | Float |  |
| `fatTotalG` | Float |  |
| `caloriesTotal` | Int |  |
| `dayStatus` | DayStatus | enum DayStatus |
| `diagnosis` | String? |  |
| `nextDayAdvice` | String? |  |
| `trendMessage` | String? |  |
| `goalProteinG` | Float? |  |
| `goalCarbG` | Float? |  |
| `goalFatG` | Float? |  |
| `goalCalories` | Int? |  |

**Relações:** `user`→User

## Chat com a IA


### Conversation

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `title` | String? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `messages`→Message[], `user`→User

### Message

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `conversationId` | String |  |
| `role` | MessageRole | enum MessageRole |
| `content` | String |  |
| `payload` | Json? | Resposta estruturada do Orion (card, ações rápidas, refeição registrada). Nulo nas mensagens do paciente. |
| `sentAt` | DateTime | padrão now() |

**Relações:** `user`→User, `conversation`→Conversation

## Alertas e sinais


### Alert

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `professionalId` | String |  |
| `patientId` | String |  |
| `level` | AlertLevel | enum AlertLevel |
| `trend` | AlertTrend | enum AlertTrend |
| `message` | String |  |
| `read` | Boolean | padrão false |
| `createdAt` | DateTime | padrão now() |
| `resolvedAt` | DateTime? | O profissional deu o alerta por tratado. Alerta resolvido sai da central e do sino. |
| `snoozedUntil` | DateTime? | Adiado até esta data: some da lista e o job não cria outro do mesmo tipo até lá. |

**Relações:** `professional`→Professional, `patient`→User

### SignalAction

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `professionalId` | String |  |
| `patientId` | String |  |
| `signalCode` | String |  |
| `kind` | String |  |
| `helped` | Boolean? |  |
| `note` | String? |  |
| `createdAt` | DateTime | padrão now() |

## Acompanhamento do paciente


### WeightRecord

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `weightKg` | Float |  |
| `loggedAt` | DateTime | padrão now() |
| `notes` | String? | observação livre (ex: "após consulta") |

**Relações:** `user`→User

### BodyComposition

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `fatPercent` | Float? | % gordura corporal |
| `leanMassKg` | Float? | massa magra em kg |
| `waterPercent` | Float? | % água corporal |
| `boneMassKg` | Float? | massa óssea (opcional) |
| `measuredAt` | DateTime |  |
| `notes` | String? |  |
| `fileKey` | String? | Chave do PDF do InBody no bucket (privado). Nulo quando não há arquivo guardado. |
| `fileName` | String? |  |

**Relações:** `user`→User

### Anthropometry

Medidas de uma avaliação (circunferências e dobras cutâneas). Tudo é opcional: preenche-se o que foi medido. Os valores derivados (IMC, % de gordura, massa magra) saem de cálculo na leitura e não são gravados.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `professionalId` | String |  |
| `measuredAt` | DateTime |  |
| `notes` | String? |  |
| `bodyFatMethod` | BodyFatMethod? | enum BodyFatMethod; Protocolo escolhido para o % de gordura por dobras. |
| `weightKg` | Float? |  |
| `heightCm` | Float? |  |
| `neckCm` | Float? |  |
| `chestCm` | Float? |  |
| `waistCm` | Float? |  |
| `abdomenCm` | Float? |  |
| `hipCm` | Float? |  |
| `armRightCm` | Float? |  |
| `armLeftCm` | Float? |  |
| `thighRightCm` | Float? |  |
| `thighLeftCm` | Float? |  |
| `calfRightCm` | Float? |  |
| `calfLeftCm` | Float? |  |
| `tricepsMm` | Float? |  |
| `bicepsMm` | Float? |  |
| `subscapularMm` | Float? |  |
| `chestFoldMm` | Float? |  |
| `axillaryMm` | Float? |  |
| `suprailiacMm` | Float? |  |
| `abdominalMm` | Float? |  |
| `thighFoldMm` | Float? |  |
| `calfFoldMm` | Float? |  |
| `createdAt` | DateTime | padrão now() |

**Relações:** `user`→User, `professional`→Professional

### Anamnesis

Uma anamnese aplicada: o modelo usado (cópia das perguntas na hora, para editar o modelo depois não mudar as antigas) e as respostas. Concluída, ela atualiza os campos correspondentes do perfil do paciente.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `professionalId` | String |  |
| `templateId` | String | Chave do modelo do Orion (por exemplo "nutricional-completa"). |
| `templateName` | String |  |
| `templateSnapshot` | Json |  |
| `answers` | Json | padrão "{}" |
| `status` | AnamnesisStatus | padrão draft; enum AnamnesisStatus |
| `filledBy` | AnamnesisFiller | padrão professional; enum AnamnesisFiller |
| `sentAt` | DateTime? | Quando o profissional enviou ao paciente responder no app (nulo = só do profissional). |
| `submittedAt` | DateTime? | Quando o paciente enviou as respostas de volta. |
| `completedAt` | DateTime? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `user`→User, `professional`→Professional

### HydrationLog

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `amountMl` | Int |  |
| `loggedAt` | DateTime | padrão now() |

**Relações:** `user`→User

### WorkoutLog

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `name` | String? |  |
| `completedAt` | DateTime | padrão now() |
| `notes` | String? |  |
| `source` | String | padrão "manual"; manual = digitado pelo paciente; wearable = veio do relógio (Health Connect). |
| `externalId` | String? | Id do registro no Health Connect: reenviar o mesmo treino não duplica. |
| `durationMinutes` | Int? |  |
| `calories` | Int? |  |
| `avgHeartRate` | Int? |  |

**Relações:** `user`→User

### SleepLog

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `nightDate` | DateTime |  |
| `durationMinutes` | Int |  |
| `quality` | String? |  |
| `loggedAt` | DateTime | padrão now() |
| `source` | String | padrão "manual"; manual = digitado pelo paciente; wearable = veio do relógio (o manual nunca é sobrescrito). |
| `lightMinutes` | Int? |  |
| `deepMinutes` | Int? |  |
| `remMinutes` | Int? |  |

**Relações:** `user`→User

### CheckIn

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `kind` | CheckInKind | enum CheckInKind |
| `value` | String | Escolha da resposta; os valores válidos de cada tipo ficam em activity.ts. |
| `answeredAt` | DateTime | padrão now() |

**Relações:** `user`→User

### WearableConsent

Consentimento do paciente para o Orion ler os dados do relógio (Health Connect). Um por paciente.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String | único |
| `source` | String | padrão "health_connect" |
| `scopes` | String[] | steps, sleep, heart_rate, active_calories |
| `textVersion` | String | Versão do texto de consentimento que o paciente aceitou. |
| `grantedAt` | DateTime | padrão now() |
| `revokedAt` | DateTime? |  |
| `lastSyncAt` | DateTime? |  |

**Relações:** `user`→User

### WearableDaily

Um dia de medidas do relógio, em resumo (o servidor não guarda a série de batimentos). Dia de Brasília.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `date` | DateTime |  |
| `steps` | Int? |  |
| `activeCalories` | Int? |  |
| `heartRateAvg` | Int? |  |
| `heartRateMin` | Int? |  |
| `heartRateMax` | Int? |  |
| `heartRateResting` | Int? |  |
| `totalCalories` | Int? | Gasto total do dia (basal mais atividade), em kcal. |
| `hrvMs` | Int? | Variabilidade da frequência cardíaca (RMSSD médio do dia), em ms. |
| `weightKg` | Float? |  |
| `bodyFatPercent` | Float? |  |
| `leanMassKg` | Float? |  |
| `vo2Max` | Float? |  |
| `spo2Avg` | Float? | Saturação de oxigênio média do dia, em %. |
| `syncedAt` | DateTime | padrão now() |

**Relações:** `user`→User

## Treino (educação física)


### Exercise

Exercício da biblioteca. `catalogKey` preenchido = do catálogo do Orion (todos veem); vazio = do profissional.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `catalogKey` | String? | único |
| `name` | String |  |
| `muscleGroup` | MuscleGroup | enum MuscleGroup |
| `equipment` | String? |  |
| `instructions` | String? |  |
| `videoUrl` | String? | Reservado para a fase dos vídeos; a v1 não usa. |
| `ownerId` | String? |  |
| `clinicId` | String? |  |
| `sharedWithClinic` | Boolean | padrão false |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `owner`→Professional, `dayExercises`→WorkoutDayExercise[]

### WorkoutProgram

Ficha de treino de um aluno. Um programa ativo por aluno e profissional: ativar arquiva o anterior.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `patientId` | String |  |
| `professionalId` | String |  |
| `name` | String |  |
| `goal` | String? |  |
| `notes` | String? |  |
| `status` | WorkoutProgramStatus | padrão draft; enum WorkoutProgramStatus |
| `startsAt` | DateTime? |  |
| `endsAt` | DateTime? |  |
| `activatedAt` | DateTime? |  |
| `archivedAt` | DateTime? |  |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `patient`→User, `professional`→Professional, `days`→WorkoutDay[], `sessions`→WorkoutSession[]

### WorkoutDay

Divisão da ficha: "Treino A", "Treino B"...

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `programId` | String |  |
| `position` | Int |  |
| `label` | String |  |
| `notes` | String? |  |

**Relações:** `program`→WorkoutProgram, `exercises`→WorkoutDayExercise[]

### WorkoutDayExercise

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `dayId` | String |  |
| `exerciseId` | String |  |
| `position` | Int |  |
| `sets` | Int |  |
| `reps` | String | Texto livre para aceitar faixas e falhas: "8-12", "15", "até a falha". |
| `loadKg` | Float? |  |
| `restSeconds` | Int? |  |
| `tempo` | String? |  |
| `notes` | String? |  |

**Relações:** `day`→WorkoutDay, `exercise`→Exercise

### WorkoutSession

Uma execução do treino pelo aluno. Congela a divisão no início (`plan`): editar a ficha depois não muda o histórico.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `patientId` | String |  |
| `programId` | String? | Some se a ficha for apagada; o histórico fica com os nomes abaixo. |
| `programName` | String |  |
| `dayLabel` | String |  |
| `plan` | Json | Os exercícios da divisão no momento em que o treino começou (ver `SessionPlanItem`). |
| `startedAt` | DateTime | padrão now() |
| `completedAt` | DateTime? |  |
| `perceivedEffort` | Int? | Esforço percebido de 1 a 10, informado ao concluir. |
| `notes` | String? |  |
| `workoutLogId` | String? | único; O treino concluído também conta na meta semanal e na sequência do aluno. |

**Relações:** `patient`→User, `program`→WorkoutProgram, `sets`→WorkoutSetLog[]

### WorkoutSetLog

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `sessionId` | String |  |
| `plannedItemId` | String | Id do item no `plan` da sessão (não é chave estrangeira: a ficha pode ser refeita). |
| `setIndex` | Int |  |
| `reps` | Int? |  |
| `loadKg` | Float? |  |
| `done` | Boolean | padrão false |

**Relações:** `session`→WorkoutSession

## Agenda, documentos e financeiro


### Appointment

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `patientId` | String |  |
| `professionalId` | String |  |
| `scheduledAt` | DateTime | data prevista |
| `completedAt` | DateTime? | data realizada (null se ainda não ocorreu) |
| `status` | AppointmentStatus | padrão scheduled; enum AppointmentStatus |
| `notes` | String? | observações clínicas do retorno |
| `modality` | AppointmentModality | padrão in_person; enum AppointmentModality |
| `meetingUrl` | String? | Link da sala da teleconsulta (https). Só vale quando `modality` é `online`. |
| `durationMin` | Int? | Duração em minutos. Nulo nas consultas antigas, de antes de existir duração (valem 30 min no conflito de horário). |
| `cancelReason` | String? | Motivo do cancelamento, escrito pela equipe. Interno: o paciente recebe o aviso, mas não vê o motivo. |
| `patientResponse` | AppointmentPatientResponse? | enum AppointmentPatientResponse; Resposta do paciente ao aviso da consulta, pelo app. Volta a nulo quando o horário muda. |
| `patientRespondedAt` | DateTime? |  |
| `weightAtAppointment` | Float? | peso no momento do retorno |
| `dietAdjustments` | String? | adaptações realizadas na dieta |

**Relações:** `patient`→User, `professional`→Professional, `documents`→PatientDocument[], `charges`→Charge[]

### PatientDocument

Prescrição (suplementos, fitoterápicos), declaração de comparecimento ou atestado, emitido pelo profissional. Depois de emitido não se edita: corrige-se cancelando e emitindo outro. O PDF sai deste registro.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `patientId` | String |  |
| `professionalId` | String |  |
| `kind` | DocumentKind | enum DocumentKind |
| `number` | Int | Número sequencial por profissional e ano (Nº 000012/2026). |
| `year` | Int |  |
| `title` | String |  |
| `items` | Json? | Prescrições: [{ name, dose, frequency, duration, instructions }]. |
| `body` | String? | Declaração e atestado: o texto final. Na prescrição, as observações gerais. |
| `appointmentId` | String? |  |
| `attendedAt` | DateTime? | Data a que a declaração de comparecimento se refere. |
| `issuedAt` | DateTime | padrão now() |
| `cancelledAt` | DateTime? |  |
| `cancelReason` | String? |  |

**Relações:** `patient`→User, `professional`→Professional, `appointment`→Appointment

### PatientFile

Exame, bioimpedância ou outro arquivo que o próprio paciente envia pelo app. O profissional vinculado vê e baixa; quem apaga é só o paciente. O arquivo fica em bucket privado (`storageKey`).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `patientId` | String |  |
| `category` | String | lab | bioimpedance | other |
| `title` | String |  |
| `fileName` | String |  |
| `mimeType` | String |  |
| `sizeBytes` | Int |  |
| `storageKey` | String |  |
| `examDate` | DateTime? | Data do exame, quando o paciente informa. |
| `uploadedAt` | DateTime | padrão now() |

**Relações:** `patient`→User

### Charge

Cobrança registrada à mão pelo profissional. O dinheiro nunca passa pelo Orion: o paciente paga por fora e o profissional marca como paga. "Atrasada" não é gravada: sai de `pending` com vencimento passado.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `professionalId` | String |  |
| `patientId` | String |  |
| `appointmentId` | String? |  |
| `description` | String |  |
| `amountCents` | Int | Valor em centavos de real, sempre inteiro. |
| `dueDate` | DateTime | Só a data (dia de Brasília), em meia-noite UTC. |
| `status` | ChargeStatus | padrão pending; enum ChargeStatus |
| `paidAt` | DateTime? |  |
| `method` | String? | pix | cash | card | transfer | other |
| `cancelledAt` | DateTime? |  |
| `cancelReason` | String? |  |
| `seriesId` | String? | Cobranças criadas juntas ("repetir por N meses") compartilham a série. |
| `createdAt` | DateTime | padrão now() |

**Relações:** `professional`→Professional, `patient`→User, `appointment`→Appointment, `receipt`→Receipt

### Receipt

Recibo de pagamento (não é nota fiscal). Numeração sequencial por profissional e ano; nunca se edita.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `chargeId` | String | único |
| `professionalId` | String |  |
| `number` | Int |  |
| `year` | Int |  |
| `issuedAt` | DateTime | padrão now() |

**Relações:** `charge`→Charge, `professional`→Professional

## Comunicação, relatórios e privacidade


### PatientNotice

Aviso ao paciente na caixa de avisos do app (plano mudou, consulta marcada, anamnese recebida...). O texto nunca leva dado clínico.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `patientId` | String |  |
| `kind` | String | plan_updated, workout_updated, document_issued, document_cancelled, anamnesis_sent, appointment_created, appointment_rescheduled, appointment_cancelled |
| `title` | String |  |
| `body` | String |  |
| `target` | String? | Rota do app para onde o toque leva (por exemplo "/plano"). Vazio = só abre a caixa de avisos. |
| `createdAt` | DateTime | padrão now() |
| `readAt` | DateTime? |  |

**Relações:** `patient`→User

### NoticeSettings

Escolhas do paciente sobre os avisos. Sem registro, vale o padrão: aviso por e-mail ligado.

| Campo | Tipo | Observação |
|---|---|---|
| `userId` | String | chave |
| `emailEnabled` | Boolean | padrão true |

**Relações:** `user`→User

### TermsAcceptance

Aceite dos termos de uso e da política de privacidade. Guarda um registro por aceite (nunca sobrescreve), com as versões vistas.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `termsVersion` | String |  |
| `privacyVersion` | String |  |
| `acceptedAt` | DateTime | padrão now() |

**Relações:** `user`→User

### AccountDeletionLog

Prova de que o pedido de exclusão foi atendido (LGPD art. 37). Sem chave estrangeira de propósito: sobrevive à purga do usuário. Nunca guarda dado de saúde.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userRef` | String | sha256 do id do usuário: dá para provar que um pedido existiu sem guardar quem foi. |
| `deletedAt` | DateTime | padrão now() |
| `erasedCategories` | String[] |  |
| `retainedCategories` | String[] |  |
| `retainUntil` | DateTime |  |

### ReportDelivery

Relatório ou plano enviado por e-mail ao paciente: o histórico do que foi mandado e quando.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `userId` | String |  |
| `professionalId` | String |  |
| `kind` | String | protocol | evolution | meal_plan |
| `toEmail` | String |  |
| `sentAt` | DateTime | padrão now() |

**Relações:** `user`→User, `professional`→Professional

### LibraryTemplate

Modelo reutilizável da biblioteca do profissional: um protocolo ou um plano alimentar sem os dados do paciente. O conteúdo fica em `payload` (JSON validado na escrita); aplicar um modelo copia, não liga: mudar o modelo depois não altera o que já foi aplicado a um paciente.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String | chave; padrão uuid() |
| `kind` | TemplateKind | enum TemplateKind |
| `name` | String |  |
| `description` | String? |  |
| `ownerId` | String |  |
| `clinicId` | String? | Clínica do dono na hora de criar; só é visível aos colegas dela se `sharedWithClinic`. |
| `sharedWithClinic` | Boolean | padrão false |
| `payload` | Json |  |
| `usedCount` | Int | padrão 0 |
| `createdAt` | DateTime | padrão now() |
| `updatedAt` | DateTime |  |

**Relações:** `owner`→Professional

## Enums

| Enum | Valores |
|---|---|
| `Role` | `patient`, `professional`, `secretary` |
| `ClinicRole` | `owner`, `admin`, `professional`, `secretary` |
| `ProfessionalCouncil` | `CRM`, `CRN`, `CREF` |
| `ProfessionalArea` | `nutrition`, `physical_education`  — Área de atuação: decide quais módulos o profissional enxerga (ver `modulesFor` em professionals/areas.ts). |
| `ProfessionalVerificationStatus` | `pending_documents`, `in_review`, `verified`, `rejected` |
| `MealType` | `breakfast`, `lunch`, `snack`, `dinner`, `supper` |
| `Goal` | `loss`, `recomp`, `gain`, `maintenance`, `health`, `performance` |
| `MedicationStatus` | `none`, `tirzepatide`, `other` |
| `AppetiteStatus` | `normal`, `low`, `nausea` |
| `GoalSource` | `manual`, `nutritionist` |
| `ProtocolStatus` | `active`, `archived` |
| `LeucineStatus` | `ok`, `low`, `critical` |
| `DayStatus` | `on_track`, `warning`, `off_track` |
| `MessageRole` | `user`, `assistant` |
| `AlertLevel` | `critical`, `at_risk`, `adherent` |
| `AlertTrend` | `improving`, `worsening`, `stable` |
| `AppointmentStatus` | `scheduled`, `completed`, `missed`, `cancelled` |
| `DocumentKind` | `supplement`, `herbal`, `attendance`, `certificate`  — Tipos de documento que o profissional emite para o paciente. |
| `AppointmentModality` | `in_person`, `online`  — Presencial ou online (teleconsulta, com o link da sala em `Appointment.meetingUrl`). |
| `MealPlanStatus` | `draft`, `active`, `archived` |
| `TemplateKind` | `protocol`, `meal_plan`, `anamnesis`, `workout_program` |
| `AnamnesisStatus` | `draft`, `submitted`, `completed` |
| `AnamnesisFiller` | `professional`, `patient` |
| `BodyFatMethod` | `jackson_pollock_3`, `jackson_pollock_7`, `durnin_womersley` |
| `AppointmentPatientResponse` | `confirmed`, `reschedule_requested` |
| `ChargeStatus` | `pending`, `paid`, `cancelled` |
| `MuscleGroup` | `chest`, `back`, `shoulders`, `biceps`, `triceps`, `forearms`, `abs`, `glutes`, `quadriceps`, `hamstrings`, `calves`, `full_body`, `cardio` |
| `WorkoutProgramStatus` | `draft`, `active`, `archived` |
| `CheckInKind` | `hunger`, `hydration`, `sleep_quality`, `energy`  — Pergunta rápida respondida pela notificação do app (fome, hidratação, qualidade do sono, energia). |
