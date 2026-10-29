import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCOS, detectarBarra, filtrarBlocos, inserirBloco } from "./blocos.ts";

test("detecta '/' no começo da linha e ignora no meio do texto", () => {
  assert.deepEqual(detectarBarra("/", 1), { inicio: 0, consulta: "" });
  assert.deepEqual(detectarBarra("texto\n/tab", 10), { inicio: 6, consulta: "tab" });
  assert.deepEqual(detectarBarra("  /ti", 5), { inicio: 2, consulta: "ti" });
  assert.equal(detectarBarra("a / b", 5), null);
  assert.equal(detectarBarra("https://x", 9), null);
  assert.equal(detectarBarra("/tabela abc", 11), null);
});

test("filtra por rótulo ou palavra-chave, sem acento", () => {
  assert.equal(filtrarBlocos("").length, BLOCOS.length);
  assert.ok(filtrarBlocos("citaç").some((b) => b.id === "citacao"));
  assert.deepEqual(filtrarBlocos("todo").map((b) => b.id), ["tarefas"]);
  assert.deepEqual(filtrarBlocos("zzz"), []);
});

test("insere o bloco no lugar do '/consulta' e posiciona o cursor", () => {
  const tabela = BLOCOS.find((b) => b.id === "tabela")!;
  const r = inserirBloco("antes\n/tab\ndepois", { inicio: 6, consulta: "tab" }, 10, tabela);
  assert.equal(r.valor, `antes\n${tabela.markdown}\ndepois`);
  assert.equal(r.cursor, 6 + tabela.markdown.length);
});
