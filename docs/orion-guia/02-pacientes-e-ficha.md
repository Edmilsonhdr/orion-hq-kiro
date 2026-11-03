---
pai: "Guia de uso do Orion"
pai_pasta: "Orion (guia de uso)"
---
# Pacientes e ficha

Como o profissional traz o paciente para o Orion e como usa a **ficha**, o centro do atendimento. Tudo isto acontece no **site**.

## 1. Como o paciente chega até você

Há três caminhos:

| Caminho | Como funciona |
|---|---|
| **Você cadastra** | Em **Novo paciente**, você preenche os dados. O Orion cria a conta e envia um **convite por e-mail** para o paciente definir a própria senha (o link vale 7 dias). O vínculo fica "aguardando aceite" até o paciente aceitar no app, mas **você já pode atender** normalmente |
| **O paciente se vincula** | Quem já tem conta digita o seu **código de convite** (`OR-XXXXXX`) em Mais › Minha equipe, no app. O vínculo nasce aceito |
| **Convite reenviado** | Na ficha, o botão **Reenviar convite** manda de novo o e-mail de quem ainda não definiu a senha |

O paciente pode **desvincular** você quando quiser, pelo app.

## 2. Lista de pacientes

**Onde:** menu › **Pacientes** (`/pacientes-lista`).

- **Filtros:** Todos, Críticos, Em risco, Aderentes e Sem registro hoje, cada um com a contagem.
- Cada paciente mostra as **barras de proteína, carboidrato e gordura do dia**, o percentual de **adesão** e os botões **Protocolo** e **Abrir**.
- **Quem vê quem:** o profissional vê os pacientes vinculados a ele; dono, administrador e secretária veem a clínica inteira (a secretária sem meta e peso).

## 3. Cadastrar um paciente

**Onde:** menu › **Novo paciente** (`/pacientes`). São 4 passos:

| Passo | O que você informa |
|---|---|
| **Dados pessoais** | Nome, nome social, nascimento, sexo biológico, gênero, e-mail, WhatsApp, CPF, profissão, cidade, estado, CEP e como conheceu o Orion |
| **Dados clínicos** | Objetivo (obrigatório), apetite, medicação, doenças, medicamentos, restrições, alergias e nível de atividade |
| **Composição corporal** | Peso e altura (obrigatórios); gordura, massa magra, água e massa óssea (opcionais). Dá para **importar o PDF do InBody**: o Orion lê as medidas e guarda o arquivo |
| **Revisão** | Confira tudo e conclua. O paciente é cadastrado, vinculado e convidado por e-mail |

## 4. A ficha do paciente

**Onde:** Pacientes › **Abrir** (`/pacientes/[id]`).

No topo ficam o nome, a situação da jornada, o contato e as ações:

- **WhatsApp:** abre o WhatsApp **do próprio profissional** com mensagens prontas e editáveis (sem registro, desvio, geral). O Orion não envia nada sozinho.
- **Ver protocolo** ou **Configurar protocolo** (Nutrição) / **Fichas de treino** (Educação Física).
- **Registrar evolução.**
- **Mais ações:** Agendar retorno, Sinais do paciente, Editar prontuário, Ajustar metas e Relatório PDF.
- Um cartão de **resumo cruzado** mostra o que a outra área registrou: o nutricionista vê os treinos da semana e o último treino; o educador físico vê a regularidade da alimentação, sem macros.

### As abas da ficha

As abas de Nutrição somem para o educador físico.

| Aba | O que mostra |
|---|---|
| **Visão analítica** | Período de 7 ou 30 dias; adesão, dias com registro, alertas ativos e próximo retorno; linha do tempo da jornada; distribuição de proteína por refeição; lacunas do dia; plano resumido; padrões identificados pelo Orion; diário analítico dos últimos três dias |
| **Prontuário** | Peso atual e variação, aderência de 30 dias, situação do dia, massa magra; identificação e contato; perfil clínico; comportamento; **Anamneses** |
| **Plano alimentar** *(Nutrição)* | O editor do plano (ver [Protocolo e plano](03-nutricao-protocolo-e-plano.md)) |
| **Diário alimentar** *(Nutrição)* | Refeições por dia, com navegação semanal e calendário: descrição, horário, calorias e macros, **origem** dos macros (Tabela TACO ou TACO + IA), comentário do Orion e a lista de alimentos |
| **Rotina** | Pontos de atenção da semana; dados do relógio (só com relógio conectado e consentimento); sono, água, treinos e como o paciente se sente (respostas às perguntas rápidas), cada um com a origem do dado; 7 ou 30 dias |
| **Evolução corporal** | Curva de peso com a meta e a **projeção pelo ritmo das últimas semanas** (por exemplo, "faltam X kg até a data"); linha do tempo única; medidas corporais; composição corporal |
| **Exames** | Os arquivos que o paciente enviou (exames e InBody), com download por link temporário |

### Janelas da ficha

| Janela | Para que serve |
|---|---|
| **Ajustar metas** | Muda calorias, proteína, carboidrato e gordura. Se há protocolo, cria uma **nova versão** sem apagar o histórico |
| **Editar prontuário** | Contato, doenças, medicamentos, alergias, restrições, nível de atividade e meta de peso com data |
| **Registrar evolução** | Peso e composição da consulta |
| **WhatsApp** | Mensagens prontas para enviar pelo seu WhatsApp |

## 5. Evolução corporal e antropometria

Na aba **Evolução corporal**, além do peso, você registra **avaliações com medidas**: circunferências e dobras cutâneas. O Orion calcula índices como **IMC** e **relação cintura-quadril**.

- Informe **ao menos uma medida**; valores fora da faixa possível são recusados.
- Apagar uma avaliação lançada por engano **mantém** o peso que já estava no histórico.
- A **projeção de peso** usa o ritmo das últimas 8 semanas e aparece junto da meta.

## 6. Anamnese

A anamnese é o formulário de avaliação do paciente. Ela fica dentro do **Prontuário**.

1. Toque em **Nova anamnese** e escolha um **modelo**. O Orion guarda uma **cópia** das perguntas: se você editar ou apagar o modelo depois, as anamneses já feitas não mudam.
2. Abra o **rascunho** e preencha **na consulta**, ou **envie ao paciente** (ele recebe um aviso no app e, se não desligou, um e-mail).
3. O paciente responde no app, uma pergunta por vez, e **envia**. As respostas voltam para você **como rascunho**. Se quiser desfazer o envio, dá para **cancelar** enquanto ele ainda não respondeu.
4. Você revisa e **conclui**. Só nesse momento os campos ligados ao perfil (alergias, doenças, medicamentos) são atualizados.
5. Anamnese **concluída não se apaga**: é registro clínico. Só rascunho pode ser apagado.

**Modelos do Orion** (somente leitura): nutricional completa, retorno rápido e esportiva. Você cria os seus em **Modelos › Anamneses** ou duplica um do Orion. As perguntas podem ser texto, texto longo, escolha única ou múltipla, sim/não, número ou escala. A anamnese do educador físico inclui o **PAR-Q** (7 perguntas); resposta "sim" a alguma delas pede liberação médica.

## 7. O que cada profissional vê do paciente

O que você enxerga depende da **área** do seu vínculo:

| Quem | Vê |
|---|---|
| **Nutricionista** | Refeições, macros, plano alimentar e treinos concluídos |
| **Educador físico** | Fichas, cargas e treinos; da alimentação, **só o resumo** (aderência do dia e meta de proteína) |
| **Os dois** | Peso, medidas, composição corporal, sono, água, dados do relógio e as anamneses que o paciente respondeu para eles |

O paciente vê essa mesma lista no app, em **Minha equipe**. Um profissional não enxerga o que o outro registrou além desse recorte.

## 8. Exames do paciente

O que o paciente envia pelo app (PDF, JPG, PNG ou HEIC, até 10 MB) aparece na aba **Exames**. Você baixa por um link temporário de 5 minutos. O profissional vinculado vê e baixa; o próprio paciente pode apagar o que enviou.
