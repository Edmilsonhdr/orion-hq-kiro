// Filtros da tela de Aprovações (por categoria do tipo de proposta).

export type FiltroAprovacao = "todas" | "documentos" | "comercial" | "reunioes";

export function categoriaDoTipo(tipo: string): Exclude<FiltroAprovacao, "todas"> {
  if (tipo === "criar_documento" || tipo === "editar_documento") return "documentos";
  if (tipo.startsWith("comercial_")) return "comercial";
  return "reunioes";
}

export function filtrarAprovacoes<T extends { tipo: string }>(lista: T[], filtro: FiltroAprovacao): T[] {
  return filtro === "todas" ? lista : lista.filter((a) => categoriaDoTipo(a.tipo) === filtro);
}

// Agentes que aparecem como autores das propostas (ordem alfabética), para o filtro por agente.
export function agentesDasAprovacoes<T extends { pedido_por: string | null }>(lista: T[]): string[] {
  return [...new Set(lista.map((a) => a.pedido_por).filter((p): p is string => !!p))].sort();
}

export function filtrarPorAgente<T extends { pedido_por: string | null }>(lista: T[], agente: string): T[] {
  return agente ? lista.filter((a) => a.pedido_por === agente) : lista;
}
