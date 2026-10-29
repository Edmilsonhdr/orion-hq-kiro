import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarLink, detectarLink, filtrarTitulos } from "./linkPagina.ts";

test("detecta link aberto antes do cursor", () => {
  assert.deepEqual(detectarLink("veja [[Gu", 9), { inicio: 5, consulta: "Gu" });
  assert.equal(detectarLink("veja [[Guia]] e", 15), null);
  assert.equal(detectarLink("sem link", 8), null);
  assert.deepEqual(detectarLink("[[", 2), { inicio: 0, consulta: "" });
});

test("filtra títulos sem acento e prioriza começo", () => {
  const p = [{ titulo: "Plano de vendas" }, { titulo: "Vendas 2026" }, { titulo: "Reunião" }];
  assert.deepEqual(filtrarTitulos(p, "vend").map((x) => x.titulo), ["Vendas 2026", "Plano de vendas"]);
  assert.deepEqual(filtrarTitulos(p, "reuniao").map((x) => x.titulo), ["Reunião"]);
});

test("aplica o link fechando os colchetes", () => {
  const link = { inicio: 5, consulta: "Gu" };
  assert.deepEqual(aplicarLink("veja [[Gu", link, 9, "Guia"), { valor: "veja [[Guia]]", cursor: 13 });
  assert.equal(aplicarLink("veja [[Gu]] fim", link, 9, "Guia").valor, "veja [[Guia]] fim");
});
