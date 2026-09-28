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
  status text not null default 'pendente', -- pendente | aprovada | recusada
  decidido_por text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);

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
