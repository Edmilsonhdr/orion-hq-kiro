# Orion — web do profissional (`orion-front`)

O site onde o profissional e a equipe da clínica atendem, acompanham e decidem. Next.js 14 (App Router), com o visual em Tailwind e shadcn/ui. O paciente **não** usa este site: ele usa o app (documento [05](05-app-paciente.md)).

Lido do código em 29/10/2026: a árvore `src/app`, o menu (`light-app-shell.tsx`), `area-modules.ts`, `clinic-modules.ts`, `features.ts`, `feature-catalog.ts`, `next.config.mjs` e os componentes das telas. As descrições de comportamento seguem o guia `docs/TELAS-DO-ORION.md` do back (de 19/10), **conferido contra o código** nos pontos que mudaram; o que mudou depois dele está marcado.

## 1. Mapa de rotas

| Rota | Tela | Observação |
|---|---|---|
| `/login`, `/cadastro`, `/esqueci-senha`, `/reset-password` | Acesso | Layout claro; `reset-password` também serve ao primeiro acesso de quem recebe convite |
| `/painel` | Visão geral | Primeira tela depois do login |
| `/pacientes-lista` | Lista de pacientes | |
| `/pacientes` | Cadastro de paciente | Assistente de 4 passos |
| `/pacientes/[id]` | Ficha do paciente | Abas (seção 4) |
| `/pacientes/[id]/protocolo` | Assistente de protocolo | Só nutrição |
| `/pacientes/[id]/treino` | Fichas de treino do aluno | Só educação física |
| `/pacientes/[id]/treino/novo`, `/pacientes/[id]/treino/[programId]` | Editor da ficha | Só educação física |
| `/pacientes/[id]/treino/acompanhamento` | Acompanhamento do treino | Só educação física |
| `/protocolos`, `/protocolos/[patientId]` | Protocolos dos pacientes e protocolo vigente | Só nutrição |
| `/sinais`, `/sinais/[patientId]`, `/sinais/[patientId]/[code]` | Sinais do Orion | Só nutrição |
| `/alertas` | Central de alertas | Só nutrição |
| `/refeicoes` | Revisar refeições | Só nutrição |
| `/agenda` | Consultas | Abas Dia, Semana, Mês |
| `/relatorios` | Relatórios | Só nutrição |
| `/modelos` | Modelos | Protocolos, planos, anamneses |
| `/exercicios` | Biblioteca de exercícios | Só educação física |
| `/financeiro` | Financeiro | **Só com `NEXT_PUBLIC_CHARGES_ENABLED=true`** |
| `/configuracoes` | Configurações | Abas por papel |
| `/funcionalidades` | Catálogo de funcionalidades | |
| `/interno/ux` | Pré-teste de UX | Restrito (`NEXT_PUBLIC_INTERNAL_REVIEWERS`) |

**Redirecionamentos** (`next.config.mjs` e páginas): `/home`, `/chat`, `/registrar`, `/feedback`, `/historico` e `/consolidado` levam a `/painel` (telas antigas do paciente na web); `/completar-perfil` leva a `/configuracoes`; `/mensagens` leva a `/sinais`; `/biblioteca` leva a `/protocolos`.

## 2. Moldura das telas e o que aparece para cada um

**Menu lateral** (em ordem): Visão geral, Sinais do Orion, Alertas, Pacientes, Novo paciente, Consultas, Protocolos, Exercícios, Financeiro, Modelos, Relatórios, Revisar refeições, Configurações. No celular, a barra de baixo traz só Visão, Pacientes, Novo, Consultas e Ajustes. O topo tem **Buscar (Ctrl K)**, Ajuda, notificações e o perfil.

O menu é filtrado por **duas camadas**:
1. **Área do profissional** (`area-modules.ts`, a partir do perfil): protocolos, sinais, alertas, relatórios e revisão de refeições aparecem só para **nutrição**; Exercícios só para **educação física**. Enquanto a área ainda não carregou, esses itens ficam escondidos para o menu não piscar. Se o perfil não carregar, a tela segue como nutrição. **Quem barra de verdade é a API**; o menu só decide o que mostrar.
2. **Módulos da clínica** (`clinic-modules.ts`): `/sinais`, `/agenda`, `/protocolos` e `/relatorios` poderiam ser desligados pela clínica. **Hoje isso não funciona de ponta a ponta:** o back não tem a rota `/clinics/modules` que o front consulta. Sem resposta, o front **mostra tudo** (ver pendências em [06](06-regras-fluxos-e-pendencias.md)).

## 3. Acesso

- **Login (`/login`):** e-mail e senha validados na hora. Se o e-mail não foi confirmado, a tela avisa que reenviou o link (válido por 24 horas). Depois de entrar, o destino é o Painel.
- **Cadastro (`/cadastro`):** assistente de 4 passos: *Conta* (nome, e-mail, celular, senha com medidor de força, aceite dos Termos e da Política), *Perfil profissional* (área, conselho CRM/CRN/CREF e região, área principal, tempo de atuação), *Dados* (revisão e CPF) e *Concluir* (envio do e-mail de confirmação). Usa `POST /professionals/register`.
- **Esqueci minha senha:** sempre responde o mesmo texto ("se este e-mail estiver cadastrado, você receberá um link"), para não revelar quais e-mails existem.
- **Nova senha (`/reset-password`):** mínimo de 8 caracteres, digitados duas vezes. É a mesma tela do **convite** (equipe e pacientes cadastrados pelo profissional), que também confirma o e-mail.

## 4. Telas do dia a dia

### Painel (`/painel`)
A primeira tela do dia: quem precisa de atenção e como está a carteira.
- Período de análise (7 dias ou Hoje, guardado para a próxima visita), atalho para as consultas de hoje e para Novo paciente.
- **Primeiros passos:** lista que pode ser fechada (completar perfil, cadastrar clínica, primeiro paciente, protocolo, primeira consulta, convidar equipe).
- **Quatro indicadores:** pacientes ativos, adesão média, precisam de atenção e retornos próximos.
- **Para ver hoje:** pacientes do mais urgente ao menos, com prioridade (Alta, Média, Baixa) e os **motivos** (por exemplo, "consulta hoje às 09:00", "sem registrar há 15 dias"), com filtros por prioridade, **Abrir ficha** e WhatsApp.
- **Tabela de pacientes:** objetivo, adesão, proteína e calorias do dia contra a meta e situação (Sem registro, Atenção, Em observação, Ótimo), com filtros e busca por nome.
- **Análise do paciente selecionado** (a mesma da aba *Visão analítica* da ficha). O endereço guarda o paciente escolhido (`?patient=`).

### Lista de pacientes e cadastro
- **Lista:** filtros Todos, Críticos, Em risco, Aderentes e Sem registro hoje, com contagem; cada paciente mostra barras de proteína, carboidrato e gordura do dia, percentual de adesão e os botões Protocolo e Abrir.
- **Cadastro (4 passos):** *Dados pessoais* (nome, nome social, nascimento, sexo biológico, gênero, e-mail, WhatsApp, CPF, profissão, cidade, estado, CEP, como conheceu o Orion), *Dados clínicos* (objetivo obrigatório, apetite, medicação, doenças, medicamentos, restrições, alergias, nível de atividade), *Composição corporal* (peso e altura obrigatórios; gordura, massa magra, água e massa óssea opcionais; dá para **importar o PDF do InBody**) e *Revisão*. Ao criar, o paciente é cadastrado, vinculado e **convidado por e-mail** (define a própria senha); a ficha mostra se o convite saiu e oferece **Reenviar convite**.

### Ficha do paciente (`/pacientes/[id]`)
O centro do atendimento. No topo: nome, situação da jornada, contato e botões **WhatsApp** (mensagens prontas e editáveis: sem registro, desvio, geral; o Orion não envia, a mensagem sai do WhatsApp do próprio profissional), **Ver protocolo** ou **Configurar protocolo**, **Registrar evolução** e o menu **Mais ações** (Agendar retorno, Sinais do paciente, Editar prontuário, Ajustar metas, Relatório PDF). Um cartão de **resumo cruzado** mostra o que a outra área registrou (nutricionista vê treino; educador vê a regularidade da alimentação).

**Abas** (as de nutrição somem para o educador físico; Documentos e Financeiro só aparecem com os recursos ligados):

| Aba | O que mostra |
|---|---|
| **Visão analítica** | Período de 7 ou 30 dias; adesão, dias com registro, alertas ativos e próximo retorno; linha do tempo da jornada; distribuição de proteína por refeição; gaps do dia; plano resumido; padrões identificados pelo Orion; diário analítico dos últimos três dias |
| **Prontuário** | Peso atual e variação, aderência de 30 dias, status do dia, massa magra; identificação e contato; perfil clínico; comportamento; **Anamneses** (seção abaixo) |
| **Plano alimentar** *(nutrição)* | Editor do plano (seção abaixo) |
| **Diário alimentar** *(nutrição)* | Refeições por dia, com navegação semanal e calendário; descrição, horário, calorias e macros, **origem** (Tabela TACO ou TACO + IA), comentário do Orion e lista de alimentos |
| **Rotina** | Pontos de atenção da semana; dados do relógio (só com relógio conectado e consentimento); sono, água, treinos e como o paciente se sente (respostas às perguntas rápidas), cada um com a origem do dado; 7 ou 30 dias |
| **Evolução corporal** | Curva de peso com meta e **projeção pelo ritmo das últimas semanas** (com texto direto, por exemplo "faltam X kg até a data"); linha do tempo única; medidas corporais (circunferências e dobras); composição corporal |
| **Exames** | Arquivos enviados pelo paciente (exames e InBody), com download por link temporário |
| **Documentos** *(se ligado)* | Prescrições, declarações e atestados emitidos |
| **Financeiro** *(se ligado)* | Cobranças daquele paciente |

Para o educador físico, a ficha oferece o botão **Fichas de treino**, em vez de protocolo e plano.

**Janelas da ficha:** *Ajustar metas* (se há protocolo, cria **nova versão** do protocolo sem apagar o histórico), *Editar prontuário* (contato, doenças, medicamentos, alergias, restrições, atividade e meta de peso com data), *Registrar evolução* (peso e composição da consulta) e *WhatsApp*.

**Anamnese (dentro de Prontuário):** *Nova anamnese* → escolher o modelo → abre um rascunho, que o profissional **preenche na consulta** ou **envia ao paciente**. O paciente responde no app; as respostas voltam **como rascunho**, e só ao **concluir** a anamnese ela é fechada e os campos ligados ao perfil (alergias, doenças, medicamentos) atualizam o paciente. Cada resposta fica guardada como estava no dia.

### Plano alimentar (aba da ficha)
- Barra do plano: seletor (rascunho, ativo, arquivados) e **Sugerir com IA**, **De um modelo**, **Novo plano**.
- Ações: apagar rascunho, PDF, **Lista de compras**, **Gerar receitas**, **Liberar receitas**, **Salvar como modelo**, **Salvar** e **Ativar plano**.
- Uma caixa por **refeição** (nome, horário, mover, refazer com IA, observação) com os **alimentos** em gramas e **medida caseira**, macros calculados pelo servidor e botão **Substituição**. Busca em TACO e nos alimentos da clínica, e **Alimento livre** (digitar os macros).
- Coluna da direita: total do dia contra a meta do protocolo (na meta, acima, abaixo), conferência com a anamnese (alergias e restrições) e orientações do plano.
- **Sugerir com IA** devolve um rascunho com um relatório (o que foi ajustado, o que ficou de fora, removido por restrição); **só ativa com confirmação de revisão**. Regras detalhadas em [01-backend.md](01-backend.md), seção 5.4.

### Protocolo nutricional
- **Assistente (`/pacientes/[id]/protocolo`), 4 passos:** *Objetivo e metas* (pode partir de um modelo; mostra o gasto energético e **sugere** uma meta de calorias, que nunca é gravada sozinha; metas de calorias, proteína, carboidrato, lipídio, refeições e hidratação; distribuição de proteína; intervalo de retorno), *Plano alimentar* (orientações, com restrições e alergias à vista), *Diretrizes para o Orion* (regras de acompanhamento) e *Revisar e ativar*.
- **Protocolo vigente (`/protocolos/[patientId]`):** versão atual, diretrizes, módulos e **histórico de versões**, com *Visualizar*, *Comparar com a vigente*, *Duplicar*, *Salvar como modelo* e *Reativar*; *Desativar* encerra o protocolo.
- **Lista (`/protocolos`):** protocolo ativo de cada paciente, de uma vez.

### Consultas (`/agenda`)
- Visões **Dia**, **Semana** e **Mês**; a visão e o dia ficam no endereço. Filtros por profissional (quando há mais de um) e por situação (Marcada, Realizada, Falta, Cancelada, com contagem).
- **Ações:** marcar realizada, marcar falta, cancelar e remarcar (consulta realizada não se remarca).
- **Nova consulta:** paciente, profissional, dia, horário e observações; aviso de **conflito de horário** (você escolhe outro horário ou confirma "Agendar mesmo assim"). Links de outras telas (como "Agendar retorno") já abrem a janela com o paciente preenchido.
- **Consulta online:** marque como online e informe o link da sala (`https://`); vem preenchido com o **link padrão** do perfil. A agenda mostra a etiqueta **Online** e o botão **Entrar**.

### Sinais, alertas e revisão de refeições *(nutrição)*
- **Sinais (`/sinais`):** lista dos sinais de atenção, do mais grave ao menos grave, com a prova ("média de 52 g frente à meta de 120 g"), a recorrência em 7 dias e filtros por gravidade; ícone de WhatsApp. O **detalhe** mostra o que está acontecendo, o contexto do paciente (últimas mensagens do chat e resumo), a interpretação, as evidências e fontes, a ação sugerida, e permite dizer se o contexto ajudou e registrar ação ou observação. Catálogo dos sinais em [01-backend.md](01-backend.md), seção 5.8.
- **Alertas (`/alertas`):** abas Abertos, Adiados e Resolvidos; filtro por tipo (Inatividade, Desvio nutricional); um cartão por paciente com a gravidade (Crítico, Em risco). **Resolver** e **Adiar** (1, 3 ou 7 dias) valem por alerta ou por paciente, com **Desfazer** logo depois.
- **Revisar refeições (`/refeicoes`):** período de 3, 7 ou 30 dias; cada refeição estimada pela IA pode ser **aprovada** ou **corrigida**; o resumo do dia do paciente é atualizado. Sem pendência, aparece "Tudo conferido".

### Relatórios e modelos
- **Relatórios (`/relatorios`):** resumo do mês (pacientes, quantos registraram, adesão média, variação de peso, consultas realizadas, faltas, taxa de falta); resumo da **clínica** por profissional (titular e administradores); um cartão por paciente com os PDFs **Clínico**, **Protocolo** e **Evolução**, e atalhos para **Enviar ao paciente** e **Plano alimentar**.
- **Modelos (`/modelos`):** três abas, **Protocolos**, **Planos alimentares** e **Anamneses**. Protocolo e plano nascem de um já feito (*Salvar como modelo*) e podem ser compartilhados com a equipe. Os três modelos de anamnese do Orion (completa, retorno rápido, esportiva) são somente leitura; você cria os seus ou duplica um. Cada pergunta pode ser texto, texto longo, escolha única ou múltipla, sim/não, número ou escala.

## 5. Educação Física *(visível só para a área de educação física)*

- **Exercícios (`/exercicios`):** biblioteca por grupo muscular, com busca; catálogo do Orion, exercícios próprios e os compartilhados pela clínica. Cada exercício aceita um **link de vídeo** do YouTube ou Vimeo; sem vídeo, o botão abre uma busca no YouTube pelo nome.
- **Fichas de treino (`/pacientes/[id]/treino`):** lista, ativar, arquivar, duplicar e apagar (a ficha ativa não se apaga). O **editor** define divisões, exercícios, séries, repetições, carga, descanso e ordem; uma ficha pode ser salva como **modelo** e aplicada a outro aluno.
- **Acompanhamento (`/pacientes/[id]/treino/acompanhamento`):** semana contra a meta, 30 dias, esforço médio, treinos por semana, evolução de carga por exercício, últimos treinos e "outros treinos" (livre e do relógio). Botão **Relatório em PDF** (90 dias) e envio ao e-mail do aluno.
- **Painel do educador:** na Visão geral, mostra os alunos por prioridade (sem ficha, parado, meta em risco, anotação no último treino) e as faixas de retenção (Engajado, Oscilando, Em risco, Abandono, Recuperado, Começando).

## 6. Financeiro *(desligado por padrão)*

`/financeiro` e a aba *Financeiro* da ficha só existem com `NEXT_PUBLIC_CHARGES_ENABLED=true` no front e `CHARGES_ENABLED=true` na API. A tela navega por mês e mostra o resumo (recebido, a receber, atrasado) e as cobranças, que podem ser **marcadas como pagas** (emitindo recibo em PDF) ou **canceladas**. Uma cobrança pode se repetir por 1 a 12 meses. É registro manual: não há integração com meio de pagamento.

> Observação: o catálogo de funcionalidades do próprio site (`/funcionalidades`) ainda lista "Financeiro" e "Prescrições e documentos" como **planejados**, embora a API e as telas já existam atrás de chave. Ver pendências em [06](06-regras-fluxos-e-pendencias.md).

## 7. Configurações (`/configuracoes`)

Abas no menu à esquerda; algumas só aparecem para quem tem o papel certo (a secretária, por exemplo, não vê os alimentos da clínica).
- **Meu perfil:** nome e e-mail (somente leitura), especialidade, conselho, **link padrão da teleconsulta** e **código de convite** `OR-XXXXXX`, com botão de copiar.
- **Minha clínica:** nome e CNPJ (saem no cabeçalho dos PDFs) e a **equipe**, com papéis Dono, Admin, Profissional e Secretária; remover e adicionar por e-mail.
- **Alimentos da clínica:** catálogo próprio (macros por 100 g) e medidas caseiras, compartilhado pela equipe; entram na busca do plano antes da TACO, e os macros são **copiados** para o plano (editar o alimento depois não muda planos já salvos).
- **Preferências:** liga ou desliga o resumo do mês por e-mail.
- **Segurança:** a tela tem os campos de troca de senha e o botão "Atualizar Senha", mas **eles não têm ação ligada** no código. Para trocar a senha, use **Esqueci minha senha** no login.

**Convidar equipe** (rodapé do menu): e-mail, nome opcional e papel (Administrador, Profissional, Secretária). Quem já tem conta é adicionado na hora; quem não tem recebe um convite por e-mail para definir a senha. Contas de paciente são recusadas.

## 8. Atalhos
- **Busca global (Ctrl K):** nomes de pacientes, telas e ações; setas e Enter para abrir, Esc para fechar.
- **Central de ajuda:** respostas curtas para as dúvidas de uso.
- **Funcionalidades (`/funcionalidades`):** catálogo do que o Orion faz, em quatro grupos (Para o profissional, Para o paciente, Plataforma e segurança, Planejado), com a situação de cada item (Disponível ou Planejado).

## 9. Como o web conversa com a API
- `src/lib/orion-api.ts` e `api.ts`: chamadas tipadas, sempre com `credentials: include`; a URL vem de `NEXT_PUBLIC_API_URL`.
- `backend-proxy.ts`: rotas do próprio Next que repassam cookie e origem para a API (usado, por exemplo, na transcrição de áudio).
- O `next.config.mjs` atual **não** tem mais as opções que ignoravam erros de ESLint e de tipo no build; o arquivo `docs/DEBITO_TECNICO.md` do front ainda diz que têm, então está desatualizado nesse ponto.
- Variáveis: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `OPENAI_API_KEY`, `OPENAI_WHISPER_MODEL`, `NEXT_PUBLIC_CHARGES_ENABLED`, `NEXT_PUBLIC_DOCUMENTS_ENABLED`, `NEXT_PUBLIC_INTERNAL_REVIEWERS`.
