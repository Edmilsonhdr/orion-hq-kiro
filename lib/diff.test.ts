import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLinhas, resumoDiff, DIFF_MAX_LINHAS } from "./diff.ts";

test("textos iguais não têm mudanças", () => {
  const d = diffLinhas("a\nb", "a\nb")!;
  assert.deepEqual(resumoDiff(d), { adicionadas: 0, removidas: 0 });
});

test("detecta linha trocada, adicionada e removida", () => {
  const d = diffLinhas("um\ndois\ntres", "um\nDOIS\ntres\nquatro")!;
  assert.deepEqual(resumoDiff(d), { adicionadas: 2, removidas: 1 });
  assert.deepEqual(d.filter((l) => l.tipo === "removida").map((l) => l.texto), ["dois"]);
});

test("documento enorme devolve null", () => {
  const grande = Array.from({ length: DIFF_MAX_LINHAS + 1 }, (_, i) => String(i)).join("\n");
  assert.equal(diffLinhas(grande, "x"), null);
});
