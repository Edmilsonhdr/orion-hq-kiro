// Testes do parser de markdown dos Docs: `npm run test:front` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseInline, parseMarkdown, type Inline } from "./markdown.ts";

// Tudo que o parser devolve é dado; este helper junta o texto visível para conferir escapes.
function textoVisivel(c: Inline[]): string {
  return c
    .map((x) => (x.t === "texto" || x.t === "codigo" ? x.v : textoVisivel(x.c)))
    .join("");
}

test("HTML bruto vira texto, não elemento", () => {
  const blocos = parseMarkdown('<script>alert(1)</script> e <img src=x onerror=alert(1)>');
  assert.equal(blocos.length, 1);
  assert.equal(blocos[0].t, "paragrafo");
  const c = (blocos[0] as { c: Inline[] }).c;
  assert.ok(c.every((x) => x.t === "texto"));
  assert.equal(textoVisivel(c), '<script>alert(1)</script> e <img src=x onerror=alert(1)>');
});

test("link http(s) e mailto são aceitos", () => {
  const [a] = parseInline("[site](https://orion.app/x)");
  assert.deepEqual(a, { t: "link", href: "https://orion.app/x", c: [{ t: "texto", v: "site" }] });
  const [b] = parseInline("[e-mail](mailto:oi@orion.app)");
  assert.equal(b.t, "link");
});

test("link javascript:/data: é recusado e vira só o rótulo", () => {
  for (const href of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "vbscript:x"]) {
    const c = parseInline(`[clique](${href})`);
    assert.ok(c.every((x) => x.t !== "link"), href);
    assert.equal(textoVisivel(c), "clique");
  }
});

test("títulos, listas, citação, linha e código", () => {
  const blocos = parseMarkdown(
    ["# Título", "", "- a", "- b", "", "1. um", "2. dois", "", "> citado", "", "---", "", "```", "x < y", "```"].join(
      "\n",
    ),
  );
  assert.deepEqual(
    blocos.map((b) => b.t),
    ["titulo", "lista", "lista", "citacao", "linha", "codigo"],
  );
  assert.equal((blocos[0] as { nivel: number }).nivel, 1);
  assert.equal((blocos[1] as { ordenada: boolean }).ordenada, false);
  assert.equal((blocos[2] as { ordenada: boolean }).ordenada, true);
  assert.equal((blocos[5] as { v: string }).v, "x < y");
});

test("conteúdo de bloco de código não é interpretado", () => {
  const [b] = parseMarkdown("```\n**não negrito** [x](javascript:y)\n```");
  assert.deepEqual(b, { t: "codigo", v: "**não negrito** [x](javascript:y)" });
});

test("negrito, itálico e código inline", () => {
  const c = parseInline("**forte** e *leve* e `cod`");
  assert.deepEqual(
    c.map((x) => x.t),
    ["negrito", "texto", "italico", "texto", "codigo"],
  );
});

test("asteriscos soltos e sublinhados em snake_case ficam como texto", () => {
  assert.equal(textoVisivel(parseInline("2 * 3 * 4 e meu_nome_var")), "2 * 3 * 4 e meu_nome_var");
});

test("linhas seguidas formam um parágrafo", () => {
  const blocos = parseMarkdown("linha um\nlinha dois\n\noutro");
  assert.equal(blocos.length, 2);
  assert.equal(textoVisivel((blocos[0] as { c: Inline[] }).c), "linha um linha dois");
});

test("cerca de código não fechada não quebra", () => {
  const [b] = parseMarkdown("```\nsem fim");
  assert.deepEqual(b, { t: "codigo", v: "sem fim" });
});

test("texto vazio devolve lista vazia", () => {
  assert.deepEqual(parseMarkdown(""), []);
  assert.deepEqual(parseMarkdown("\n\n  \n"), []);
});
