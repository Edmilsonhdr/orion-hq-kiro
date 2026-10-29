# Implementation Plan

- [x] 1. `documentos.validar` público e status `obsoleta` documentado no schema
  - _Requirements: 1.4_
- [x] 2. `propostas_docs.py`: `propor_criacao`, `propor_edicao`, `aplicar` + testes
  - _Requirements: 1.2, 1.4, 1.5, 1.6, 4.1, 4.2, 5.1_
- [x] 3. Ferramentas `propor_documento` / `propor_edicao_documento`, `ContextVar`, prompts + testes
  - _Requirements: 1.1, 1.3, 5.2_
- [x] 4. `execucao`: desvio por tipo em `decidir_aprovacao` / `retomar_aprovacao` + testes
  - _Requirements: 3.1–3.5, 4.2, 5.1_
- [x] 5. Front: `ApprovalCard` com documentos
  - _Requirements: 2.1, 2.2_
- [x] 6. Teste ponta a ponta com modelo simulado, README e verificação
  - _Requirements: 6.1, 6.2_

> Verificado: 371 testes pytest, `tsc` e fluxo ao vivo (proposta → fila → aprovação → documento + aviso no chat).
> PENDENTE (manual): ver o card no navegador e pedir no chat, com a chave real da Anthropic, para registrar um texto em Docs.
