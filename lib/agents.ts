// Metadados dos agentes (design.md). Ids idênticos aos do Python.

export const AGENTES = [
  { id: "tech", nome: "Tech", nivel: "N2", cor: "#3FC1C9", ocioso: "observando a main", x: 60, y: 60 },
  { id: "agenda", nome: "Agenda", nivel: "N2", cor: "#7BD88F", ocioso: "sem pendências", x: 612, y: 60 },
  { id: "orq", nome: "Orquestrador", nivel: "N1", cor: "#4C8DFF", ocioso: "ouvindo o grupo", x: 336, y: 250 },
  { id: "negocios", nome: "Negócios", nivel: "N2", cor: "#A58BFF", ocioso: "aguardando eventos", x: 60, y: 450 },
  { id: "work", nome: "Workers", nivel: "N3", cor: "#8FA3C7", ocioso: "na fila", x: 612, y: 450 },
] as const;

export type Agente = (typeof AGENTES)[number];
export type IdAgente = Agente["id"];

export function agentePorId(id: string): Agente | undefined {
  return AGENTES.find((a) => a.id === id);
}
