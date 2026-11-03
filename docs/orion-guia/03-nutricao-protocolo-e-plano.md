---
pai: "Guia de uso do Orion"
pai_pasta: "Orion (guia de uso)"
---
# Protocolo e plano alimentar

O **protocolo** define o objetivo e as metas do paciente; o **plano alimentar** diz o que comer em cada refeição. Os dois são versionados: cada mudança vira uma nova versão, e o histórico fica guardado.

## 1. Protocolo nutricional

### Criar o protocolo

**Onde:** ficha do paciente › **Configurar protocolo** (`/pacientes/[id]/protocolo`). O assistente tem 4 passos:

| Passo | O que acontece |
|---|---|
| **Objetivo e metas** | Pode partir de um **modelo**. Mostra o **gasto energético** do paciente e **sugere** uma meta de calorias (a sugestão nunca é gravada sozinha). Você define calorias, proteína, carboidrato, lipídio, número de refeições e hidratação, a distribuição de proteína e o **intervalo de retorno** |
| **Plano alimentar** | Orientações do plano, com restrições e alergias do paciente à vista |
| **Diretrizes para o Orion** | Regras de acompanhamento que o Orion segue com esse paciente |
| **Revisar e ativar** | Confira e ative. Se o protocolo define retorno, o Orion convida a **Agendar retorno** |

### Acompanhar o protocolo

**Onde:** menu › **Protocolos** (`/protocolos`) e `/protocolos/[patientId]`.

- A lista mostra o **protocolo ativo de cada paciente**.
- Em cada paciente: versão atual, diretrizes, módulos e o **histórico de versões**, com **Visualizar**, **Comparar com a vigente**, **Duplicar**, **Salvar como modelo** e **Reativar**. **Desativar** encerra o protocolo.

### Como as versões funcionam

- Toda mudança cria uma **nova versão**; a anterior é arquivada com o motivo.
- **Ajustar só as metas** (na ficha) também gera nova versão.
- As calorias seguem a regra 4/4/9: proteína e carboidrato valem 4 kcal por grama; gordura, 9.

## 2. Plano alimentar

**Onde:** ficha do paciente › aba **Plano alimentar**.

### Estados do plano

| Estado | O que significa |
|---|---|
| **Rascunho** | Em construção. Só rascunho pode ser apagado |
| **Ativo** | O plano que o paciente vê no app. **Ativar** um plano arquiva o ativo anterior |
| **Arquivado** | Histórico. Não se edita: **duplica-se** para criar um rascunho novo |

### Montar o plano

A barra do plano tem o seletor (rascunho, ativo e arquivados) e três caminhos para começar: **Sugerir com IA**, **De um modelo** e **Novo plano**.

- Cada **refeição** tem nome, horário, observação e os **alimentos**, em gramas com **medida caseira** (por exemplo, "1 pão francês"). Dá para mover a refeição e refazê-la com IA.
- Os **macros são sempre calculados pelo sistema** a partir do alimento e da quantidade. A busca vê os alimentos da clínica e a Tabela TACO; o **Alimento livre** permite digitar os macros à mão.
- O botão **Substituição** mostra o equivalente em energia para trocar um alimento por outro.
- A coluna da direita mostra o **total do dia contra a meta do protocolo** (na meta, acima ou abaixo), a conferência com a anamnese (alergias e restrições) e as orientações do plano.

### Ações do plano
Apagar rascunho, **PDF**, **Lista de compras**, **Gerar receitas**, **Liberar receitas**, **Salvar como modelo**, **Salvar** e **Ativar plano**.

### Sugerir com IA

1. A IA recebe um resumo **sem a identificação do paciente** e devolve nomes de alimentos e uma quantidade inicial.
2. O sistema procura cada alimento na Tabela TACO (o que ela não conhece sai, e você vê a lista do que foi removido).
3. Aplica a **trava de restrições**: alergias e restrições do paciente impedem alimentos.
4. Ajusta as porções para ficar a **±5% da meta de cada refeição** (de 5 em 5 gramas). Sem meta por refeição, divide as calorias do dia: café 25%, almoço 30%, lanche 15%, jantar 25% e ceia 5%.
5. Entrega um **rascunho com um relatório**: o que foi ajustado, o que ficou de fora e o que saiu por restrição.

O plano sugerido por IA **só pode ser ativado depois que você confirma a revisão**.

### Receitas

- Geradas pela IA a partir dos alimentos do plano ou escritas por você (a sua vale mais).
- Nascem como **rascunho**: o paciente só as vê quando você **libera**, por refeição ou todas de uma vez.
- Se o plano mudar, a receita fica marcada como **desatualizada** e some para o paciente até você revisá-la.

### Lista de compras

Soma cada alimento em todas as refeições, para **7 dias** por padrão (o app oferece 7, 15 e 30), agrupa por corredor de mercado e, para arroz, feijão, lentilha, frango e carne, mostra a quantidade **aproximada para comprar crua**. Também sai em PDF.

### Modelos

Um plano (ou protocolo) vira **modelo** sem os dados do paciente, privado ou compartilhado com a clínica. Aplicar um modelo cria um **rascunho** com os macros recalculados. Veja em [Modelos](07-relatorios-modelos-e-avisos.md).

## 3. Aderência ao plano

O Orion compara o diário do paciente com o plano ativo nos últimos dias (7 por padrão), refeição por refeição: **seguiu**, **comeu outra coisa** ou **pulou**. Quando a aderência fica baixa, o Orion gera o sinal **Pouca aderência ao plano** (ver [Acompanhamento](04-acompanhamento-sinais-e-alertas.md)).

No app, o paciente usa o botão **Comi isso** para registrar a refeição do plano (ver [Alimentação no app](12-app-plano-compras-e-copiloto.md)).

## 4. De onde vêm os macros

| Origem | Quando |
|---|---|
| **Tabela TACO** | O alimento está na tabela |
| **TACO + IA** | Parte do prato veio da tabela e parte da estimativa da IA |
| **Estimado** | Só a IA estimou |
| **Manual** | O profissional revisou e corrigiu |

Toda refeição estimada pela IA entra na fila **Revisar refeições**, onde você **aprova** ou **corrige** os números (ver [Acompanhamento](04-acompanhamento-sinais-e-alertas.md)).
