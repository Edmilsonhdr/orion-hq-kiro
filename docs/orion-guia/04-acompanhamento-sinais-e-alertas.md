---
pai: "Guia de uso do Orion"
pai_pasta: "Orion (guia de uso)"
---
# Acompanhamento e sinais

Como o profissional descobre **quem precisa de atenção** e o que fazer com isso. O Orion observa o diário, o plano e (quando há) o relógio de cada paciente e avisa o que merece uma conversa.

## 1. Visão geral (Painel)

**Onde:** menu › **Visão geral** (`/painel`), a primeira tela depois do login.

- **Período de análise:** 7 dias ou Hoje (o Orion lembra da sua escolha), com atalho para as consultas de hoje e para Novo paciente.
- **Primeiros passos:** a lista de configuração inicial, que pode ser fechada.
- **Quatro indicadores:** pacientes ativos, adesão média, precisam de atenção e retornos próximos.
- **Consultas passadas sem desfecho:** um cartão avisa quando há consultas que ficaram "Marcadas" e já passaram, com o botão **Resolver na agenda** (ver [Consultas](05-consultas-e-teleconsulta.md)).
- **Para ver hoje:** os pacientes do mais urgente ao menos, com a **prioridade** (Alta, Média, Baixa) e os **motivos** ("consulta hoje às 09:00", "sem registrar há 15 dias"). Filtre por prioridade, toque em **Abrir ficha** ou chame pelo **WhatsApp**.
- **Tabela de pacientes:** objetivo, adesão, proteína e calorias do dia contra a meta e a situação (Sem registro, Atenção, Em observação, Ótimo), com filtros e busca por nome.
- **Análise do paciente selecionado:** a mesma da aba *Visão analítica* da ficha.

## 2. Diário alimentar e revisão de refeições

### Diário alimentar
Na ficha, aba **Diário alimentar**: as refeições de cada dia com descrição, horário, calorias, macros, a **origem** dos macros e o comentário do Orion. Navegue por semana ou pelo calendário.

### Revisar refeições
**Onde:** menu › **Revisar refeições** (`/refeicoes`).

1. Escolha o período: 3, 7 ou 30 dias.
2. Cada refeição cujos macros foram **estimados pela IA** aparece para revisão.
3. **Aprove** como está ou **corrija** os números. O resumo do dia do paciente é atualizado na hora.
4. Sem pendências, a tela mostra "Tudo conferido".

## 3. Sinais do Orion

**Onde:** menu › **Sinais do Orion** (`/sinais`).

Um **sinal** é um ponto de atenção que o Orion percebe no comportamento do paciente. Ele é calculado na hora, a partir dos **últimos 14 dias** do diário, do plano e do relógio.

### O que a lista mostra
Os sinais do mais grave ao menos grave, cada um com a **prova** (por exemplo, "média de 52 g frente à meta de 120 g"), a recorrência em 7 dias e filtros por gravidade. Há um ícone de WhatsApp para chamar o paciente.

### O detalhe do sinal
Ao abrir um sinal (`/sinais/[patientId]/[código]`), você vê:
- **O que está acontecendo**, com os fatos;
- o **contexto do paciente** (últimas mensagens do chat e resumo);
- a **interpretação** e as **evidências e fontes**;
- a **ação sugerida**.

Você pode dizer se o contexto ajudou e **registrar a ação tomada** ou uma observação. Se o sinal já não está ativo (o paciente voltou ao normal), a tela avisa.

### Regras que ajudam a ler os sinais
- **Sem registro** só dispara depois de **dois dias completos** sem refeição.
- A **proteína** é avaliada em **dias completos**.
- **Registro incompleto** evita confundir um diário esparso com "comeu pouco".
- Os sinais de padrão olham os **últimos 14 dias**.

### Os 23 sinais

| Sinal | Gravidade |
|---|---|
| Proteína abaixo da meta | Alta |
| Sem registro no diário | Alta |
| Registro incompleto | Média |
| Hidratação abaixo da meta | Média |
| Macros fora da meta | Alta |
| Queda de adesão no fim de semana | Média |
| Proteína baixa no café da manhã | Alta |
| Intervalos longos sem registro | Média |
| Café da manhã pulado | Alta |
| Jantar com pouca proteína | Média |
| Jantar pulado | Alta |
| Proteína baixa no fim de semana | Média |
| Lanche tardio frequente | Média |
| Excesso alimentar no fim de semana | Alta |
| Compulsão no período noturno | Alta |
| Doce tarde da noite | Baixa |
| Horários irregulares | Alta |
| Intervalos longos entre refeições (mais de 7 horas) | Alta |
| Pouca aderência ao plano | Alta |
| Noites de sono curtas *(relógio)* | Média |
| Queda na atividade diária *(relógio)* | Média |
| Frequência cardíaca em repouso em alta *(relógio)* | Baixa |
| Variabilidade da frequência cardíaca em queda *(relógio)* | Baixa |

## 4. Alertas

**Onde:** menu › **Alertas** (`/alertas`).

Um **alerta** é um aviso gerado pelo Orion para chamar a sua atenção. Há dois tipos:

| Tipo | Quando é gerado |
|---|---|
| **Inatividade** | O paciente está **mais de 48 horas sem registrar** (verificação diária, às 9h) |
| **Desvio nutricional** | O dia do paciente saiu da meta (verificação diária, às 21h) |

### Como a tela funciona
- Três abas: **Abertos**, **Adiados** e **Resolvidos**; filtro por tipo.
- **Um cartão por paciente**, com a gravidade (**Crítico** ou **Em risco**).
- **Resolver:** encerra o alerta. **Adiar:** esconde por **1, 3 ou 7 dias** (enquanto adiado, o Orion não cria outro do mesmo tipo). As duas ações valem por alerta ou por paciente, e há **Desfazer** logo depois.
- O Orion **não repete**: no máximo um alerta por paciente por dia e nenhum igual enquanto houver um não lido.

## 5. Rotina do paciente

Na ficha, aba **Rotina**: pontos de atenção da semana, **dados do relógio** (quando conectado e com consentimento), sono, água, treinos e como o paciente se sente (respostas às **perguntas rápidas** que ele recebe por notificação). Cada informação mostra de onde veio. Dado de relógio é uma **estimativa**, não um diagnóstico.

## 6. Falar com o paciente

Do Painel, dos sinais, dos alertas e da ficha, o ícone de **WhatsApp** abre a conversa **no WhatsApp do próprio profissional**, com uma mensagem pronta (sem registro, desvio, geral) que você pode editar. O Orion não envia a mensagem por você.
