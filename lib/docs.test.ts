// Testes dos utilitários do módulo Docs: `npm run test:front` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";

import { contarPalavras, tagsDoTexto, tempoRelativo } from "./docs.ts";

const AGORA = new Date("2026-10-28T12:00:00-03:00");
const atras = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();

test("tempoRelativo cobre agora, minutos, horas, ontem, dias e data", () => {
  assert.equal(tempoRelativo(atras(10_000), AGORA), "agora há pouco");
  assert.equal(tempoRelativo(atras(5 * 60_000), AGORA), "há 5 min");
  assert.equal(tempoRelativo(atras(3 * 3_600_000), AGORA), "há 3 h");
  assert.equal(tempoRelativo(atras(26 * 3_600_000), AGORA), "ontem");
  assert.equal(tempoRelativo(atras(3 * 86_400_000), AGORA), "há 3 dias");
  assert.match(tempoRelativo(atras(30 * 86_400_000), AGORA), /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(tempoRelativo("lixo", AGORA), "");
});

test("contarPalavras", () => {
  assert.equal(contarPalavras(""), 0);
  assert.equal(contarPalavras("  "), 0);
  assert.equal(contarPalavras("um  dois\ntrês"), 3);
});

test("tagsDoTexto normaliza, remove vazias e repetidas", () => {
  assert.deepEqual(tagsDoTexto("API, mvp ,api,, Preço"), ["api", "mvp", "preço"]);
  assert.deepEqual(tagsDoTexto(""), []);
});
