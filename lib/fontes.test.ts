import { test } from "node:test";
import assert from "node:assert/strict";
import { fontesDe } from "./fontes.ts";

test("ler_documento vira link para o documento", () => {
  const r = fontesDe(["ler_documento(documento_id=12)", "ler_documento(documento_id=12)", "ler_documento(documento_id=3)"]);
  assert.deepEqual(r, [
    { rotulo: "documento #12", href: "/docs/12" },
    { rotulo: "documento #3", href: "/docs/3" },
  ]);
});

test("ferramentas sem link viram rótulo único e desconhecidas são ignoradas", () => {
  const r = fontesDe(["resumo_funil()", "buscar_negocios(consulta='x')", "ver_negocio(negocio_id=1)", "outra()"]);
  assert.deepEqual(r, [{ rotulo: "funil comercial" }, { rotulo: "negócios" }]);
});

test("busca de documentos sem leitura mostra 'documentos'", () => {
  assert.deepEqual(fontesDe(["buscar_documentos(consulta='x')"]), [{ rotulo: "documentos" }]);
});
