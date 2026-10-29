import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriaDoTipo, filtrarAprovacoes } from "./aprovacoes.ts";

test("categoriza os tipos de proposta", () => {
  assert.equal(categoriaDoTipo("criar_documento"), "documentos");
  assert.equal(categoriaDoTipo("comercial_interacao"), "comercial");
  assert.equal(categoriaDoTipo("agendar_reuniao"), "reunioes");
});

test("filtrarAprovacoes mantém tudo em 'todas'", () => {
  const l = [{ tipo: "editar_documento" }, { tipo: "comercial_novo_negocio" }];
  assert.equal(filtrarAprovacoes(l, "todas").length, 2);
  assert.deepEqual(filtrarAprovacoes(l, "comercial"), [{ tipo: "comercial_novo_negocio" }]);
});

import { agentesDasAprovacoes, filtrarPorAgente } from "./aprovacoes.ts";

test("filtro por agente", () => {
  const l = [{ pedido_por: "docs" }, { pedido_por: "comercial" }, { pedido_por: "docs" }, { pedido_por: null }];
  assert.deepEqual(agentesDasAprovacoes(l), ["comercial", "docs"]);
  assert.equal(filtrarPorAgente(l, "docs").length, 2);
  assert.equal(filtrarPorAgente(l, "").length, 4);
});
