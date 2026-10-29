import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ETAPAS,
  ETAPAS_ABERTAS,
  formatarDia,
  formatarReais,
  hojeISO,
  numeroOuNulo,
  porcentagem,
  situacaoPasso,
} from "./comercial.ts";

test("etapas na ordem do funil, com cinco abertas", () => {
  assert.deepEqual([...ETAPAS_ABERTAS], ["lead", "contato", "demonstracao", "piloto", "proposta"]);
  assert.equal(ETAPAS.at(-1), "perdido");
});

test("formata reais e dias sem depender do fuso", () => {
  assert.match(formatarReais(1490.5).replace(/\s/g, " "), /^R\$ 1\.490,50$/);
  assert.equal(formatarReais(null), "—");
  assert.equal(formatarDia("2026-11-05"), "05/11/2026");
  assert.equal(formatarDia("2026-11-05T02:00:00+00:00"), "05/11/2026");
  assert.equal(formatarDia(null), "—");
});

test("hojeISO usa o fuso de São Paulo", () => {
  // 02:00 UTC de 06/11 ainda é 05/11 em São Paulo (UTC-3).
  assert.equal(hojeISO(new Date("2026-11-06T02:00:00Z")), "2026-11-05");
});

test("situação do próximo passo", () => {
  assert.equal(situacaoPasso("2026-11-04", "2026-11-05"), "vencido");
  assert.equal(situacaoPasso("2026-11-05", "2026-11-05"), "hoje");
  assert.equal(situacaoPasso("2026-11-06", "2026-11-05"), "ok");
  assert.equal(situacaoPasso(null, "2026-11-05"), "sem");
});

test("porcentagem e números do formulário", () => {
  assert.equal(porcentagem(0.5), "50%");
  assert.equal(porcentagem(null), "—");
  assert.equal(numeroOuNulo(" 12,5 "), 12.5);
  assert.equal(numeroOuNulo(""), null);
  assert.ok(Number.isNaN(numeroOuNulo("abc")));
});
