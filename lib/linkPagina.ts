// Sugestão de páginas ao digitar `[[` no editor Markdown: detecta o link em aberto antes do cursor,
// filtra os títulos e devolve o texto com o link fechado.

export type LinkAberto = { inicio: number; consulta: string };

export function detectarLink(texto: string, cursor: number): LinkAberto | null {
  const antes = texto.slice(0, cursor);
  const m = /\[\[([^\]\n[]{0,80})$/.exec(antes);
  return m ? { inicio: m.index, consulta: m[1] } : null;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filtrarTitulos<T extends { titulo: string }>(paginas: T[], consulta: string, limite = 6): T[] {
  const q = normalizar(consulta.trim());
  const achadas = q ? paginas.filter((p) => normalizar(p.titulo).includes(q)) : paginas;
  return achadas
    .slice()
    .sort((a, b) => Number(normalizar(b.titulo).startsWith(q)) - Number(normalizar(a.titulo).startsWith(q)))
    .slice(0, limite);
}

export function aplicarLink(texto: string, link: LinkAberto, cursor: number, titulo: string): { valor: string; cursor: number } {
  const depois = texto.slice(cursor).replace(/^\]\]/, "");
  const inserido = `[[${titulo}]]`;
  return { valor: texto.slice(0, link.inicio) + inserido + depois, cursor: link.inicio + inserido.length };
}
