// Testes dos utilitários do módulo Docs: `npm run test:front` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";

import { contarPalavras, opcoesPai, tagsDoTexto, tempoRelativo } from "./docs.ts";

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

test("opcoesPai em ordem de árvore, com recuo e sem o próprio documento nem os descendentes", () => {
  const arvore = [
    { id: 1, titulo: "Produto", pai_id: null, pasta: null },
    { id: 2, titulo: "Ideias", pai_id: 1, pasta: null },
    { id: 3, titulo: "Rascunhos", pai_id: 2, pasta: null },
    { id: 4, titulo: "Vendas", pai_id: null, pasta: null },
  ];
  assert.deepEqual(
    opcoesPai(arvore).map((o) => o.rotulo),
    ["Produto", "— Ideias", "— — Rascunhos", "Vendas"],
  );
  assert.deepEqual(opcoesPai(arvore, 2).map((o) => o.id), [1, 4]);
  // pai fora da árvore (arquivado) não some
  assert.deepEqual(opcoesPai([{ id: 9, titulo: "Órfã", pai_id: 77, pasta: null }]).map((o) => o.id), [9]);
});
