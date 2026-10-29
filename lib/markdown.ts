// Parser mínimo de markdown para o módulo Docs (spec docs, Requirement 5.4).
//
// Seguro por construção: devolve uma ÁRVORE de dados (nunca HTML). O componente
// `Markdown.tsx` transforma a árvore em elementos React, então HTML bruto no texto
// aparece como texto e nada é executado. Links só aceitam http(s) e mailto.
// Suporta: títulos, parágrafos, listas (simples), citações, código (inline e em bloco),
// linha horizontal, negrito, itálico e links. Sem tabelas nem listas aninhadas.

export type Inline =
  | { t: "texto"; v: string }
  | { t: "codigo"; v: string }
  | { t: "negrito"; c: Inline[] }
  | { t: "italico"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Bloco =
  | { t: "titulo"; nivel: number; c: Inline[] }
  | { t: "paragrafo"; c: Inline[] }
  | { t: "lista"; ordenada: boolean; itens: Inline[][] }
  | { t: "citacao"; c: Inline[] }
  | { t: "codigo"; v: string }
  | { t: "linha" };

const HREF_SEGURO = /^(https?:\/\/|mailto:)/i;
const LINK = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/;

export function hrefSeguro(href: string): boolean {
  return HREF_SEGURO.test(href.trim());
}

export function parseInline(s: string): Inline[] {
  const saida: Inline[] = [];
  let buf = "";
  const esvaziar = () => {
    if (buf) saida.push({ t: "texto", v: buf });
    buf = "";
  };

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (ch === "`") {
      const fim = s.indexOf("`", i + 1);
      if (fim > i + 1) {
        esvaziar();
        saida.push({ t: "codigo", v: s.slice(i + 1, fim) });
        i = fim + 1;
        continue;
      }
    }

    if (ch === "*" && s[i + 1] === "*") {
      const fim = s.indexOf("**", i + 2);
      if (fim > i + 2) {
        esvaziar();
        saida.push({ t: "negrito", c: parseInline(s.slice(i + 2, fim)) });
        i = fim + 2;
        continue;
      }
    }

    if (ch === "*" && s[i + 1] !== " " && s[i + 1] !== "*") {
      const fim = s.indexOf("*", i + 1);
      if (fim > i + 1 && s[fim - 1] !== " ") {
        esvaziar();
        saida.push({ t: "italico", c: parseInline(s.slice(i + 1, fim)) });
        i = fim + 1;
        continue;
      }
    }

    if (ch === "[") {
      const m = LINK.exec(s.slice(i));
      if (m) {
        esvaziar();
        const filhos = parseInline(m[1]);
        // Link inseguro (ex.: javascript:) vira só o texto do rótulo.
        if (hrefSeguro(m[2])) saida.push({ t: "link", href: m[2], c: filhos });
        else saida.push(...filhos);
        i += m[0].length;
        continue;
      }
    }

    buf += ch;
    i++;
  }
  esvaziar();
  return saida;
}

const TITULO = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LISTA = /^\s*[-*+]\s+(.*)$/;
const LISTA_ORDENADA = /^\s*\d+[.)]\s+(.*)$/;
const CITACAO = /^\s*>\s?(.*)$/;
const LINHA = /^\s*([-*_])(\s*\1){2,}\s*$/;
const CERCA = /^\s*```/;

export function parseMarkdown(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];

    if (!linha.trim()) {
      i++;
      continue;
    }

    if (CERCA.test(linha)) {
      const codigo: string[] = [];
      i++;
      while (i < linhas.length && !CERCA.test(linhas[i])) codigo.push(linhas[i++]);
      i++; // fecha a cerca (ou fim do texto)
      blocos.push({ t: "codigo", v: codigo.join("\n") });
      continue;
    }

    const titulo = TITULO.exec(linha);
    if (titulo) {
      blocos.push({ t: "titulo", nivel: titulo[1].length, c: parseInline(titulo[2]) });
      i++;
      continue;
    }

    if (LINHA.test(linha)) {
      blocos.push({ t: "linha" });
      i++;
      continue;
    }

    const lista = LISTA.test(linha) ? LISTA : LISTA_ORDENADA.test(linha) ? LISTA_ORDENADA : null;
    if (lista) {
      const itens: Inline[][] = [];
      let m: RegExpExecArray | null;
      while (i < linhas.length && (m = lista.exec(linhas[i]))) {
        itens.push(parseInline(m[1]));
        i++;
      }
      blocos.push({ t: "lista", ordenada: lista === LISTA_ORDENADA, itens });
      continue;
    }

    if (CITACAO.test(linha)) {
      const partes: string[] = [];
      let m: RegExpExecArray | null;
      while (i < linhas.length && (m = CITACAO.exec(linhas[i]))) {
        partes.push(m[1]);
        i++;
      }
      blocos.push({ t: "citacao", c: parseInline(partes.join(" ")) });
      continue;
    }

    // Parágrafo: junta linhas seguidas que não iniciam outro bloco.
    const partes: string[] = [];
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !CERCA.test(linhas[i]) &&
      !TITULO.test(linhas[i]) &&
      !LISTA.test(linhas[i]) &&
      !LISTA_ORDENADA.test(linhas[i]) &&
      !CITACAO.test(linhas[i]) &&
      !LINHA.test(linhas[i])
    ) {
      partes.push(linhas[i].trim());
      i++;
    }
    blocos.push({ t: "paragrafo", c: parseInline(partes.join(" ")) });
  }

  return blocos;
}
