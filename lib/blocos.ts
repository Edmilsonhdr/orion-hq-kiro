// Menu "/" do editor: blocos de markdown inseridos ao digitar "/" no começo de uma linha.
// O markdown continua sendo a fonte da verdade; aqui só há texto, sem HTML.

// Sem import de outros módulos de lib/: o `node --test` precisa de extensão e o `tsc` a proíbe.
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type Bloco = {
  id: string;
  rotulo: string;
  dica: string;
  // Palavras extras que também encontram o bloco.
  chaves: string[];
  markdown: string;
};

export const BLOCOS: readonly Bloco[] = [
  { id: "h1", rotulo: "Título grande", dica: "# Título", chaves: ["titulo", "h1", "heading"], markdown: "# Título\n" },
  { id: "h2", rotulo: "Título médio", dica: "## Título", chaves: ["titulo", "h2", "secao"], markdown: "## Título\n" },
  { id: "h3", rotulo: "Título pequeno", dica: "### Título", chaves: ["titulo", "h3", "subtitulo"], markdown: "### Título\n" },
  { id: "lista", rotulo: "Lista", dica: "- item", chaves: ["lista", "bullet", "topicos"], markdown: "- item\n- item\n" },
  { id: "numerada", rotulo: "Lista numerada", dica: "1. item", chaves: ["numerada", "numeros", "passos"], markdown: "1. item\n2. item\n" },
  { id: "tarefas", rotulo: "Lista de tarefas", dica: "- [ ] tarefa", chaves: ["tarefa", "todo", "checklist"], markdown: "- [ ] tarefa\n- [ ] tarefa\n" },
  { id: "tabela", rotulo: "Tabela", dica: "| A | B |", chaves: ["tabela", "grade"], markdown: "| Coluna 1 | Coluna 2 |\n|---|---|\n| valor | valor |\n" },
  { id: "citacao", rotulo: "Citação", dica: "> texto", chaves: ["citacao", "quote"], markdown: "> citação\n" },
  { id: "codigo", rotulo: "Bloco de código", dica: "```", chaves: ["codigo", "code"], markdown: "```\ncódigo\n```\n" },
  { id: "linha", rotulo: "Linha divisória", dica: "---", chaves: ["linha", "divisor", "hr"], markdown: "---\n" },
];

export type Barra = { inicio: number; consulta: string };

// Há um "/" aberto no começo da linha onde está o cursor? (só espaços antes, sem espaço depois)
export function detectarBarra(valor: string, cursor: number): Barra | null {
  const inicioLinha = valor.lastIndexOf("\n", cursor - 1) + 1;
  const trecho = valor.slice(inicioLinha, cursor);
  const m = /^\s*\/([^\s/]*)$/.exec(trecho);
  if (!m) return null;
  return { inicio: inicioLinha + trecho.indexOf("/"), consulta: m[1] };
}

export function filtrarBlocos(consulta: string, blocos: readonly Bloco[] = BLOCOS): Bloco[] {
  const q = semAcento(consulta);
  if (!q) return [...blocos];
  return blocos.filter((b) => [b.rotulo, ...b.chaves].some((t) => semAcento(t).includes(q)));
}

// Troca "/consulta" pelo markdown do bloco e devolve o novo texto e a posição do cursor.
export function inserirBloco(valor: string, barra: Barra, cursor: number, bloco: Bloco): { valor: string; cursor: number } {
  const novo = valor.slice(0, barra.inicio) + bloco.markdown + valor.slice(cursor);
  return { valor: novo, cursor: barra.inicio + bloco.markdown.length };
}
