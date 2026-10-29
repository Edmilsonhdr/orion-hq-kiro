import { test } from "node:test";
import assert from "node:assert/strict";
import { moverLocal, porColuna, posicaoAntesDe, situacaoPrazo, type ColunaTarefa, type Tarefa } from "./tarefas.ts";

const COLUNAS: ColunaTarefa[] = [
  { chave: "a_fazer", nome: "A fazer", ordem: 0, concluida: false },
  { chave: "fazendo", nome: "Fazendo", ordem: 1, concluida: false },
  { chave: "em_revisao", nome: "Em revisão", ordem: 2, concluida: false },
  { chave: "feito", nome: "Feito", ordem: 3, concluida: true },
];
const col = (chave: string) => COLUNAS.find((c) => c.chave === chave) as ColunaTarefa;

const t = (id: number, status: string, ordem: number, responsavel = "dimi", prazo: string | null = null): Tarefa => ({
  id, titulo: `T${id}`, descricao: null, status, prioridade: "normal", responsavel, criado_por: "dimi", prazo,
  ordem, criado_em: "", atualizado_em: "", concluida_em: null, documento_id: null, negocio_id: null,
  documento_titulo: null, negocio_titulo: null, organizacao_nome: null, coluna_concluida: status === "feito",
});

test("situação do prazo", () => {
  const base = { coluna_concluida: false };
  assert.equal(situacaoPrazo({ prazo: "2026-10-28", ...base }, "2026-10-29"), "vencida");
  assert.equal(situacaoPrazo({ prazo: "2026-10-29", ...base }, "2026-10-29"), "hoje");
  assert.equal(situacaoPrazo({ prazo: "2026-10-31", ...base }, "2026-10-29"), "proxima");
  assert.equal(situacaoPrazo({ prazo: "2026-11-30", ...base }, "2026-10-29"), "ok");
  assert.equal(situacaoPrazo({ prazo: "2020-01-01", coluna_concluida: true }, "2026-10-29"), null);
  assert.equal(situacaoPrazo({ prazo: null, ...base }, "2026-10-29"), null);
});

test("porColuna respeita a ordem manual, inclui colunas vazias e acolhe status desconhecido", () => {
  const c = porColuna([t(1, "a_fazer", 2), t(2, "a_fazer", 0), t(3, "feito", 0), t(4, "coluna_apagada", 5)], COLUNAS);
  assert.deepEqual(c.a_fazer.map((x) => x.id), [2, 1, 4]);
  assert.deepEqual(c.feito.map((x) => x.id), [3]);
  assert.deepEqual(c.em_revisao, []);
});

test("moverLocal muda de coluna, insere na posição e marca a conclusão", () => {
  const base = [t(1, "a_fazer", 0), t(2, "a_fazer", 1), t(3, "fazendo", 0)];
  const c = porColuna(moverLocal(base, 1, col("fazendo"), 0), COLUNAS);
  assert.deepEqual(c.fazendo.map((x) => x.id), [1, 3]);
  assert.deepEqual(c.a_fazer.map((x) => x.id), [2]);
  assert.deepEqual(porColuna(moverLocal(base, 1, col("fazendo")), COLUNAS).fazendo.map((x) => x.id), [3, 1]);
  const feita = moverLocal(base, 1, col("feito")).find((x) => x.id === 1);
  assert.ok(feita?.concluida_em && feita.coluna_concluida);
  const reaberta = moverLocal([{ ...base[0], status: "feito", concluida_em: "x", coluna_concluida: true }], 1, col("em_revisao"))[0];
  assert.equal(reaberta.concluida_em, null);
  assert.equal(reaberta.coluna_concluida, false);
});

test("posicaoAntesDe só vale entre tarefas da mesma pessoa", () => {
  const l = [t(1, "a_fazer", 0), t(2, "fazendo", 0), t(3, "fazendo", 1), t(4, "fazendo", 2, "rayssa")];
  assert.equal(posicaoAntesDe(l, 1, 3), 1);
  assert.equal(posicaoAntesDe(l, 1, 2), 0);
  assert.equal(posicaoAntesDe(l, 1, 4), undefined);
  assert.equal(posicaoAntesDe(l, 3, 2), 0);
});
