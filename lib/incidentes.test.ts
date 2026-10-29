import { test } from "node:test";
import assert from "node:assert/strict";
import { incidentesPorDia } from "./incidentes.ts";

test("conta incidentes por dia na janela e ignora o que está fora", () => {
  const agora = new Date(2026, 9, 29, 15, 0);
  const l = [
    { primeira_vez: new Date(2026, 9, 29, 9, 0).toISOString() },
    { primeira_vez: new Date(2026, 9, 29, 11, 0).toISOString() },
    { primeira_vez: new Date(2026, 9, 27, 8, 0).toISOString() },
    { primeira_vez: new Date(2026, 8, 1, 8, 0).toISOString() },
    { primeira_vez: "inválida" },
  ];
  const r = incidentesPorDia(l, 7, agora);
  assert.equal(r.length, 7);
  assert.equal(r[6].rotulo, "29/10");
  assert.equal(r[6].total, 2);
  assert.equal(r[4].total, 1);
  assert.equal(r.reduce((s, p) => s + p.total, 0), 3);
});
