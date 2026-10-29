# Design Document

## Decisão central

As ferramentas dos especialistas rodam dentro de um nó do grafo, então não conseguem pausar com
`interrupt()`. Em vez de mexer nesse mecanismo, a proposta é uma **aprovação independente** na tabela
`aprovacoes` (tipos `criar_documento` e `editar_documento`). `decidir_aprovacao` reconhece esses tipos,
aplica a mudança direto e avisa no chat, **sem retomar o grafo**. Reuniões continuam exatamente como estão.

```
Chat ─► Tech/Negócios ─► propor_documento ─► insert aprovacoes (pendente) + atividade aguardando_aprovacao
                                              │
Sócio aprovador ─► POST /api/aprovacoes/{id} ─► execucao.decidir_aprovacao
                                              ├─ tipo reunião ─► _retomar (grafo)           [inalterado]
                                              └─ tipo documento ─► propostas_docs.aplicar ─► documentos.criar/editar
                                                                    └─ mensagem do Orquestrador no chat
```

## Backend

`api/_orion/propostas_docs.py`:

| Função | Responsabilidade |
|---|---|
| `propor_criacao(agente, run_id, ...)` | valida (reusa `documentos.validar`), limita 3 por run, insere a aprovação |
| `propor_edicao(agente, run_id, documento_id, ...)` | idem, exige documento ativo e ao menos uma mudança, guarda `base_atualizado_em` |
| `aplicar(aprovacao, aprovador)` | `criar`/`editar`; devolve `("aplicada" \| "obsoleta", mensagem, documento_id)` |

Proposta (`aprovacoes.proposta`): criar = `{acao, titulo, conteudo, pasta, tags}`; editar =
`{acao, documento_id, documento_titulo, base_atualizado_em, campos:{...}}`. Depois de aplicar grava
`aplicado_documento_id` na própria proposta, o que torna o "Tentar de novo" idempotente.

Contexto do agente: `ferramentas.contexto` (`ContextVar`) recebe `(agente, run_id)` em
`especialistas.rodar_com_ferramentas`, porque as tools do LangChain não conhecem o run.

`execucao.py`: `decidir_aprovacao` e `retomar_aprovacao` passam a ler `tipo`, `proposta`, `pedido_por` e
desviam para `_decidir_documento` quando o tipo é de documento. Status novo: `obsoleta`.

## Front

`ApprovalCard.tsx` ganha `DetalhesDocumento` (ação, documento afetado, pasta, tags, prévia em `Markdown`
truncada) e o texto de status `obsoleta`.

## Fora do escopo

Busca semântica, importação do Notion, exclusão por agentes.
