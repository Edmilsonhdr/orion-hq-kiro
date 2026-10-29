// Tarefas (quadro Kanban por pessoa): tipos, rótulos e funções puras do quadro.

export const STATUS = ["a_fazer", "fazendo", "bloqueada", "feito"] as const;
export type StatusTarefa = (typeof STATUS)[number];
export const ROTULO_STATUS: Record<StatusTarefa, string> = {
  a_fazer: "A fazer",
  fazendo: "Fazendo",
  bloqueada: "Bloqueada",
  feito: "Feito",
};

export const PRIORIDADES = ["baixa", "normal", "alta"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta" };

export type Tarefa = {
  id: number;
  titulo: string;
  descricao: string | null;
  status: StatusTarefa;
  prioridade: Prioridade;
  responsavel: string;
  criado_por: string;
  prazo: string | null;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  concluida_em: string | null;
};

export type ResumoPessoa = { abertas: number; vencidas: number };

export type SituacaoPrazo = "vencida" | "hoje" | "proxima" | "ok" | null;

// Situação do prazo; tarefa feita (ou sem prazo) não tem alerta.
export function situacaoPrazo(t: Pick<Tarefa, "prazo" | "status">, hoje: string): SituacaoPrazo {
  if (!t.prazo || t.status === "feito") return null;
  const dia = t.prazo.slice(0, 10);
  if (dia < hoje) return "vencida";
  if (dia === hoje) return "hoje";
  const limite = new Date(`${hoje}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 2);
  return dia <= limite.toISOString().slice(0, 10) ? "proxima" : "ok";
}

// Colunas do quadro; a ordem manual (campo `ordem`) manda.
export function porColuna(tarefas: Tarefa[]): Record<StatusTarefa, Tarefa[]> {
  const colunas = { a_fazer: [], fazendo: [], bloqueada: [], feito: [] } as Record<StatusTarefa, Tarefa[]>;
  for (const t of [...tarefas].sort((a, b) => a.ordem - b.ordem || a.id - b.id)) colunas[t.status].push(t);
  return colunas;
}

function filaDe(tarefas: Tarefa[], responsavel: string, status: StatusTarefa, excluirId: number): Tarefa[] {
  return tarefas
    .filter((t) => t.responsavel === responsavel && t.status === status && t.id !== excluirId)
    .sort((a, b) => a.ordem - b.ordem || a.id - b.id);
}

// Posição (na fila da dona da tarefa, como o servidor conta) para soltar `id` antes do cartão `alvoId`.
// `undefined` = fim da coluna (soltou na coluna, ou sobre o cartão de outra pessoa).
export function posicaoAntesDe(tarefas: Tarefa[], id: number, alvoId: number): number | undefined {
  const movida = tarefas.find((t) => t.id === id);
  const alvo = tarefas.find((t) => t.id === alvoId);
  if (!movida || !alvo || movida.responsavel !== alvo.responsavel) return undefined;
  const i = filaDe(tarefas, movida.responsavel, alvo.status, id).findIndex((t) => t.id === alvoId);
  return i < 0 ? undefined : i;
}

// Aplica o movimento no estado local (resposta imediata ao arrastar) com a mesma regra do servidor.
export function moverLocal(tarefas: Tarefa[], id: number, status: StatusTarefa, posicao?: number): Tarefa[] {
  const alvo = tarefas.find((t) => t.id === id);
  if (!alvo) return tarefas;
  const ids = filaDe(tarefas, alvo.responsavel, status, id).map((t) => t.id);
  ids.splice(posicao === undefined ? ids.length : Math.max(0, Math.min(posicao, ids.length)), 0, id);
  const ordem = new Map(ids.map((i, n) => [i, n]));
  return tarefas.map((t) => {
    if (t.id === id)
      return { ...t, status, ordem: ordem.get(id) ?? 0, concluida_em: status === "feito" ? (t.concluida_em ?? new Date().toISOString()) : null };
    return ordem.has(t.id) ? { ...t, ordem: ordem.get(t.id) ?? t.ordem } : t;
  });
}
