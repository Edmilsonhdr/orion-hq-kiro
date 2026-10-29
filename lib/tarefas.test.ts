import { test } from "node:test";
import assert from "node:assert/strict";
import { moverLocal, porColuna, posicaoAntesDe, situacaoPrazo, type Tarefa } from "./tarefas.ts";

const t = (id: number, status: Tarefa["status"], ordem: number, responsavel = "dimi", prazo: string | null = null): Tarefa => ({
  id, titulo: `T${id}`, descricao: null, status, prioridade: "normal", responsavel, criado_por: "dimi", prazo,
  ordem, criado_em: "", atualizado_em: "", concluida_em: null,
});

test("situação do prazo", () => {
  assert.equal(situacaoPrazo({ prazo: "2026-10-28", status: "a_fazer" }, "2026-10-29"), "vencida");
  assert.equal(situacaoPrazo({ prazo: "2026-10-29", status: "fazendo" }, "2026-10-29"), "hoje");
  assert.equal(situacaoPrazo({ prazo: "2026-10-31", status: "a_fazer" }, "2026-10-29"), "proxima");
  assert.equal(situacaoPrazo({ prazo: "2026-11-30", status: "a_fazer" }, "2026-10-29"), "ok");
  assert.equal(situacaoPrazo({ prazo: "2020-01-01", status: "feito" }, "2026-10-29"), null);
  assert.equal(situacaoPrazo({ prazo: null, status: "a_fazer" }, "2026-10-29"), null);
});

test("porColuna respeita a ordem manual", () => {
  const c = porColuna([t(1, "a_fazer", 2), t(2, "a_fazer", 0), t(3, "feito", 0)]);
  assert.deepEqual(c.a_fazer.map((x) => x.id), [2, 1]);
  assert.deepEqual(c.feito.map((x) => x.id), [3]);
});

test("moverLocal muda de coluna, insere na posição e marca a conclusão", () => {
  const base = [t(1, "a_fazer", 0), t(2, "a_fazer", 1), t(3, "fazendo", 0)];
  const r = moverLocal(base, 1, "fazendo", 0);
  const c = porColuna(r);
  assert.deepEqual(c.fazendo.map((x) => x.id), [1, 3]);
  assert.deepEqual(c.a_fazer.map((x) => x.id), [2]);
  const fim = moverLocal(base, 1, "fazendo");
  assert.deepEqual(porColuna(fim).fazendo.map((x) => x.id), [3, 1]);
  const feita = moverLocal(base, 1, "feito").find((x) => x.id === 1);
  assert.ok(feita?.concluida_em);
  assert.equal(moverLocal([{ ...base[0], status: "feito", concluida_em: "x" }], 1, "fazendo")[0].concluida_em, null);
});

test("posicaoAntesDe só vale entre tarefas da mesma pessoa", () => {
  const l = [t(1, "a_fazer", 0), t(2, "fazendo", 0), t(3, "fazendo", 1), t(4, "fazendo", 2, "rayssa")];
  assert.equal(posicaoAntesDe(l, 1, 3), 1);
  assert.equal(posicaoAntesDe(l, 1, 2), 0);
  assert.equal(posicaoAntesDe(l, 1, 4), undefined);
  assert.equal(posicaoAntesDe(l, 3, 2), 0);
});
