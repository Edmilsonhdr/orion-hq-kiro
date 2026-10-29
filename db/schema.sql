-- Orion HQ — schema do domínio (Postgres / Neon)
--
-- Tudo idempotente (create ... if not exists) para poder rodar o setup várias vezes.
-- Domínio em português; full-text search com config `portuguese` (tsvector).
-- As tabelas do checkpointer do LangGraph são criadas por PostgresSaver.setup()
-- no scripts/setup_db.py, não aqui.

-- Chat do grupo: perguntas dos sócios e respostas do Orquestrador.
create table if not exists mensagens (
  id bigserial primary key,
  autor text not null,
  texto text not null,
  run_id text,
  criado_em timestamptz not null default now()
);

-- Atividades: cada passo de cada agente (observabilidade do escritório/log).
create table if not exists atividades (
  id bigserial primary key,
  run_id text,
  agente text not null,
  tipo text not null,
  detalhe text,
  dados jsonb,
  tokens integer not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists atividades_criado_idx on atividades (criado_em);

-- Changelog: memória do projeto (PRs do GitHub, notas, resumos).
-- `busca` é um tsvector gerado a partir de titulo + resumo, config portuguese.
create table if not exists changelog (
  id bigserial primary key,
  fonte text not null,
  referencia text,
  titulo text not null,
  resumo text not null,
  url text,
  autor text,
  criado_em timestamptz not null default now(),
  busca tsvector generated always as (
    to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(resumo, ''))
  ) stored
);
create index if not exists changelog_busca_idx on changelog using gin (busca);
-- Upsert de PR: um mesmo (fonte, referencia) não gera duas entradas.
create unique index if not exists changelog_ref_idx
  on changelog (fonte, referencia) where referencia is not null;

-- Aprovações: fila de ações que esperam decisão humana.
create table if not exists aprovacoes (
  id bigserial primary key,
  run_id text not null,
  chave text not null unique,              -- run_id:passo (idempotência do nó de aprovação)
  tipo text not null,
  proposta jsonb not null,
  pedido_por text,
  status text not null default 'pendente', -- pendente | aprovada | recusada | erro | obsoleta
  decidido_por text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
-- Decisão gravada (true = aprovar), para retomar o run se a retomada falhar
-- (status 'erro').
alter table aprovacoes add column if not exists aprovado boolean;

-- Reuniões: criadas somente após aprovação humana.
create table if not exists reunioes (
  id bigserial primary key,
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  participantes text[] not null default '{}',
  pauta text[] not null default '{}',
  criado_por text,
  run_id text,
  criado_em timestamptz not null default now()
);
-- Mesma chave da aprovação (run_id:passo): retomar o run não duplica a reunião.
alter table reunioes add column if not exists chave text;
create unique index if not exists reunioes_chave_idx on reunioes (chave);
-- Incidentes: erros de produção do Orion detectados pelo Vigia (Rui) via Sentry.
-- Deduplicados por sentry_issue_id; o diagnóstico do Rui fica em `diagnostico`.
create table if not exists incidentes (
  id                      bigserial primary key,
  sentry_issue_id         text not null unique,
  projeto                 text not null,            -- app | backend | desconhecido
  titulo                  text not null,
  nivel                   text,                     -- error | fatal | warning
  culpado                 text,
  release                 text,
  ambiente                text,
  url                     text,
  stack                   jsonb,                    -- frames já filtrados pela whitelist
  ocorrencias             integer not null default 1,
  usuarios_afetados       integer not null default 0,
  primeira_vez            timestamptz not null default now(),
  ultima_vez              timestamptz not null default now(),
  status                  text not null default 'aberto',  -- aberto | diagnosticado | resolvido | ignorado
  diagnostico             jsonb,
  diagnostico_iniciado_em timestamptz,
  diagnosticado_em        timestamptz,
  criado_em               timestamptz not null default now()
);
create index if not exists incidentes_status_idx on incidentes (status);

-- Docs: documentação e textos dos sócios, em markdown. `busca` pondera o título (A) acima do
-- conteúdo (B), config portuguese. `documento_versoes` guarda o estado ANTERIOR a cada edição.
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

-- Comercial: CRM leve (spec `.kiro/specs/comercial`). Só dados COMERCIAIS, nunca dados de saúde.
-- Tipos, áreas, etapas e pacotes são text validados em código.
create table if not exists organizacoes (
  id bigserial primary key,
  nome text not null,
  tipo text not null default 'clinica',   -- clinica | autonomo | empresa | outro
  area text,                              -- nutricao | educacao_fisica | ambas | outra
  cidade text,
  site text,
  observacoes text,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists organizacoes_nome_ativa_idx
  on organizacoes (lower(nome)) where not arquivada;

create table if not exists contatos (
  id bigserial primary key,
  organizacao_id bigint not null references organizacoes(id) on delete cascade,
  nome text not null,
  cargo text,
  email text,
  telefone text,
  criado_em timestamptz not null default now()
);
create index if not exists contatos_org_idx on contatos (organizacao_id);

create table if not exists negocios (
  id bigserial primary key,
  organizacao_id bigint not null references organizacoes(id),
  titulo text not null,
  etapa text not null default 'lead',     -- lead|contato|demonstracao|piloto|proposta|ganho|perdido
  valor_mensal numeric(12,2),
  pacientes_ativos integer,
  plano_interesse text,                   -- essencial | completo
  usa_hoje text,
  origem text,
  responsavel text not null,
  proximo_passo text,
  proximo_passo_em date,
  etapa_desde timestamptz not null default now(),
  fechado_em timestamptz,
  motivo_perda text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists negocios_etapa_idx on negocios (etapa);
create index if not exists negocios_org_idx on negocios (organizacao_id);

create table if not exists interacoes (
  id bigserial primary key,
  negocio_id bigint not null references negocios(id) on delete cascade,
  tipo text not null,                     -- ligacao|reuniao|email|whatsapp|nota|etapa (etapa é do sistema)
  resumo text not null,
  ocorrida_em timestamptz not null default now(),
  autor text not null,
  criado_em timestamptz not null default now()
);
create index if not exists interacoes_negocio_idx on interacoes (negocio_id, ocorrida_em desc);

-- Docs: página pai (subpáginas). Nulo = página de topo; o pai nunca é apagado (só arquivado).
alter table documentos add column if not exists pai_id bigint references documentos(id) on delete set null;
create index if not exists documentos_pai_idx on documentos (pai_id);

-- Presença: quem está com o HQ aberto (heartbeat do front a cada ~30 s).
create table if not exists presenca (
  usuario text primary key,
  visto_em timestamptz not null default now()
);

-- Login: tentativas falhas recentes por usuário (limite de tentativas contra adivinhação de senha).
create table if not exists login_tentativas (
  id bigserial primary key,
  usuario text not null,
  criado_em timestamptz not null default now()
);
create index if not exists login_tentativas_idx on login_tentativas (usuario, criado_em);

-- Docs: ordem manual das subpáginas (menor primeiro) e comentários com menção (@usuario).
alter table documentos add column if not exists ordem integer not null default 0;

create table if not exists documento_comentarios (
  id bigserial primary key,
  documento_id bigint not null references documentos(id) on delete cascade,
  autor text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);
create index if not exists documento_comentarios_doc_idx on documento_comentarios (documento_id, criado_em);

-- Chat: várias conversas. Mensagens sem conversa (conversa_id nulo) pertencem à conversa "Geral".
create table if not exists conversas (
  id bigserial primary key,
  titulo text not null,
  criado_por text not null,
  criado_em timestamptz not null default now(),
  arquivada boolean not null default false
);
alter table mensagens add column if not exists conversa_id bigint references conversas(id) on delete set null;
create index if not exists mensagens_conversa_idx on mensagens (conversa_id, id);

-- Comercial: checklist do piloto (itens por negócio) e anexos (arquivos guardados no próprio banco).
create table if not exists piloto_itens (
  id bigserial primary key,
  negocio_id bigint not null references negocios(id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  feito_por text,
  feito_em timestamptz,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists piloto_itens_negocio_idx on piloto_itens (negocio_id, ordem, id);

create table if not exists anexos (
  id bigserial primary key,
  entidade text not null,                 -- documento | negocio
  entidade_id bigint not null,
  nome text not null,
  tipo text not null,                     -- tipo MIME
  tamanho integer not null,
  conteudo bytea not null,
  autor text not null,
  criado_em timestamptz not null default now()
);
create index if not exists anexos_entidade_idx on anexos (entidade, entidade_id, id);

-- Tarefas: quadro Kanban por pessoa (cada sócia tem o seu, e dá para ver o de todas).
create table if not exists tarefas (
  id bigserial primary key,
  titulo text not null,
  descricao text,
  status text not null default 'a_fazer',      -- a_fazer | fazendo | bloqueada | feito
  prioridade text not null default 'normal',   -- baixa | normal | alta
  responsavel text not null,
  criado_por text not null,
  prazo date,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index if not exists tarefas_quadro_idx on tarefas (responsavel, status, ordem);
