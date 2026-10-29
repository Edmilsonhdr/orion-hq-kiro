// Diff por linhas (LCS) para mostrar o antes/depois de uma edição proposta. Sem dependências.

export type LinhaDiff = { tipo: "igual" | "removida" | "adicionada"; texto: string };

// Documentos muito grandes não entram no LCS (custo O(n·m)): mostramos só o "depois".
export const DIFF_MAX_LINHAS = 800;

export function diffLinhas(antes: string, depois: string): LinhaDiff[] | null {
  const a = antes.split("\n");
  const b = depois.split("\n");
  if (a.length > DIFF_MAX_LINHAS || b.length > DIFF_MAX_LINHAS) return null;
  const tabela: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      tabela[i][j] = a[i] === b[j] ? tabela[i + 1][j + 1] + 1 : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
    }
  }
  const saida: LinhaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      saida.push({ tipo: "igual", texto: a[i] });
      i++;
      j++;
    } else if (tabela[i + 1][j] >= tabela[i][j + 1]) {
      saida.push({ tipo: "removida", texto: a[i++] });
    } else {
      saida.push({ tipo: "adicionada", texto: b[j++] });
    }
  }
  while (i < a.length) saida.push({ tipo: "removida", texto: a[i++] });
  while (j < b.length) saida.push({ tipo: "adicionada", texto: b[j++] });
  return saida;
}

// Resume o diff: quantas linhas entraram e saíram.
export function resumoDiff(linhas: LinhaDiff[]): { adicionadas: number; removidas: number } {
  return {
    adicionadas: linhas.filter((l) => l.tipo === "adicionada").length,
    removidas: linhas.filter((l) => l.tipo === "removida").length,
  };
}
