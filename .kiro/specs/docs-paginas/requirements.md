# Requirements Document

## Introdução
Páginas dentro de páginas no Docs, no estilo do Notion. Hoje a hierarquia é só a `pasta` (texto livre). Esta
fase acrescenta uma **página pai** opcional: cada documento pode ter subpáginas, em até 6 níveis. A `pasta`
continua existindo (nada é migrado nem quebrado) e agentes, exportação e importação seguem funcionando.

## Requirements

### Requirement 1 — Página pai
1. Criar e editar um documento DEVE aceitar `pai_id` (opcional). `null` ou ausente = página de topo.
2. O pai DEVE existir e não estar arquivado; um documento NÃO DEVE ser pai de si mesmo nem de um de seus
   ancestrais (sem ciclos); a profundidade máxima é 6 níveis. Violação responde 422 em português.
3. Mudar só o pai NÃO DEVE criar versão no histórico.

### Requirement 2 — Árvore e navegação
1. `GET /api/documentos/{id}` DEVE trazer `ancestrais` (da raiz até o pai, com id e título) e `subpaginas`
   (filhas não arquivadas, mais antigas primeiro, com id, título e trecho).
2. `GET /api/documentos/arvore` DEVE listar os documentos não arquivados com id, título, pai_id e pasta, para
   montar a árvore e o seletor de pai.
3. A tela do documento DEVE mostrar migalhas com os ancestrais, a lista de subpáginas e o botão "Nova
   subpágina" (abre o novo documento já com o pai escolhido).
4. O editor DEVE ter o seletor "Página pai", sem oferecer o próprio documento nem seus descendentes.
5. A lista de Docs DEVE mostrar, em cada cartão, de qual página ele é subpágina.

### Requirement 3 — Arquivar
1. Arquivar uma página DEVE arquivar também suas subpáginas (na mesma transação). Desarquivar reabre só a
   página pedida.
2. Documentos arquivados continuam fora da árvore e das subpáginas.

### Requirement 4 — Agentes
1. `ler_documento` DEVE listar as subpáginas (id e título) ao fim do texto, para o agente poder abri-las.
2. As propostas dos agentes continuam sem `pai_id` (criam páginas de topo); o sócio move depois.

### Requirement 5 — Qualidade
1. Schema idempotente; testes pytest (regras, rotas, arquivar em cascata, ferramenta) e de front; teste de
   ponta a ponta; sem alterar os repositórios do Orion.
