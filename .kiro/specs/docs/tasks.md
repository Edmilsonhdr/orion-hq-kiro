# Implementation Plan

- [x] 1. Banco
  - Adicionar `documentos`, `documento_versoes` e os índices ao `db/schema.sql` (idempotente) e validar o
    `setup_db.py` duas vezes no pgserver
  - _Requirements: 4.1, 7.1_

- [x] 2. Backend de documentos
- [x] 2.1 `api/_orion/documentos.py`: `_validar`, `_normalizar_tags`, `criar`, `obter`, `listar`, `arquivar`
  - Testes: título vazio/longo, conteúdo acima do limite, tags normalizadas, listagem sem conteúdo com
    trecho, arquivados fora da listagem por padrão
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 3.1, 3.2, 3.3, 3.5_
- [x] 2.2 `editar` com versionamento, poda de 50 e `restaurar`
  - Testes: edição grava versão anterior; edição sem mudança não grava; restaurar cria nova versão; poda
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_
- [x] 2.3 `buscar`: full-text ponderado, fallback `ILIKE`, trecho, limite de 20
  - Testes: relevância (título pesa mais), acentos, fallback para sigla, consulta vazia, limite
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3. API
  - Rotas `/api/documentos*` em `api/index.py` com modelos Pydantic (declarar `/pastas` antes de `/{id}`)
  - Testes: 401 sem sessão em todas, 404, 422, fluxo criar → editar → versões → restaurar → arquivar
  - _Requirements: 1.6, 2.3, 3.3, 3.4_

- [x] 4. Agentes leem os documentos
- [x] 4.1 `buscar_documentos` e `ler_documento` em `ferramentas.py`, nos conjuntos Tech e Negócios
  - Testes: citação com título/pasta/data, nada encontrado, id inexistente, arquivado, truncamento
  - _Requirements: 6.1, 6.2, 6.3, 6.5_
- [x] 4.2 Prompts do Tech e do Negócios consultam documentos e citam a fonte; atividade `ferramenta` sem o
  conteúdo do documento
  - Teste: com modelo simulado, pergunta sobre assunto de um documento passa por `buscar_documentos`
  - _Requirements: 6.4, 6.6, 7.4_

- [x] 5. Front
- [x] 5.1 `components/Markdown.tsx` seguro (sem `dangerouslySetInnerHTML`) + teste com `node --test`
  - Testes: HTML bruto escapado, link `javascript:` recusado, listas/títulos/código
  - _Requirements: 5.4_
- [x] 5.2 `lib/api.ts` (tipos e chamadas) e item "Docs" no `Header`
  - _Requirements: 5.1_
- [x] 5.3 `app/(hq)/docs/page.tsx`: lista, busca com debounce, filtros de pasta/tag, "Novo documento"
  - _Requirements: 5.2, 5.7_
- [x] 5.4 `app/(hq)/docs/[id]/page.tsx` e `DocEditor`: leitura, edição com pré-visualização, Salvar,
  arquivar, histórico e restauração, erros em português sem perder o texto
  - _Requirements: 5.3, 5.5, 5.6, 5.7_

- [x] 6. Documentação e verificação final
  - README: seção do módulo Docs; `.kiro/steering/structure.md` com os arquivos novos
  - `pytest` completo (347), `npm run test:front` (26) e `tsc --noEmit` passando; fluxo da API testado
    pelo proxy do Next (criar, editar, versões, busca, 401); páginas `/docs`, `/docs/novo` e `/docs/1` → 200
  - [ ] PENDENTE (manual): `npm run build` com o servidor de dev parado, teste visual no navegador
    (criar, editar, buscar, restaurar versão) e perguntar no chat, com a chave real da Anthropic, sobre o
    conteúdo de um documento
  - _Requirements: 7.1, 7.2, 7.3_
