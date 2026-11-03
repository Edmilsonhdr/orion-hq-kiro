---
pai: "Guia de uso do Orion"
pai_pasta: "Orion (guia de uso)"
---
# Educação Física

Como o educador físico monta e acompanha o treino dos alunos. As telas desta área aparecem **só para profissionais da área de Educação Física** (conselho CREF).

## 1. Biblioteca de exercícios

**Onde:** menu › **Exercícios** (`/exercicios`).

- Catálogo organizado por **grupo muscular**, com busca. Inclui os exercícios do Orion (66), os **seus** e os que colegas da clínica **compartilham**.
- Cada exercício aceita um **link de vídeo** do YouTube ou do Vimeo (o Orion guarda o link, nunca o vídeo). Sem vídeo, o botão abre uma busca no YouTube pelo nome do exercício.
- Você não apaga um exercício que esteja numa ficha.

## 2. Fichas de treino

**Onde:** ficha do aluno › **Fichas de treino** (`/pacientes/[id]/treino`).

### Estados da ficha

| Estado | O que significa |
|---|---|
| **Rascunho** | Em construção |
| **Ativa** | A ficha que o aluno vê no app. **Ativar** arquiva a ativa anterior. **Ficha ativa não se apaga** |
| **Arquivada** | Histórico; para reaproveitar, **duplique** |

### Montar a ficha
No **editor** (`/pacientes/[id]/treino/novo` ou `[programId]`), você define as **divisões** (os dias de treino), os **exercícios**, séries, repetições, carga, descanso e a ordem.

- **Ações da lista:** ativar, arquivar, **duplicar** (para o mesmo aluno ou outro aluno vinculado) e apagar rascunho.
- **Modelos de ficha:** salve uma ficha como modelo (privado ou da clínica) e aplique a outro aluno, que recebe um rascunho.
- Ao **ativar**, o aluno recebe um aviso no app: "Sua ficha de treino foi atualizada".

## 3. Como o aluno executa o treino

(Detalhes na visão do aluno: [Treino no app](13-app-treino.md).)

1. O aluno escolhe a divisão do dia. O app sugere a que está **há mais tempo sem fazer**.
2. Começar o treino **congela** a divisão naquela sessão.
3. Ele marca as séries uma a uma, com carga e repetições, e usa o cronômetro de descanso.
4. Ao concluir, informa o esforço e uma anotação. O treino entra na **meta semanal** e na **sequência**.

## 4. Acompanhamento do aluno

**Onde:** ficha do aluno › **Acompanhamento** (`/pacientes/[id]/treino/acompanhamento`).

- **Semana contra a meta** de treinos e **últimos 30 dias**.
- **Esforço médio** e **treinos por semana**.
- **Evolução de carga** por exercício.
- **Últimos treinos** e **outros treinos** (livres e os medidos pelo relógio).
- **Relatório em PDF** (últimos 90 dias), que você também pode **enviar ao e-mail** do aluno.

Se o aluno tem relógio conectado, o treino medido **dentro da janela do treino da ficha** (margem de 10 minutos) é somado ao da ficha, sem contar em dobro.

## 5. Painel do educador

Na **Visão geral**, o educador vê os alunos **por prioridade**:

- sem ficha;
- parados há 7 ou 14 dias;
- que nunca treinaram depois de 3 dias com a ficha;
- com a meta da semana em risco;
- com anotação no último treino.

### Faixas de retenção

| Faixa | Quando |
|---|---|
| **Engajado** | Até 3 dias sem treinar |
| **Oscilando** | 4 a 6 dias sem treinar |
| **Em risco** | 7 a 13 dias sem treinar |
| **Abandono** | 14 dias ou mais, ou nunca treinou |
| **Recuperado** | Voltou a treinar esta semana depois de uma pausa de 14 dias ou mais |
| **Começando** | Ficha ativada há menos de 3 dias e ainda sem nenhum treino |
| **Sem ficha** | O aluno ainda não tem ficha ativa |

## 6. Anamnese e relatórios do educador

- A anamnese do educador inclui o **PAR-Q** (7 perguntas). Resposta "sim" a alguma pede **liberação médica**. O fluxo é o mesmo descrito em [Pacientes e ficha](02-pacientes-e-ficha.md).
- O **resumo do mês** enviado por e-mail no dia 1º traz os números de treino para educadores.
