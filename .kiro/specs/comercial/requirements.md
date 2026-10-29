# Requirements Document

## Introdução

Módulo **Comercial** do Orion HQ: um CRM leve para a venda do Orion a **clínicas, empresas e profissionais
autônomos** (nutricionistas, nutrólogos e educadores físicos), usado principalmente pela sócia que atuará no
comercial. O funil segue o processo real descrito em `orion_back/docs/PILOTO-E-MERCADO.md`: conversa,
demonstração de 20 minutos, **piloto de 4 semanas**, proposta e fechamento. Reúne organizações, contatos,
negócios, histórico de interações e uma visão "Hoje" com os próximos passos. O Negócios (Bento) passa a responder
sobre o funil no chat e a **propor** atualizações, sempre com aprovação humana, e o resumo semanal ganha um
bloco comercial. Os documentos do Docs servem de biblioteca comercial (roteiros, objeções, propostas).

Decisões de escopo:
- Não há agente novo nem personagem novo no escritório: o Comercial é uma extensão do Negócios.
- **Só dados comerciais.** O CRM NUNCA deve guardar dados de saúde de pessoas (o Orion é um app de saúde).
- Fora do escopo: envio de e-mail/WhatsApp, integração com agenda externa, importação de planilhas, metas
  por vendedor, anexos, relatórios exportáveis, perfis de permissão.

## Requirements

### Requirement 1 — Organizações e contatos

**User Story:** Como sócia do comercial, quero cadastrar clínicas e empresas e seus contatos, para saber com
quem estou falando.

#### Acceptance Criteria

1. O sistema DEVE permitir criar e editar organizações com nome (obrigatório, até 200 caracteres), tipo
   (`clinica`, `autonomo`, `empresa` ou `outro`), área de atuação (`nutricao`, `educacao_fisica`, `ambas`
   ou `outra`, opcional), cidade, site e observações. Para o `autonomo`, a organização representa o
   profissional (nome dele ou do consultório) e ele pode não ter contatos além de si mesmo.
2. NÃO DEVEM existir duas organizações ativas com o mesmo nome (sem diferenciar maiúsculas); a tentativa
   DEVE responder 409 com mensagem em português.
3. O sistema DEVE permitir arquivar e desarquivar organizações (sem exclusão definitiva). Arquivadas não
   aparecem nas listas por padrão.
4. O sistema DEVE permitir criar, editar e excluir contatos de uma organização (nome obrigatório, cargo,
   e-mail, telefone). E-mail, se informado, DEVE ter formato válido.
5. A tela da organização DEVE mostrar contatos e negócios dela.

### Requirement 2 — Negócios e funil

**User Story:** Como sócia, quero acompanhar cada oportunidade em um funil, para saber o que fazer a seguir.

#### Acceptance Criteria

1. Um negócio DEVE pertencer a uma organização e ter título (obrigatório), etapa, valor mensal estimado em
   reais (opcional, ≥ 0), número estimado de pacientes/alunos ativos (opcional, ≥ 0), pacote de interesse
   (`essencial`, `completo` ou nenhum), o que usa hoje (texto livre: Dietbox, Nutrium, MFIT, planilha…),
   origem, responsável (usuário logado por padrão), próximo passo e data do próximo passo.
2. As etapas DEVEM ser, em ordem: `lead`, `contato`, `demonstracao`, `piloto`, `proposta`, `ganho`,
   `perdido`. Etapa inválida DEVE responder 422.
3. Mover para `perdido` DEVE exigir o motivo da perda; mover para `ganho` ou `perdido` DEVE registrar a
   data de fechamento; reabrir (mover para etapa aberta) DEVE limpar fechamento e motivo.
4. Toda mudança de etapa DEVE gerar uma entrada automática no histórico do negócio ("Etapa: A → B", com
   quem mudou) e atualizar a data em que o negócio entrou na etapa.
5. O sistema DEVE listar negócios com filtros por etapa, responsável e texto (busca ignorando acento, em
   título, organização e próximo passo). Negócios fechados (`ganho`/`perdido`) DEVEM aparecer só se
   fecharam nos últimos 30 dias, a menos que o filtro peça todos.
6. Valor e usuários inválidos (negativos, texto) DEVEM responder 422.

### Requirement 3 — Histórico de interações

**User Story:** Como sócia, quero registrar o que aconteceu em cada conversa, para não depender da memória.

#### Acceptance Criteria

1. O sistema DEVE permitir registrar interações num negócio: tipo (`ligacao`, `reuniao`, `email`,
   `whatsapp`, `nota`), resumo (obrigatório, até 5.000 caracteres), data/hora (padrão: agora) e autor.
2. O histórico DEVE aparecer do mais recente para o mais antigo, incluindo as mudanças de etapa.
3. Registrar uma interação DEVE contar como atividade recente do negócio (afeta "parado").
4. O sistema DEVE permitir excluir uma interação registrada à mão; entradas automáticas de etapa NÃO
   DEVEM poder ser excluídas.

### Requirement 4 — Visão "Hoje" e funil em números

**User Story:** Como sócia, quero abrir o sistema e ver o que preciso fazer hoje.

#### Acceptance Criteria

1. A visão "Hoje" DEVE listar negócios abertos agrupados em: **vencidos** (data do próximo passo antes de
   hoje), **hoje**, **próximos 7 dias**, e **sem próximo passo**. Hoje é calculado no fuso
   America/Sao_Paulo.
2. O resumo do funil DEVE trazer, por etapa, quantidade e valor mensal somado; total de negócios abertos e
   valor mensal potencial; ganhos e perdidos dos últimos 30 dias; taxa de conversão dos últimos 90 dias
   (ganhos ÷ fechados, ou nula sem fechamentos); contagem de vencidos e de sem próximo passo.
3. Um negócio aberto DEVE ser considerado **parado** quando a última interação ou alteração tem mais de N
   dias (padrão 7). O sistema DEVE listar os parados.
4. A tela DEVE mostrar valores em reais (pt-BR) e datas em dd/mm/aaaa.

### Requirement 5 — Telas

**User Story:** Como sócia, quero uma tela de funil rápida e clara.

#### Acceptance Criteria

1. O `Header` DEVE ter o item "Comercial" (`/comercial`) e mostrar um contador com os negócios vencidos
   quando houver.
2. `/comercial` DEVE ter abas **Hoje**, **Funil** e **Organizações**, com indicadores no topo (abertos,
   potencial/mês, ganhos em 30 dias, vencidos).
3. O Funil DEVE ser um quadro com uma coluna por etapa, cartões (organização, título, valor, próximo passo
   com destaque se vencido) e mover o cartão por arrastar e soltar **e** por um controle acessível
   (seletor de etapa) para teclado e celular.
4. Criar negócio DEVE permitir escolher uma organização existente ou criar uma nova no mesmo formulário.
5. A tela do negócio DEVE mostrar dados editáveis, contatos da organização, histórico e formulário para
   registrar interação; mover para perdido DEVE pedir o motivo.
6. Erros de API DEVEM aparecer em português sem perder o que foi digitado. A interface DEVE funcionar no
   celular.
7. Os formulários DEVEM avisar que não se deve registrar dados de saúde de pessoas.

### Requirement 6 — O Negócios consulta o funil

**User Story:** Como sócio, quero perguntar no chat sobre o comercial e receber respostas com dados reais.

#### Acceptance Criteria

1. O Negócios DEVE ter as ferramentas de leitura `resumo_funil`, `buscar_negocios`, `ver_negocio`,
   `negocios_parados` e `agenda_comercial`, que citam id, organização, etapa e datas.
2. Sem dados, as ferramentas DEVEM dizer isso explicitamente; o prompt DEVE proibir inventar números,
   proibir registrar ou repetir dados de saúde e proibir prometer funcionalidades, prazos ou preços que não
   estejam documentados no Docs ou no changelog (na dúvida, dizer que precisa confirmar com os sócios).
3. O supervisor DEVE encaminhar perguntas sobre leads, funil, propostas e clientes ao Negócios, e o prompt
   do Negócios DEVE mandar consultar também o Docs (roteiros, objeções, propostas).

### Requirement 7 — O Negócios propõe, sócios aprovam

**User Story:** Como sócia, quero pedir no chat "registra que liguei para a Clínica X e marca retorno
sexta", sem que o agente altere o funil sozinho.

#### Acceptance Criteria

1. O Negócios DEVE ter `propor_novo_negocio`, `propor_atualizacao_negocio` e `propor_interacao`. Elas NUNCA
   DEVEM gravar no CRM: só registram uma aprovação `pendente` (tipos `comercial_novo_negocio`,
   `comercial_atualizar_negocio`, `comercial_interacao`) e a atividade `aguardando_aprovacao`.
2. Valem as mesmas regras de validação do CRM; dado inválido volta ao agente como texto, sem aprovação.
   No máximo 5 propostas comerciais por pedido.
3. Aprovar DEVE aplicar a mudança, com autoria `<agente> (aprovado por <usuário>)` no histórico, e o
   Orquestrador DEVE avisar no chat; recusar não grava nada. A decisão continua atômica e restrita a
   aprovadores, e NÃO retoma o grafo.
4. Uma proposta que muda a etapa DEVE guardar a etapa de partida; se ao aprovar o negócio já estiver em
   outra etapa, ou tiver sido fechado/arquivado, NÃO DEVE aplicar, DEVE marcar `obsoleta` e avisar.
5. Falha ao aplicar vira status `erro` e "Tentar de novo" reaplica sem duplicar.
6. O card em Aprovações DEVE mostrar a ação e os campos da proposta de forma legível.

### Requirement 8 — Resumo semanal comercial e biblioteca

**User Story:** Como sócio, quero começar a semana sabendo como está o funil.

#### Acceptance Criteria

1. O cron semanal existente DEVE, além do resumo do changelog, postar no chat uma mensagem determinística
   (sem modelo) com o funil: abertos, potencial, ganhos/perdidos da semana, vencidos e parados. Sem nenhum
   negócio cadastrado, NÃO DEVE postar nada.
2. O repositório DEVE trazer modelos para a biblioteca comercial em `docs/comercial/` (roteiro de
   descoberta e demonstração de 20 minutos, objeções e respostas, modelo de proposta, checklist e
   acompanhamento do piloto) e um script para importá-los ao Docs. Os modelos seguem a estrutura e a
   linguagem dos documentos do Orion (`orion_back/docs`), mas NÃO DEVEM inventar nem copiar preços e
   números do rascunho de cobrança (que são fictícios): usam campos `[preencher]` e avisam para conferir a
   fonte atual antes de prometer algo ao cliente.

### Requirement 9 — Qualidade

#### Acceptance Criteria

1. O `db/schema.sql` DEVE continuar idempotente.
2. Testes pytest para validação, etapas, métricas, parados, rotas (401, 404, 409, 422), ferramentas,
   propostas (aprovar, recusar, obsoleta, erro, idempotência) e resumo; testes de front para utilitários;
   teste de ponta a ponta no navegador. Nenhuma chamada à Anthropic nos testes.
3. O módulo NÃO DEVE exigir novas variáveis de ambiente nem serviços pagos, e NÃO DEVE alterar os
   repositórios do Orion.
