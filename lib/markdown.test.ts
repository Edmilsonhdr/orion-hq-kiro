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

import { extrairTitulos, textoPuro } from "./markdown.ts";

test("tabela: cabeçalho, linhas retangulares e células com markdown", () => {
  const [t] = parseMarkdown("| Plano | Preço |\n|---|:---:|\n| **Free** | 0 |\n| Pro |\n");
  assert.equal(t.t, "tabela");
  const tabela = t as { cabecalho: Inline[][]; linhas: Inline[][][] };
  assert.equal(tabela.cabecalho.length, 2);
  assert.equal(tabela.linhas.length, 2);
  assert.equal(tabela.linhas[0][0][0].t, "negrito");
  assert.equal(tabela.linhas[1].length, 2); // linha curta é completada
  assert.deepEqual(tabela.linhas[1][1], []);
});

test("linha com barras sem separador não vira tabela", () => {
  const blocos = parseMarkdown("| só uma linha |");
  assert.equal(blocos[0].t, "paragrafo");
});

test("HTML dentro de célula de tabela continua sendo texto", () => {
  const [t] = parseMarkdown("| a |\n|---|\n| <img src=x onerror=alert(1)> |");
  const celula = (t as { linhas: Inline[][][] }).linhas[0][0];
  assert.ok(celula.every((x) => x.t === "texto"));
});

test("lista de tarefas marca feitos e pendentes", () => {
  const [l] = parseMarkdown("- [ ] fazer\n- [x] feito\n- [X] também\n- comum");
  const itens = (l as { itens: { feito?: boolean }[] }).itens;
  assert.deepEqual(
    itens.map((i) => i.feito),
    [false, true, true, undefined],
  );
});

test("títulos ganham âncora única e sem acento", () => {
  const blocos = parseMarkdown("# Introdução\n\n## Decisões\n\n## Decisões\n\n#### Fundo");
  const ids = blocos.filter((b) => b.t === "titulo").map((b) => (b as { id: string }).id);
  assert.deepEqual(ids, ["introducao", "decisoes", "decisoes-2", "fundo"]);
  assert.deepEqual(
    extrairTitulos(blocos).map((t) => t.id),
    ["introducao", "decisoes", "decisoes-2"], // níveis 1 a 3 no sumário
  );
});

test("textoPuro remove a marcação e encurta", () => {
  const md = "# Bem-vindos\n\nAqui **ficam** os `textos` e [o link](https://x.com).\n\n- um\n- dois";
  assert.equal(textoPuro(md), "Bem-vindos Aqui ficam os textos e o link. um dois");
  assert.ok(textoPuro("palavra ".repeat(100), 50).length <= 50);
  assert.equal(textoPuro(""), "");
});

test("[[Título]] vira link de página e @usuario vira menção", () => {
  const r = parseInline("veja [[Guia de vendas]] e fale com @jullyana (a@b.com não conta)");
  assert.deepEqual(r.filter((x) => x.t === "pagina"), [{ t: "pagina", titulo: "Guia de vendas" }]);
  assert.deepEqual(r.filter((x) => x.t === "mencao"), [{ t: "mencao", usuario: "jullyana" }]);
});

test("escapes do markdown viram o caractere literal", () => {
  const r = parseInline("R$ 10 \\* 2 e snake\\_case \\[x\\] C:\\dir");
  assert.deepEqual(r, [{ t: "texto", v: "R$ 10 * 2 e snake_case [x] C:\\dir" }]);
});
