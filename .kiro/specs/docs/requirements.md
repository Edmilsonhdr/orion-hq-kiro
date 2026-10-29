# Requirements Document

## Introdução

Terceira entrega do Orion HQ: o módulo **Docs**, um espaço próprio de documentação e textos dos sócios
(Dimi e Jullyana), no lugar de ferramentas pagas como Notion e Confluence. Os documentos ficam no mesmo
Postgres do Orion HQ, são escritos em markdown e podem ser consultados pelos agentes: quando alguém
perguntar algo no chat, o Tobias (Tech) e o Negócios buscam nos documentos antes de responder.

Esta fase cobre **criar, editar, versionar, buscar e ler** documentos pela interface, e **leitura pelos
agentes**. A escrita de documentos pelos agentes (com aprovação humana) e a busca semântica por embeddings
ficam para fases futuras e estão fora do escopo aqui.

Pré-requisitos já existentes: a spec original em `.kiro/specs/orion-hq/`, o `changelog` com full-text
search em português, as tools dos especialistas em `api/_orion/ferramentas.py` e a navegação do `Header`.

## Requirements

### Requirement 1 — Criar e editar documentos

**User Story:** Como Dimi, quero escrever e editar documentos em markdown no próprio Orion HQ, para
guardar textos e documentação do projeto sem pagar por outra ferramenta.

#### Acceptance Criteria

1. O sistema DEVE permitir criar um documento com título (obrigatório), conteúdo em markdown (pode ser
   vazio), pasta (opcional) e tags (opcionais).
2. SE o título estiver vazio ou só com espaços, ENTÃO o sistema DEVE responder 422 e não criar nada.
3. O sistema DEVE registrar `autor` (quem criou), `criado_em` e `atualizado_em` a partir da sessão.
4. O sistema DEVE permitir editar título, conteúdo, pasta e tags, atualizando `atualizado_em`.
5. O título DEVE ter no máximo 200 caracteres e o conteúdo no máximo 200.000 caracteres; acima disso o
   sistema DEVE responder 422.
6. TODAS as rotas de documentos DEVEM exigir sessão válida e responder 401 sem ela.

### Requirement 2 — Histórico de versões

**User Story:** Como Jullyana, quero ver e restaurar versões anteriores de um documento, para não perder
texto por uma edição errada.

#### Acceptance Criteria

1. A cada edição que mude título ou conteúdo, o sistema DEVE guardar a versão anterior em
   `documento_versoes`, com quem editou e quando.
2. Edição que não muda nada (mesmo título e conteúdo) NÃO DEVE criar versão.
3. O sistema DEVE listar as versões de um documento, da mais recente para a mais antiga, e permitir ler o
   conteúdo de uma versão.
4. O sistema DEVE permitir restaurar uma versão; restaurar DEVE criar uma nova versão (guardando o
   conteúdo atual antes), sem apagar o histórico.
5. O sistema DEVE manter no máximo as 50 versões mais recentes por documento.

### Requirement 3 — Organização e arquivamento

**User Story:** Como sócio, quero organizar os documentos por pasta e tag e arquivar os que não uso mais,
para achar o que importa.

#### Acceptance Criteria

1. O sistema DEVE listar documentos do mais recentemente atualizado para o mais antigo, sem o conteúdo
   completo (título, pasta, tags, autor, datas e um trecho de até 200 caracteres).
2. A listagem DEVE aceitar filtros por pasta e por tag.
3. O sistema DEVE permitir arquivar e desarquivar um documento. Documentos arquivados NÃO DEVEM aparecer na
   listagem nem na busca por padrão, e DEVEM aparecer quando o filtro `arquivados` for pedido.
4. O sistema NÃO DEVE excluir documentos de forma definitiva nesta fase.
5. Tags DEVEM ser normalizadas (minúsculas, sem espaços nas pontas, sem repetidas, no máximo 10 por
   documento).

### Requirement 4 — Busca

**User Story:** Como Dimi, quero buscar por palavras nos documentos, para encontrar um texto sem lembrar
onde guardei.

#### Acceptance Criteria

1. O sistema DEVE buscar em título e conteúdo com full-text search em português (`tsvector` com config
   `portuguese`), com peso maior para o título, ordenando por relevância e, em empate, pelo mais recente.
2. SE o full-text não devolver nada, ENTÃO o sistema DEVE tentar `ILIKE` em título e conteúdo (siglas e
   nomes próprios).
3. Cada resultado DEVE trazer título, pasta, tags, data de atualização e um trecho do conteúdo ao redor do
   termo encontrado.
4. Consulta vazia NÃO DEVE buscar; DEVE devolver a listagem normal.
5. A busca DEVE devolver no máximo 20 resultados.

### Requirement 5 — Interface

**User Story:** Como sócio, quero uma tela de Docs simples e rápida, para escrever e ler sem atrito.

#### Acceptance Criteria

1. O `Header` DEVE ter o item "Docs" na navegação, levando a `/docs`.
2. A tela `/docs` DEVE listar documentos, ter campo de busca e filtros de pasta e tag, e botão
   "Novo documento".
3. A tela de um documento DEVE ter modo de leitura (markdown renderizado) e modo de edição (campo de texto
   com pré-visualização), com botão "Salvar" explícito.
4. O markdown renderizado NÃO DEVE executar HTML ou scripts embutidos: HTML bruto é exibido como texto.
5. A tela do documento DEVE mostrar autor, data da última atualização e acesso ao histórico de versões,
   com restauração.
6. Erros de API (422, 404, rede) DEVEM aparecer como mensagem em português, sem perder o texto digitado.
7. A interface DEVE estar em português do Brasil e seguir o visual das telas existentes.

### Requirement 6 — Agentes consultam os documentos

**User Story:** Como Dimi, quero que, ao perguntar algo no chat, os agentes busquem nos nossos documentos,
para as respostas usarem o que a gente já escreveu.

#### Acceptance Criteria

1. O Tech e o Negócios DEVEM ter as ferramentas `buscar_documentos(consulta)` e `ler_documento(id)`, ao
   lado das de changelog.
2. `buscar_documentos` DEVE usar a mesma busca do Requirement 4 e devolver texto citando título, pasta e
   data de atualização de cada resultado. SE nada for encontrado, DEVE dizer isso explicitamente.
3. `ler_documento` DEVE devolver o conteúdo do documento, truncado em 20.000 caracteres com aviso de
   truncamento, e dizer explicitamente quando o id não existir ou o documento estiver arquivado.
4. Os prompts dos especialistas DEVEM mandar consultar documentos e changelog antes de responder e citar o
   documento usado ("Nada inventado", `product.md`).
5. As ferramentas DEVEM ser somente leitura nesta fase: nenhum agente cria, edita ou arquiva documentos.
6. Cada uso das ferramentas DEVE gerar a atividade `ferramenta` já existente, para aparecer no escritório e
   no log.

### Requirement 7 — Qualidade e operação

**User Story:** Como desenvolvedor, quero que o módulo siga as convenções do projeto e seja seguro de
publicar.

#### Acceptance Criteria

1. O `db/schema.sql` DEVE continuar idempotente: rodar `scripts/setup_db.py` duas vezes não DEVE falhar.
2. O backend DEVE ter testes pytest para CRUD, versões, arquivamento, busca (incluindo fallback e
   acentos) e ferramentas dos agentes, usando o Postgres efêmero de `tests/conftest.py`.
3. O módulo NÃO DEVE exigir novas variáveis de ambiente nem serviços pagos.
4. O conteúdo dos documentos NÃO DEVE ser registrado em `atividades` (só título e id), para o log do
   escritório não vazar texto longo.
