# Implementation Plan
- [x] 1. Schema `pai_id` e regras em `documentos.py` (validação, ancestrais, subpáginas, árvore, arquivar em cascata) + testes
- [x] 2. Rotas (`pai_id` nos corpos, `/arvore`, detalhe com ancestrais e subpáginas) + testes
- [x] 3. `ler_documento` lista as subpáginas + teste
- [x] 4. Front: tipos, migalhas, subpáginas, "Nova subpágina", seletor de pai no editor, cartão na lista
- [x] 5. Verificação: pytest, front (41), tsc, ponta a ponta no navegador, README, commit
  - Limitação conhecida: exportação/importação não preservam subpáginas (só a pasta)
