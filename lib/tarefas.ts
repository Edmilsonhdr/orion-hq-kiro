// Tarefas (quadro Kanban por pessoa): tipos e funções puras do quadro. As colunas vêm do servidor
// (são personalizáveis); a primeira recebe as tarefas novas e as marcadas como "concluída" encerram a tarefa.

export type ColunaTarefa = { chave: string; nome: string; ordem: number; concluida: boolean };

export const PRIORIDADES = ["baixa", "normal", "alta"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta" };

export type Tarefa = {
  id: number;
  titulo: string;
  descricao: string | null;
  status: string; // chave da coluna
  prioridade: Prioridade;
  responsavel: string;
  criado_por: string;
  prazo: string | null;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  concluida_em: string | null;
  documento_id: number | null;
  negocio_id: number | null;
  documento_titulo: string | null;
  negocio_titulo: string | null;
  organizacao_nome: string | null;
  coluna_concluida: boolean;
};

export type ResumoPessoa = { abertas: number; vencidas: number };

export type SituacaoPrazo = "vencida" | "hoje" | "proxima" | "ok" | null;

// Situação do prazo; tarefa concluída (ou sem prazo) não tem alerta.
export function situacaoPrazo(t: Pick<Tarefa, "prazo" | "coluna_concluida">, hoje: string): SituacaoPrazo {
  if (!t.prazo || t.coluna_concluida) return null;
  const dia = t.prazo.slice(0, 10);
  if (dia < hoje) return "vencida";
  if (dia === hoje) return "hoje";
  const limite = new Date(`${hoje}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 2);
  return dia <= limite.toISOString().slice(0, 10) ? "proxima" : "ok";
}

// Colunas do quadro com suas tarefas; a ordem manual (campo `ordem`) manda. Tarefa de coluna que não
// existe mais cai na primeira.
export function porColuna(tarefas: Tarefa[], colunas: ColunaTarefa[]): Record<string, Tarefa[]> {
  const saida: Record<string, Tarefa[]> = Object.fromEntries(colunas.map((c) => [c.chave, [] as Tarefa[]]));
  const primeira = colunas[0]?.chave;
  for (const t of [...tarefas].sort((a, b) => a.ordem - b.ordem || a.id - b.id)) {
    const chave = t.status in saida ? t.status : primeira;
    if (chave) saida[chave].push(t);
  }
  return saida;
}

function filaDe(tarefas: Tarefa[], responsavel: string, status: string, excluirId: number): Tarefa[] {
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
export function moverLocal(tarefas: Tarefa[], id: number, coluna: ColunaTarefa, posicao?: number): Tarefa[] {
  const alvo = tarefas.find((t) => t.id === id);
  if (!alvo) return tarefas;
  const ids = filaDe(tarefas, alvo.responsavel, coluna.chave, id).map((t) => t.id);
  ids.splice(posicao === undefined ? ids.length : Math.max(0, Math.min(posicao, ids.length)), 0, id);
  const ordem = new Map(ids.map((i, n) => [i, n]));
  return tarefas.map((t) => {
    if (t.id === id)
      return {
        ...t,
        status: coluna.chave,
        ordem: ordem.get(id) ?? 0,
        coluna_concluida: coluna.concluida,
        concluida_em: coluna.concluida ? (t.concluida_em ?? new Date().toISOString()) : null,
      };
    return ordem.has(t.id) ? { ...t, ordem: ordem.get(t.id) ?? t.ordem } : t;
  });
}
