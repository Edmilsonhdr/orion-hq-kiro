import { test } from "node:test";
import assert from "node:assert/strict";
import { modelos } from "./modelos.ts";

test("modelos: ids únicos, em branco vazio e data aplicada", () => {
  const lista = modelos("05/11/2026");
  assert.equal(new Set(lista.map((m) => m.id)).size, lista.length);
  const branco = lista.find((m) => m.id === "branco")!;
  assert.equal(branco.titulo, "");
  assert.equal(branco.conteudo, "");
  assert.equal(lista.find((m) => m.id === "ata")!.titulo, "Reunião de 05/11/2026");
  assert.ok(lista.every((m) => !/R\$|\d{2,}%/.test(m.conteudo)), "sem números inventados");
});
