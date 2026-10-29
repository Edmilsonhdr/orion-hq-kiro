# Design Document

## Overview

CRUD sobre o Postgres existente + ferramentas para o Negócios + interface própria. Segue as convenções do
Docs: módulos em `api/_orion/`, `db.consultar/um/executar`, validação por `ValueError` (rotas → 422),
conflito por `ConflitoError` (→ 409), aprovações independentes do grafo (mesmo desenho de
`propostas_docs.py`).

```
Navegador ──► /comercial (Hoje | Funil | Organizações), /comercial/negocios/[id], /comercial/organizacoes/[id]
                 └─ /api/comercial/* ──► api/_orion/comercial.py ──► Postgres
Chat ─► supervisor ─► Negócios (Bento) ─► ferramentas de leitura (comercial.py)
                                       └─► propor_* ─► aprovacoes (pendente) ─► sócio aprova
                                                         └─► propostas_comercial.aplicar ─► comercial.py
Cron semanal ─► resumo.resumo_semanal + resumo.resumo_comercial (texto determinístico)
```

## Banco (idempotente)

`organizacoes` (nome único entre ativas, sem diferenciar caixa), `contatos`, `negocios`, `interacoes`.
Etapas, tipos, áreas e pacotes são `text` validados em código (mesmo estilo do projeto). `negocios` guarda
`pacientes_ativos`, `plano_interesse` e `usa_hoje`. Valores em `numeric(12,2)`.

- `negocios.etapa_desde` marca a entrada na etapa; `atualizado_em` muda em qualquer edição/interação.
- `interacoes.tipo = 'etapa'` é reservado ao sistema (mudança de etapa) e não é excluível.
- "Parado" = `greatest(atualizado_em, última interação)` mais antigo que N dias, para negócios abertos.

## Backend

`texto.py` (novo): `sem_acento`, `radical`, `radicais`, `casa` — extraídos de `documentos.py` para a busca
do CRM reaproveitar. `documentos.py` passa a importá-los (comportamento idêntico, testes existentes).

`comercial.py`:

| Grupo | Funções |
|---|---|
| organizações | `criar_organizacao`, `editar_organizacao`, `obter_organizacao`, `listar_organizacoes`, `arquivar_organizacao`, `obter_ou_criar_organizacao(nome)` |
| contatos | `criar_contato`, `editar_contato`, `excluir_contato`, `contatos_da`, validação de e-mail |
| negócios | `criar_negocio`, `editar_negocio`, `mover_etapa`, `obter_negocio`, `listar_negocios`, `buscar_negocios` |
| interações | `registrar_interacao`, `listar_interacoes`, `excluir_interacao` |
| visões | `resumo_funil`, `hoje`, `parados`, `texto_resumo_semanal` |

Mover etapa, na mesma transação: valida (`perdido` exige motivo), atualiza `etapa`, `etapa_desde`,
`fechado_em`, `motivo_perda`, insere a interação `etapa` e `atualizado_em`.

Rotas `/api/comercial/...` (todas com `Depends(auth.usuario_atual)`):
`GET resumo`, `GET hoje`, `GET/POST negocios`, `GET/PUT negocios/{id}`, `POST negocios/{id}/etapa`,
`GET/POST negocios/{id}/interacoes`, `DELETE interacoes/{id}`, `GET/POST organizacoes`,
`GET/PUT organizacoes/{id}`, `POST organizacoes/{id}/arquivar`, `POST organizacoes/{id}/contatos`,
`PUT/DELETE contatos/{id}`. Rotas estáticas (`resumo`, `hoje`) vêm antes das dinâmicas.

## Agente (Negócios)

Ferramentas de leitura (`ferramentas.py`) sobre funções `_*` testáveis, no padrão de `buscar_documentos`.
Propostas em `propostas_comercial.py` (padrão de `propostas_docs.py`): `propor_novo_negocio`,
`propor_atualizacao_negocio`, `propor_interacao`, `descricao`, `aplicar`, com marcador de idempotência
`aplicado` na proposta. `execucao.py` troca o teste fixo de documentos por um registro de módulos de
proposta (`documentos` e `comercial`), reaproveitando `_decidir_documento` generalizado.

Supervisor e prompt do Negócios: texto atualizado (funil comercial, consulta ao Docs, sem dados de saúde).

## Front

| Arquivo | Responsabilidade |
|---|---|
| `lib/comercial.ts` | tipos, etapas, formatação de moeda/data, `situacaoPasso` (vencido/hoje/ok) |
| `components/Modal.tsx` | janela de diálogo acessível (foco, Esc, fundo) |
| `components/NegocioForm.tsx` | criar/editar negócio (org existente ou nova) |
| `components/Funil.tsx` | quadro com arrastar e soltar + seletor de etapa |
| `app/(hq)/comercial/page.tsx` | abas Hoje / Funil / Organizações e indicadores |
| `app/(hq)/comercial/negocios/[id]/page.tsx` | detalhe, histórico, interação, mover etapa |
| `app/(hq)/comercial/organizacoes/[id]/page.tsx` | dados, contatos, negócios |
| `components/ApprovalCard.tsx` | detalhes das propostas comerciais |
| `components/Header.tsx` | item Comercial + contador de vencidos |

## Biblioteca comercial

`docs/comercial/*.md` (modelos com `[preencher]`) e `scripts/seed_comercial_docs.py`, que usa o importador
(simulação por padrão, `--aplicar` grava, não duplica).

## Fora do escopo

Agente/personagem próprio, e-mail/WhatsApp, planilhas, metas, anexos, permissões.
