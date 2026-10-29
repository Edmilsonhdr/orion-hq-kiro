// Árvore de páginas do Docs: monta a hierarquia e calcula para onde um arrasto leva a página.

import type { NoArvore } from "./docs";

export type NoVisual = NoArvore & { nivel: number; filhos: NoVisual[] };
export type Zona = "antes" | "dentro" | "depois";

// A ordem de entrada (já ordenada pelo backend) é mantida entre irmãs.
export function montarArvore(nos: NoArvore[]): NoVisual[] {
  const ids = new Set(nos.map((n) => n.id));
  const filhosDe = new Map<number | null, NoArvore[]>();
  for (const n of nos) {
    const pai = n.pai_id !== null && ids.has(n.pai_id) ? n.pai_id : null;
    filhosDe.set(pai, [...(filhosDe.get(pai) ?? []), n]);
  }
  const montar = (pai: number | null, nivel: number): NoVisual[] =>
    (filhosDe.get(pai) ?? []).map((n) => ({ ...n, nivel, filhos: montar(n.id, nivel + 1) }));
  return montar(null, 0);
}

export function achatar(raiz: NoVisual[], abertos: Set<number>): NoVisual[] {
  const saida: NoVisual[] = [];
  const visitar = (n: NoVisual) => {
    saida.push(n);
    if (abertos.has(n.id)) n.filhos.forEach(visitar);
  };
  raiz.forEach(visitar);
  return saida;
}

function ehDescendente(nos: NoArvore[], id: number, ancestral: number): boolean {
  const porId = new Map(nos.map((n) => [n.id, n]));
  for (let atual = porId.get(id); atual; atual = atual.pai_id === null ? undefined : porId.get(atual.pai_id)) {
    if (atual.pai_id === ancestral) return true;
  }
  return false;
}

// Destino de soltar `arrastadoId` sobre `alvoId` em `zona`; `null` quando não faz sentido
// (soltar em si mesma ou dentro de uma subpágina dela). `posicao` conta as irmãs sem a arrastada.
export function destinoDoArrasto(
  nos: NoArvore[],
  arrastadoId: number,
  alvoId: number,
  zona: Zona
): { pai_id: number | null; posicao: number } | null {
  const alvo = nos.find((n) => n.id === alvoId);
  if (!alvo || arrastadoId === alvoId || ehDescendente(nos, alvoId, arrastadoId)) return null;
  const pai = zona === "dentro" ? alvo.id : alvo.pai_id;
  const irmas = nos.filter((n) => n.pai_id === pai && n.id !== arrastadoId);
  if (zona === "dentro") return { pai_id: pai, posicao: irmas.length };
  const i = irmas.findIndex((n) => n.id === alvoId);
  return { pai_id: pai, posicao: zona === "antes" ? i : i + 1 };
}
