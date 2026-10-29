// Parser mínimo de markdown para o módulo Docs (spec docs, Requirement 5.4).
//
// Seguro por construção: devolve uma ÁRVORE de dados (nunca HTML). O componente
// `Markdown.tsx` transforma a árvore em elementos React, então HTML bruto no texto
// aparece como texto e nada é executado. Links só aceitam http(s) e mailto.
// Suporta: títulos (com âncora), parágrafos, listas (simples e de tarefas), tabelas, citações,
// código (inline e em bloco), linha horizontal, negrito, itálico e links. Sem listas aninhadas.

export type Inline =
  | { t: "texto"; v: string }
  | { t: "codigo"; v: string }
  | { t: "negrito"; c: Inline[] }
  | { t: "italico"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  // [[Título]]: link para outra página do Docs (resolvido pelo título ao clicar).
  | { t: "pagina"; titulo: string }
  // @usuario: menção (só realce; o aviso aparece no Início de quem foi citado).
  | { t: "mencao"; usuario: string };

export type ItemLista = { c: Inline[]; feito?: boolean };

export type Bloco =
  | { t: "titulo"; nivel: number; c: Inline[]; id: string }
  | { t: "paragrafo"; c: Inline[] }
  | { t: "lista"; ordenada: boolean; itens: ItemLista[] }
  | { t: "tabela"; cabecalho: Inline[][]; linhas: Inline[][][] }
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

    // Escape do markdown (\* \_ \[ …): vira o próprio caractere, sem significado especial.
    if (ch === "\\" && i + 1 < s.length && /[!-/:-@[-`{-~]/.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }

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

    if (ch === "[" && s[i + 1] === "[") {
      const fim = s.indexOf("]]", i + 2);
      const titulo = fim > i + 2 ? s.slice(i + 2, fim).trim() : "";
      if (titulo && !titulo.includes("[") && titulo.length <= 200) {
        esvaziar();
        saida.push({ t: "pagina", titulo });
        i = fim + 2;
        continue;
      }
    }

    if (ch === "@" && !/[A-Za-z0-9_]/.test(s[i - 1] ?? " ")) {
      const m = /^@([A-Za-z][A-Za-z0-9_]{1,30})/.exec(s.slice(i));
      if (m) {
        esvaziar();
        saida.push({ t: "mencao", usuario: m[1].toLowerCase() });
        i += m[0].length;
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

function textoDe(c: Inline[]): string {
  return c
    .map((x) =>
      x.t === "texto" || x.t === "codigo"
        ? x.v
        : x.t === "pagina"
          ? x.titulo
          : x.t === "mencao"
            ? `@${x.usuario}`
            : textoDe(x.c)
    )
    .join("");
}

function slug(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "secao";
}

const TABELA_LINHA = /^\s*\|.*\|\s*$/;
const TABELA_SEPARADOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function celulas(linha: string): string[] {
  const miolo = linha.trim().replace(/^\|/, "").replace(/\|$/, "");
  return miolo.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

const TITULO = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LISTA = /^\s*[-*+]\s+(.*)$/;
const TAREFA = /^\[( |x|X)\]\s+(.*)$/;
const LISTA_ORDENADA = /^\s*\d+[.)]\s+(.*)$/;
const CITACAO = /^\s*>\s?(.*)$/;
const LINHA = /^\s*([-*_])(\s*\1){2,}\s*$/;
const CERCA = /^\s*```/;

export function parseMarkdown(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  const usados = new Map<string, number>();
  const idUnico = (texto: string) => {
    const base = slug(texto);
    const n = usados.get(base) ?? 0;
    usados.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
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
      const filhos = parseInline(titulo[2]);
      blocos.push({
        t: "titulo",
        nivel: titulo[1].length,
        c: filhos,
        id: idUnico(textoDe(filhos)),
      });
      i++;
      continue;
    }

    if (LINHA.test(linha)) {
      blocos.push({ t: "linha" });
      i++;
      continue;
    }

    if (TABELA_LINHA.test(linha) && i + 1 < linhas.length && TABELA_SEPARADOR.test(linhas[i + 1])) {
      const cabecalho = celulas(linha).map(parseInline);
      i += 2;
      const corpo: Inline[][][] = [];
      while (i < linhas.length && TABELA_LINHA.test(linhas[i])) {
        const cels = celulas(linhas[i]).map(parseInline);
        // linhas curtas completam com vazio; longas são cortadas (tabela sempre retangular)
        while (cels.length < cabecalho.length) cels.push([]);
        corpo.push(cels.slice(0, cabecalho.length));
        i++;
      }
      blocos.push({ t: "tabela", cabecalho, linhas: corpo });
      continue;
    }

    const lista = LISTA.test(linha) ? LISTA : LISTA_ORDENADA.test(linha) ? LISTA_ORDENADA : null;
    if (lista) {
      const itens: ItemLista[] = [];
      let m: RegExpExecArray | null;
      while (i < linhas.length && (m = lista.exec(linhas[i]))) {
        const tarefa = lista === LISTA ? TAREFA.exec(m[1]) : null;
        if (tarefa) itens.push({ c: parseInline(tarefa[2]), feito: tarefa[1] !== " " });
        else itens.push({ c: parseInline(m[1]) });
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
      !LINHA.test(linhas[i]) &&
      !(TABELA_LINHA.test(linhas[i]) && TABELA_SEPARADOR.test(linhas[i + 1] ?? ""))
    ) {
      partes.push(linhas[i].trim());
      i++;
    }
    blocos.push({ t: "paragrafo", c: parseInline(partes.join(" ")) });
  }

  return blocos;
}

export type Titulo = { nivel: number; texto: string; id: string };

// Títulos (níveis 1 a 3) para o sumário lateral.
export function extrairTitulos(blocos: Bloco[]): Titulo[] {
  const saida: Titulo[] = [];
  for (const b of blocos) {
    if (b.t === "titulo" && b.nivel <= 3) saida.push({ nivel: b.nivel, texto: textoDe(b.c), id: b.id });
  }
  return saida;
}

// Texto corrido sem marcação, para trechos de lista (sem `#`, `**`, crases, links em markdown etc.).
export function textoPuro(markdown: string, max = 180): string {
  const partes: string[] = [];
  for (const b of parseMarkdown(markdown)) {
    switch (b.t) {
      case "titulo":
      case "paragrafo":
      case "citacao":
        partes.push(textoDe(b.c));
        break;
      case "lista":
        for (const item of b.itens) partes.push(textoDe(item.c));
        break;
      case "tabela":
        partes.push(b.cabecalho.map(textoDe).join(" "));
        break;
      case "codigo":
        partes.push(b.v);
        break;
    }
    if (partes.join(" ").length >= max * 2) break;
  }
  const texto = partes.join(" ").replace(/\s+/g, " ").trim();
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}
