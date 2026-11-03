// Testes dos helpers do calendário: `npm run test:front` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";

import { agruparPorDia, atrasado, deslocar, diasVisiveis, filtrar, inicioDaSemana, somarDias, tituloPeriodo, type ItemCal, type TipoItem } from "./calendario.ts";

const item = (o: Partial<ItemCal>): ItemCal => ({
  tipo: "tarefa", id: 1, titulo: "t", data: "2026-11-04", hora: null, detalhe: null, responsavel: "dimi", feito: false, href: "/tarefas", ics: null, ...o,
});

test("somar dias atravessa mês e ano", () => {
  assert.equal(somarDias("2026-11-30", 1), "2026-12-01");
  assert.equal(somarDias("2026-01-01", -1), "2025-12-31");
});

test("a semana começa no domingo", () => {
  assert.equal(inicioDaSemana("2026-11-03"), "2026-11-01"); // 03/11/2026 é terça
  assert.equal(inicioDaSemana("2026-11-01"), "2026-11-01");
});

test("o mês é completado até fechar as semanas", () => {
  const dias = diasVisiveis("2026-11-15", "mes");
  assert.equal(dias[0], "2026-11-01");
  assert.equal(dias.length % 7, 0);
  assert.equal(dias[dias.length - 1], "2026-12-05");
  assert.equal(diasVisiveis("2026-02-10", "mes").length, 28); // fevereiro de 2026 cabe em 4 semanas
  assert.equal(diasVisiveis("2026-11-03", "semana").length, 7);
});

test("deslocar mês e semana", () => {
  assert.equal(deslocar("2026-12-20", "mes", 1), "2027-01-01");
  assert.equal(deslocar("2026-01-20", "mes", -1), "2025-12-01");
  assert.equal(deslocar("2026-11-03", "semana", -1), "2026-10-27");
});

test("título do período", () => {
  assert.equal(tituloPeriodo("2026-11-03", "mes"), "novembro de 2026");
  assert.equal(tituloPeriodo("2026-11-03", "semana"), "1 a 7 de novembro de 2026");
  assert.equal(tituloPeriodo("2026-11-30", "semana"), "29 de nov. a 5 de dez. de 2026");
});

test("agrupa por dia e marca atrasados (reunião e concluída nunca atrasam)", () => {
  const lista = [item({ id: 1 }), item({ id: 2, data: "2026-11-05" }), item({ id: 3 })];
  assert.equal(agruparPorDia(lista).get("2026-11-04")?.length, 2);
  assert.equal(atrasado(item({}), "2026-11-05"), true);
  assert.equal(atrasado(item({}), "2026-11-04"), false);
  assert.equal(atrasado(item({ feito: true }), "2026-11-05"), false);
  assert.equal(atrasado(item({ tipo: "reuniao" }), "2026-11-05"), false);
});

test("filtros por tipo e 'só meus'", () => {
  const lista = [
    item({ id: 1 }),
    item({ id: 2, responsavel: "jullyana" }),
    item({ id: 3, tipo: "reuniao", responsavel: null, detalhe: "dimi, jullyana" }),
    item({ id: 4, tipo: "negocio", responsavel: "dimi" }),
  ];
  const todos = new Set<TipoItem>(["tarefa", "negocio", "reuniao"]);
  assert.equal(filtrar(lista, todos, null).length, 4);
  assert.deepEqual(filtrar(lista, todos, "dimi").map((i) => i.id), [1, 3, 4]);
  assert.deepEqual(filtrar(lista, new Set<TipoItem>(["reuniao"]), "jullyana").map((i) => i.id), [3]);
});
