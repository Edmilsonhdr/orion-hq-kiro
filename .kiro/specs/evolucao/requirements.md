# Requirements Document — Evolução do HQ (Ctrl+K, modelos, menu "/", design)

1. **Busca global (Ctrl+K).** `GET /api/busca?q=` DEVE devolver até 5 documentos, 5 negócios e 5 organizações
   (não arquivados) e exigir sessão; consulta vazia devolve listas vazias. A paleta abre com Ctrl+K/Cmd+K em
   qualquer tela, mostra resultados agrupados e atalhos ("Nova página", "Novo negócio", ir para cada área),
   navega por setas e Enter e fecha com Esc.
2. **Modelos de página.** `/docs/novo` DEVE oferecer modelos (ata de reunião, one-pager, retrospectiva, plano
   de lançamento, página em branco) que preenchem título e conteúdo; sem inventar dados.
3. **Menu "/" no editor.** Digitar "/" no começo de uma linha abre um menu de blocos (títulos, lista, tarefas,
   tabela, citação, código, linha) filtrável, que insere o markdown correspondente. Markdown segue como fonte
   da verdade; editor visual (WYSIWYG) fica fora do escopo.
4. **Design.** As telas Chat, Aprovações, Incidentes, Escritório e Login DEVEM ser revisadas com prints antes e
   depois (desktop e celular), usando os mesmos componentes e tokens do Docs/Comercial; sem rolagem horizontal
   no celular e com foco visível em todos os controles.
5. **Qualidade.** Testes pytest/front, teste de ponta a ponta no navegador, sem alterar os repositórios do Orion.
