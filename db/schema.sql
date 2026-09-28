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
  status text not null default 'pendente', -- pendente | aprovada | recusada | erro
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
