// Tema da interface (claro ou escuro). Fica no navegador e no atributo data-tema do <html>; o script em
// app/layout.tsx aplica o salvo antes da primeira pintura, para não piscar.

export type Tema = "claro" | "escuro";
export const CHAVE_TEMA = "hq:tema";

export function lerTema(): Tema {
  if (typeof document === "undefined") return "claro";
  return document.documentElement.dataset.tema === "escuro" ? "escuro" : "claro";
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema;
  try {
    window.localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // sem armazenamento: vale só nesta aba
  }
}

export function trocarTema(): Tema {
  const novo: Tema = lerTema() === "escuro" ? "claro" : "escuro";
  aplicarTema(novo);
  return novo;
}
