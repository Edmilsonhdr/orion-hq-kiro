# Design Document

## Overview

O módulo Docs é um CRUD simples sobre o Postgres existente, mais duas ferramentas de leitura para os
especialistas. Não há serviço novo, variável de ambiente nova nem dependência paga.

```
Navegador ──► /docs (Next.js) ──/api/documentos*──► FastAPI (api/index.py)
                                                        └── api/_orion/documentos.py ──► Postgres
                                                                 ▲   (documentos, documento_versoes)
Chat ──► supervisor ──► Tech / Negócios ──► buscar_documentos / ler_documento
                                             (ferramentas.py, reaproveita documentos.buscar/ler)
```

Siga as convenções existentes: módulos em `api/_orion/`, `db.consultar`/`db.um`/`db.executar`, conexão curta,
`atividades.emitir()` que nunca lança, Python compatível com 3.10 e 3.12, domínio em português,
comandos conforme `.kiro/steering/ambiente.md`.

## Banco (`db/schema.sql`, idempotente)

```sql
create table if not exists documentos (
  id bigserial primary key,
  titulo text not null,
  conteudo text not null default '',
  pasta text,
  tags text[] not null default '{}',
  autor text not null,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  busca tsvector generated always as (
    setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(conteudo, '')), 'B')
  ) stored
);
create index if not exists documentos_busca_idx on documentos using gin (busca);
create index if not exists documentos_atualizado_idx on documentos (atualizado_em desc);

create table if not exists documento_versoes (
  id bigserial primary key,
  documento_id bigint not null references documentos(id) on delete cascade,
  titulo text not null,
  conteudo text not null,
  editado_por text not null,
  criado_em timestamptz not null default now()
);
create index if not exists documento_versoes_doc_idx
  on documento_versoes (documento_id, criado_em desc);
```

`documento_versoes` guarda o estado **anterior** à edição. `ON DELETE CASCADE` só vale para uma limpeza
manual futura; a API não expõe exclusão (Requirement 3.4).

## Backend: `api/_orion/documentos.py`

| Função | Responsabilidade |
|---|---|
| `criar(titulo, conteudo, pasta, tags, autor)` | valida (Req. 1.2, 1.5), normaliza tags, insere |
| `editar(id, campos, editor)` | se título/conteúdo mudaram: grava versão anterior e atualiza, na mesma transação; poda para 50 versões |
| `obter(id)` | documento completo ou `None` |
| `listar(pasta, tag, arquivados)` | sem `conteudo`, com trecho de 200 caracteres |
| `buscar(consulta, arquivados=False)` | full-text → fallback `ILIKE`; trecho com `ts_headline` (full-text) ou recorte manual (ILIKE); limite 20 |
| `arquivar(id, valor)` | liga/desliga `arquivado` |
| `versoes(id)`, `versao(id, versao_id)`, `restaurar(id, versao_id, editor)` | histórico; restaurar reaproveita `editar` |

Validação em uma função `_validar` que levanta `ValueError` com mensagem em português; as rotas convertem em
422. Tags: `_normalizar_tags` (minúsculas, strip, únicas, ordem preservada, máx. 10). A edição e a gravação
da versão usam uma única transação (`with db.conexao() as conn`, ou o helper equivalente já existente em
`db.py`) para nunca perder a versão anterior.

`ts_headline('portuguese', conteudo, plainto_tsquery(...), 'MaxWords=30, MinWords=15')` gera o trecho; para
`ILIKE`, recorta ~200 caracteres ao redor da primeira ocorrência. Os trechos são texto puro (o front não os
interpreta como HTML).

### Rotas (`api/index.py`, todas com `Depends(auth.usuario_atual)`)

| Método e rota | Corpo/params | Resposta |
|---|---|---|
| `GET /api/documentos` | `q`, `pasta`, `tag`, `arquivados` | lista (com `q`, resultados de busca) |
| `POST /api/documentos` | `titulo`, `conteudo`, `pasta`, `tags` | documento criado (201) |
| `GET /api/documentos/{id}` | | documento completo ou 404 |
| `PUT /api/documentos/{id}` | campos opcionais | documento atualizado, 404/422 |
| `POST /api/documentos/{id}/arquivar` | `arquivado: bool` | documento |
| `GET /api/documentos/{id}/versoes` | | lista de versões (sem conteúdo) |
| `GET /api/documentos/{id}/versoes/{versao_id}` | | versão completa |
| `POST /api/documentos/{id}/versoes/{versao_id}/restaurar` | | documento atualizado |
| `GET /api/documentos/pastas` | | pastas e tags existentes (para os filtros) |

Modelos Pydantic no mesmo estilo dos de `index.py`. A rota `/pastas` deve ser declarada **antes** de
`/{id}`.

## Ferramentas dos agentes (`api/_orion/ferramentas.py`)

```python
@tool
def buscar_documentos(consulta: str) -> str: ...   # documentos.buscar + _formatar_documento
@tool
def ler_documento(documento_id: int) -> str: ...   # documentos.obter, trunca em 20.000 caracteres

FERRAMENTAS_TECH     = (buscar_changelog, mudancas_recentes, buscar_documentos, ler_documento)
FERRAMENTAS_NEGOCIOS = (buscar_changelog, mudancas_recentes, registrar_decisao,
                        buscar_documentos, ler_documento)
```

Mesmo padrão das tools atuais: lógica em `_buscar_documentos` / `_ler_documento` (testáveis sem
LangChain) e `@tool` finas por cima. Formato da citação: `[documento #12 · Pasta · 28/10/2026] Título` +
trecho. Mensagens explícitas para "nada encontrado", "id inexistente" e "documento arquivado".

`especialistas.py`: acrescentar nos prompts do Tech e do Negócios a instrução de consultar documentos e
changelog, citando o documento usado. O `no_agenda`/resumo semanal não muda.

## Front

| Arquivo | Responsabilidade |
|---|---|
| `app/(hq)/docs/page.tsx` | lista, busca (com debounce), filtros, "Novo documento" |
| `app/(hq)/docs/[id]/page.tsx` | leitura, edição, arquivar, histórico |
| `components/DocEditor.tsx` | textarea + pré-visualização, Salvar |
| `components/Markdown.tsx` | renderização segura de markdown |
| `components/Header.tsx` | item "Docs" |
| `lib/api.ts` | tipos e chamadas de documentos |

**Markdown seguro sem dependência nova:** `Markdown.tsx` implementa um renderizador mínimo próprio
(títulos, negrito, itálico, código, listas, links `http(s)`, parágrafos) que **escapa tudo** e gera elementos
React (nunca `dangerouslySetInnerHTML`), cumprindo o Requirement 5.4. Se depois quiserem tabelas e mais
recursos, trocar por `react-markdown` (sem HTML bruto) é uma mudança isolada nesse componente.

Estado de erro: o texto do editor fica em estado local e só é limpo após salvar com sucesso (Req. 5.6). Sem
polling: a lista recarrega ao entrar e depois de salvar/arquivar.

## Testes

- `tests/test_documentos.py`: criar/validar, tags, editar com versão, edição sem mudança, poda de 50,
  restaurar, arquivar/filtros, busca full-text com acento ("decisão"/"decisao"), fallback ILIKE, limite 20,
  consulta vazia.
- `tests/test_rotas_documentos.py`: 401 sem sessão em todas as rotas, 404, 422, fluxo completo.
- `tests/test_ferramentas.py` (ou `test_ferramentas_documentos.py`): formato da citação, nada encontrado,
  id inexistente, arquivado, truncamento, e que as tools estão em `FERRAMENTAS_TECH` e `FERRAMENTAS_NEGOCIOS`.
- Front: teste do renderizador de markdown (`node --test`, como `lib/rotina.test.ts`) cobrindo escape de HTML
  e links `javascript:` recusados.

## Fora do escopo (fases futuras)

- Escrita pelos agentes (`criar_documento`/`atualizar_documento`) passando pelo fluxo de aprovação.
- Busca semântica (`pgvector` + embeddings).
- Importação de exportações do Notion/Confluence.
- Anexos/imagens, comentários, edição simultânea e permissões por documento.
