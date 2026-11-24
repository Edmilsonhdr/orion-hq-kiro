import { test } from "node:test";
import assert from "node:assert/strict";
import { docParaTexto, textoParaDoc } from "./textoTarefa.ts";

test("texto com imagem e menção vai e volta igual", () => {
  const texto = "Olha o erro @jullyana:\n![print.png|480](/api/anexos/5)\n\nDepois testa de novo";
  const doc = textoParaDoc(texto);
  assert.deepEqual(
    doc.content?.map((b) => b.type),
    ["paragraph", "imagem", "paragraph", "paragraph"],
  );
  assert.deepEqual(doc.content?.[0].content?.[1], { type: "mencao", attrs: { id: "jullyana" } });
  assert.equal(doc.content?.[1].attrs?.largura, 480);
  assert.equal(docParaTexto(doc), texto);
});

test("imagem no meio da linha vira bloco próprio e texto vazio vira parágrafo vazio", () => {
  const doc = textoParaDoc("antes ![a](/api/anexos/1) depois");
  assert.deepEqual(doc.content?.map((b) => b.type), ["paragraph", "imagem", "paragraph"]);
  assert.equal(docParaTexto(doc), "antes \n![a](/api/anexos/1)\n depois");
  assert.deepEqual(textoParaDoc("").content, [{ type: "paragraph", content: undefined }]);
  assert.equal(docParaTexto(textoParaDoc("")), "");
});

test("e-mail não vira menção", () => {
  const doc = textoParaDoc("mande para ana@empresa.com");
  assert.equal(doc.content?.[0].content?.length, 1);
});
