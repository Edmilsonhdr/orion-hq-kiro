import { test } from "node:test";
import assert from "node:assert/strict";
import { achatar, destinoDoArrasto, montarArvore } from "./arvore.ts";

const nos = [
  { id: 1, titulo: "A", pai_id: null, pasta: null },
  { id: 2, titulo: "B", pai_id: null, pasta: null },
  { id: 3, titulo: "A1", pai_id: 1, pasta: null },
  { id: 4, titulo: "A2", pai_id: 1, pasta: null },
  { id: 5, titulo: "A1x", pai_id: 3, pasta: null },
];

test("monta a hierarquia e achata só as pastas abertas", () => {
  const arv = montarArvore(nos);
  assert.deepEqual(arv.map((n) => n.titulo), ["A", "B"]);
  assert.deepEqual(achatar(arv, new Set()).map((n) => n.titulo), ["A", "B"]);
  assert.deepEqual(achatar(arv, new Set([1])).map((n) => [n.titulo, n.nivel]), [["A", 0], ["A1", 1], ["A2", 1], ["B", 0]]);
});

test("destino: antes, depois e dentro", () => {
  assert.deepEqual(destinoDoArrasto(nos, 2, 1, "antes"), { pai_id: null, posicao: 0 });
  assert.deepEqual(destinoDoArrasto(nos, 1, 2, "depois"), { pai_id: null, posicao: 1 });
  assert.deepEqual(destinoDoArrasto(nos, 2, 1, "dentro"), { pai_id: 1, posicao: 2 });
  assert.deepEqual(destinoDoArrasto(nos, 4, 3, "antes"), { pai_id: 1, posicao: 0 });
  assert.deepEqual(destinoDoArrasto(nos, 4, 3, "depois"), { pai_id: 1, posicao: 1 });
});

test("recusa soltar em si mesma ou numa descendente", () => {
  assert.equal(destinoDoArrasto(nos, 1, 1, "dentro"), null);
  assert.equal(destinoDoArrasto(nos, 1, 5, "dentro"), null);
  assert.equal(destinoDoArrasto(nos, 1, 3, "antes"), null);
});
