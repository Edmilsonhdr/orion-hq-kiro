import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarAtalhos, montarItens, semAcento } from "./paleta.ts";

test("semAcento ignora acento e caixa", () => {
  assert.equal(semAcento("Aprovações"), "aprovacoes");
});

test("consulta vazia mostra só as ações; com texto filtra sem acento", () => {
  assert.deepEqual(filtrarAtalhos("").map((a) => a.id), ["nova-pagina", "novo-negocio", "nova-tarefa"]);
  assert.deepEqual(filtrarAtalhos("aprovacoes").map((a) => a.id), ["ir-aprovacoes"]);
  assert.deepEqual(filtrarAtalhos("ir doc").map((a) => a.id), ["ir-docs"]);
  assert.deepEqual(filtrarAtalhos("zzz"), []);
});

test("montarItens põe resultados antes dos atalhos", () => {
  const itens = montarItens("piloto", {
    documentos: [{ id: 1, titulo: "Checklist do piloto", pasta: "Comercial" }],
    negocios: [{ id: 2, titulo: "Piloto Ana", organizacao: "Nutri Ana", etapa: "lead" }],
    organizacoes: [{ id: 3, nome: "Nutri Ana", tipo: "autonomo" }],
  });
  assert.deepEqual(itens.map((i) => i.href), ["/docs/1", "/comercial/negocios/2", "/comercial/organizacoes/3"]);
});

test("montarItens inclui conversas, com a Geral em ?conversa=0", () => {
  const itens = montarItens("aurora", {
    documentos: [],
    negocios: [],
    organizacoes: [],
    conversas: [{ id: 4, titulo: "Plano Aurora", trecho: null }, { id: null, titulo: "Geral", trecho: "falei da Aurora" }],
  });
  const c = itens.filter((i) => i.grupo === "Conversas");
  assert.deepEqual(c.map((i) => i.href), ["/chat?conversa=4", "/chat?conversa=0"]);
  assert.equal(c[1].dica, "falei da Aurora");
});
