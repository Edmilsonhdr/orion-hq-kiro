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
