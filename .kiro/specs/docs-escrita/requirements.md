# Requirements Document

## Introdução

Fase 2 do módulo Docs (`.kiro/specs/docs/`): o Tech e o Negócios passam a **propor** a criação e a edição
de documentos, a partir do chat (ex.: "registra em docs a ata da reunião de hoje"). Nada é gravado em
`documentos` sem a **aprovação humana** de um sócio aprovador, na tela de Aprovações que já existe.

Fora do escopo: busca semântica, importação de Notion/Confluence, exclusão de documentos por agentes.

## Requirements

### Requirement 1 — Propor sem gravar

**User Story:** Como Dimi, quero pedir no chat para os agentes registrarem um texto em Docs, sem risco de
eles alterarem meus documentos sozinhos.

#### Acceptance Criteria

1. O Tech e o Negócios DEVEM ter as ferramentas `propor_documento` e `propor_edicao_documento`.
2. Essas ferramentas NUNCA DEVEM alterar `documentos` nem `documento_versoes`; só registram uma aprovação
   `pendente` e emitem a atividade `aguardando_aprovacao`.
3. A resposta da ferramenta DEVE dizer que é só uma proposta aguardando aprovação, para o agente não
   afirmar que criou ou editou.
4. Valem os mesmos limites de título (200) e conteúdo (200.000) e a mesma normalização de tags e pasta dos
   Docs. Dado inválido DEVE voltar ao agente como texto de erro, sem criar aprovação.
5. Um mesmo run NÃO DEVE gerar mais de 3 propostas.
6. `propor_edicao_documento` DEVE recusar documento inexistente ou arquivado e pedido sem nenhuma mudança.

### Requirement 2 — Aprovação visível

**User Story:** Como sócio, quero ver o que o agente quer gravar antes de decidir.

#### Acceptance Criteria

1. A proposta DEVE aparecer em `/aprovacoes` (e no contador do cabeçalho) com tipo `criar_documento` ou
   `editar_documento`, `pedido_por` igual ao id do agente e o run de origem.
2. O card DEVE mostrar a ação (criar/editar), o título, a pasta, as tags e uma prévia do conteúdo
   (markdown renderizado de forma segura), e, na edição, o documento afetado.

### Requirement 3 — Decisão

**User Story:** Como aprovador, quero que aprovar aplique a mudança e recusar não faça nada.

#### Acceptance Criteria

1. SOMENTE aprovadores DEVEM decidir (regra já existente) e a decisão DEVE continuar atômica: a segunda
   decisão recebe `ja_decidida`.
2. Aprovar DEVE criar ou editar o documento. O documento criado DEVE ter como autor
   `<agente> (aprovado por <usuário>)`; uma edição DEVE gerar versão do jeito normal dos Docs.
3. Recusar NÃO DEVE gravar nada.
4. Em ambos os casos o Orquestrador DEVE avisar o resultado no chat (com o link `/docs/<id>` quando aplicado)
   e o agente DEVE emitir a atividade `concluiu`.
5. A decisão sobre uma proposta de documento NÃO DEVE retomar o grafo do LangGraph (o run de origem já
   terminou).

### Requirement 4 — Segurança contra edição desatualizada

**User Story:** Como sócio, não quero que uma aprovação antiga apague o que escrevi depois.

#### Acceptance Criteria

1. A proposta de edição DEVE guardar o `atualizado_em` do documento no momento da proposta.
2. SE ao aprovar o documento tiver mudado, estiver arquivado ou não existir mais, ENTÃO o sistema NÃO DEVE
   aplicar, DEVE marcar a aprovação como `obsoleta` e DEVE avisar no chat para pedir de novo.

### Requirement 5 — Falhas e repetição

#### Acceptance Criteria

1. SE aplicar falhar, ENTÃO a aprovação DEVE ir para `erro`, com aviso no chat, e "Tentar de novo" DEVE
   reaplicar sem duplicar o que já tinha sido aplicado.
2. O conteúdo dos documentos NÃO DEVE ir para o log de atividades (só título e ids).

### Requirement 6 — Qualidade

#### Acceptance Criteria

1. Testes pytest cobrindo propor (sem gravar), limites, aprovar/recusar, obsolescência, erro/retry,
   idempotência e o fluxo ponta a ponta com modelo simulado. Nenhuma chamada à Anthropic.
2. Nenhuma variável de ambiente nova e o fluxo de reuniões DEVE continuar igual.
