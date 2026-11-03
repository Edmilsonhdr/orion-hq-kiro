// Estado "ao vivo" de um agente, derivado do feed de atividades (o mesmo do Escritório).
// - trabalhando: atividade recente (últimos JANELA_TRABALHO_MS) que não é um fim de ciclo;
// - aguardando: a última atividade é um pedido de aprovação ainda recente;
// - ocioso: o resto.

export type AtividadeViva = {
  agente: string;
  tipo: string;
  detalhe: string | null;
  criado_em: string;
};

export type EstadoAoVivo = {
  estado: "trabalhando" | "aguardando" | "ocioso";
  detalhe: string | null;
  // ms desde a última atividade do agente (null: sem atividade).
  haMs: number | null;
};

export const JANELA_TRABALHO_MS = 20_000;
export const JANELA_AGUARDANDO_MS = 30 * 60_000;

// Fins de ciclo: depois deles o agente volta a ficar ocioso.
const FINS = new Set(["concluiu", "resposta", "erro"]);

export function estadoAoVivo(atividades: readonly AtividadeViva[], agente: string, agora: number): EstadoAoVivo {
  let ultima: AtividadeViva | null = null;
  let ultimaMs = -Infinity;
  for (const a of atividades) {
    if (a.agente !== agente) continue;
    const t = new Date(a.criado_em).getTime();
    if (t >= ultimaMs) {
      ultima = a;
      ultimaMs = t;
    }
  }
  if (!ultima) return { estado: "ocioso", detalhe: null, haMs: null };

  const haMs = Math.max(0, agora - ultimaMs);
  const detalhe = ultima.detalhe?.trim() ? ultima.detalhe.trim() : null;

  if (ultima.tipo === "aguardando_aprovacao" && haMs <= JANELA_AGUARDANDO_MS) {
    return { estado: "aguardando", detalhe, haMs };
  }
  if (!FINS.has(ultima.tipo) && ultima.tipo !== "aguardando_aprovacao" && haMs <= JANELA_TRABALHO_MS) {
    return { estado: "trabalhando", detalhe, haMs };
  }
  return { estado: "ocioso", detalhe: null, haMs };
}
