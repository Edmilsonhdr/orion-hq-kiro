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
  // Estilo Jira
  chave?: string;
  tipo?: TipoTarefa;
  etiquetas?: string[];
  pontos?: number | null;
  pai_id?: number | null;
  pai_titulo?: string | null;
  epico_id?: number | null;
  epico_titulo?: string | null;
  sprint_id?: number | null;
  sprint_nome?: string | null;
  sprint_estado?: EstadoSprint | null;
  subtarefas_total?: number;
  subtarefas_feitas?: number;
  comentarios_total?: number;
  bloqueios_abertos?: number;
  anexos_total?: number;
  capa_id?: number | null;
};

export const TIPOS_TAREFA = ["tarefa", "bug", "melhoria", "historia", "epico"] as const;
export type TipoTarefa = (typeof TIPOS_TAREFA)[number];
export const ROTULO_TIPO_TAREFA: Record<TipoTarefa, string> = {
  tarefa: "Tarefa",
  bug: "Bug",
  melhoria: "Melhoria",
  historia: "História",
  epico: "Épico",
};
// Cor de cada tipo (ícone quadrado, como no Jira).
export const COR_TIPO_TAREFA: Record<TipoTarefa, string> = {
  tarefa: "#4c8dff",
  bug: "#e5484d",
  melhoria: "#3fb68b",
  historia: "#3fb68b",
  epico: "#8b6cff",
};

export type EstadoSprint = "planejada" | "ativa" | "encerrada";
export type Sprint = {
  id: number;
  nome: string;
  objetivo: string | null;
  inicio: string | null;
  fim: string | null;
  estado: EstadoSprint;
  tarefas_total: number;
  tarefas_feitas: number;
  pontos_total: number;
  pontos_feitos: number;
};

export type Epico = Tarefa & { tarefas_total: number; tarefas_feitas: number; pontos_total: number; pontos_feitos: number };

export type ComentarioTarefa = { id: number; tarefa_id: number; autor: string; texto: string; criado_em: string };
export type HistoricoTarefa = { id: number; autor: string; campo: string; de: string | null; para: string | null; criado_em: string };
export type VinculoTarefa = {
  id: number;
  tipo: "bloqueia" | "relacionada" | "duplica";
  direcao: "saida" | "entrada";
  rotulo: string;
  tarefa_id: number;
  chave: string;
  titulo: string;
  tarefa_tipo: TipoTarefa;
  responsavel: string;
  feita: boolean;
};
export type DetalheTarefa = Tarefa & {
  subtarefas: Tarefa[];
  comentarios: ComentarioTarefa[];
  historico: HistoricoTarefa[];
  vinculos: VinculoTarefa[];
  filhas?: Tarefa[];
};

export const TIPOS_VINCULO = [
  ["bloqueia", "bloqueia"],
  ["bloqueada_por", "é bloqueada por"],
  ["relacionada", "relacionada a"],
  ["duplica", "duplica"],
  ["duplicada_por", "é duplicada por"],
] as const;

const ROTULO_CAMPO_HISTORICO: Record<string, string> = {
  titulo: "o título",
  descricao: "a descrição",
  prioridade: "a prioridade",
  responsavel: "o responsável",
  prazo: "o prazo",
  tipo: "o tipo",
  etiquetas: "as etiquetas",
  pontos: "os pontos",
  epico_id: "o épico",
  sprint_id: "a sprint",
  documento_id: "o documento",
  negocio_id: "o negócio",
  status: "o status",
};

// Frase de uma linha do histórico: "criou a tarefa", "mudou o status de A fazer para Fazendo".
export function fraseHistorico(h: Pick<HistoricoTarefa, "campo" | "de" | "para">): string {
  if (h.campo === "criada") return "criou a tarefa";
  const campo = ROTULO_CAMPO_HISTORICO[h.campo] ?? h.campo;
  if (h.campo === "descricao") return "editou a descrição";
  if (!h.de && h.para) return `definiu ${campo} como ${h.para}`;
  if (h.de && !h.para) return `tirou ${campo} (${h.de})`;
  return `mudou ${campo} de ${h.de} para ${h.para}`;
}

// Progresso de 0 a 100 (sem divisão por zero).
export function progresso(feitas: number, total: number): number {
  return total > 0 ? Math.round((feitas / total) * 100) : 0;
}

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

// --- busca, filtros e resumo do quadro ---

export const FILTROS_PRAZO = ["todos", "vencidas", "hoje", "semana", "sem_prazo"] as const;
export type FiltroPrazo = (typeof FILTROS_PRAZO)[number];
export const ROTULO_FILTRO_PRAZO: Record<FiltroPrazo, string> = {
  todos: "Qualquer prazo",
  vencidas: "Vencidas",
  hoje: "Para hoje",
  semana: "Próximos 7 dias",
  sem_prazo: "Sem prazo",
};

// Filtros rápidos (botões do topo do quadro, como no Jira).
export const FILTROS_RAPIDOS = ["bugs", "alta", "recentes", "bloqueadas"] as const;
export type FiltroRapido = (typeof FILTROS_RAPIDOS)[number];
export const ROTULO_FILTRO_RAPIDO: Record<FiltroRapido, string> = {
  bugs: "Só bugs",
  alta: "Prioridade alta",
  recentes: "Atualizadas há 24 h",
  bloqueadas: "Com bloqueio",
};

export type Filtros = {
  busca: string;
  prazo: FiltroPrazo;
  prioridade: Prioridade | "todas";
  tipo?: TipoTarefa | "todos";
  etiqueta?: string;
  epico?: number | "sem" | null;
  rapidos?: FiltroRapido[];
};
export const FILTROS_VAZIOS: Filtros = { busca: "", prazo: "todos", prioridade: "todas", tipo: "todos", etiqueta: "", epico: null, rapidos: [] };

export function filtrosAtivos(f: Filtros): number {
  return (
    (f.busca.trim() ? 1 : 0) +
    (f.prazo !== "todos" ? 1 : 0) +
    (f.prioridade !== "todas" ? 1 : 0) +
    (f.tipo && f.tipo !== "todos" ? 1 : 0) +
    (f.etiqueta ? 1 : 0) +
    (f.epico != null ? 1 : 0) +
    (f.rapidos?.length ?? 0)
  );
}

// Agrupamento das linhas do quadro (raias), como as "swimlanes" do Jira.
export const AGRUPAMENTOS = ["nenhum", "pessoa", "epico"] as const;
export type Agrupamento = (typeof AGRUPAMENTOS)[number];
export const ROTULO_AGRUPAMENTO: Record<Agrupamento, string> = { nenhum: "Sem raias", pessoa: "Por pessoa", epico: "Por épico" };

export type Raia = { chave: string; titulo: string; tarefas: Tarefa[] };

// Divide as tarefas em raias. Sem agrupamento, uma raia só. A raia "sem épico" vem por último.
export function raias(tarefas: Tarefa[], por: Agrupamento): Raia[] {
  if (por === "nenhum") return [{ chave: "todas", titulo: "", tarefas }];
  const mapa = new Map<string, Raia>();
  for (const t of tarefas) {
    const chave = por === "pessoa" ? t.responsavel : t.epico_id ? String(t.epico_id) : "sem";
    const titulo = por === "pessoa" ? t.responsavel : t.epico_id ? (t.epico_titulo ?? `ORI-${t.epico_id}`) : "Sem épico";
    if (!mapa.has(chave)) mapa.set(chave, { chave, titulo, tarefas: [] });
    mapa.get(chave)!.tarefas.push(t);
  }
  return [...mapa.values()].sort((a, b) => (a.chave === "sem" ? 1 : b.chave === "sem" ? -1 : a.titulo.localeCompare(b.titulo)));
}

// Etiquetas usadas nas tarefas, em ordem alfabética (para o filtro).
export function etiquetasDe(tarefas: Tarefa[]): string[] {
  return [...new Set(tarefas.flatMap((t) => t.etiquetas ?? []))].sort();
}

// Minúsculas e sem acento: "revisão" acha "revisao".
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function somarDiasISO(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

// Tarefas que passam na busca (título, detalhes, vínculos) e nos filtros. Filtro de prazo deixa as concluídas de
// fora, exceto "sem prazo" e "todos".
export function filtrarTarefas(tarefas: Tarefa[], f: Filtros, hoje: string): Tarefa[] {
  const termo = normalizar(f.busca.trim());
  const fimSemana = somarDiasISO(hoje, 7);
  const rapidos = new Set(f.rapidos ?? []);
  const ontem = Date.now() - 86_400_000;
  return tarefas.filter((t) => {
    if (f.prioridade !== "todas" && t.prioridade !== f.prioridade) return false;
    if (f.tipo && f.tipo !== "todos" && (t.tipo ?? "tarefa") !== f.tipo) return false;
    if (f.etiqueta && !(t.etiquetas ?? []).includes(f.etiqueta)) return false;
    if (f.epico === "sem" && t.epico_id) return false;
    if (typeof f.epico === "number" && t.epico_id !== f.epico) return false;
    if (rapidos.has("bugs") && t.tipo !== "bug") return false;
    if (rapidos.has("alta") && t.prioridade !== "alta") return false;
    if (rapidos.has("recentes") && !(Date.parse(t.atualizado_em) >= ontem)) return false;
    if (rapidos.has("bloqueadas") && !(t.bloqueios_abertos ?? 0)) return false;
    const dia = t.prazo?.slice(0, 10) ?? null;
    if (f.prazo === "sem_prazo" && dia) return false;
    if (f.prazo === "vencidas" && (t.coluna_concluida || !dia || dia >= hoje)) return false;
    if (f.prazo === "hoje" && (t.coluna_concluida || dia !== hoje)) return false;
    if (f.prazo === "semana" && (t.coluna_concluida || !dia || dia < hoje || dia > fimSemana)) return false;
    if (!termo) return true;
    const texto = [t.chave ?? `ORI-${t.id}`, t.titulo, t.descricao, t.documento_titulo, t.negocio_titulo, t.organizacao_nome, t.responsavel, t.epico_titulo, ...(t.etiquetas ?? [])].filter(Boolean).join(" ");
    return normalizar(texto).includes(termo);
  });
}

export type ResumoQuadro = { abertas: number; vencidas: number; paraHoje: number; feitas7: number };

// Números do topo da página. "Feitas" conta as concluídas nos últimos 7 dias (o quadro guarda 14).
export function resumoQuadro(tarefas: Tarefa[], hoje: string): ResumoQuadro {
  const inicio = somarDiasISO(hoje, -6);
  const r: ResumoQuadro = { abertas: 0, vencidas: 0, paraHoje: 0, feitas7: 0 };
  for (const t of tarefas) {
    if (t.coluna_concluida) {
      if ((t.concluida_em?.slice(0, 10) ?? "") >= inicio) r.feitas7 += 1;
      continue;
    }
    r.abertas += 1;
    const s = situacaoPrazo(t, hoje);
    if (s === "vencida") r.vencidas += 1;
    if (s === "hoje") r.paraHoje += 1;
  }
  return r;
}

// Prazo em palavras: "Hoje", "Amanhã", "Venceu ontem", "Venceu há 3 dias", "Em 4 dias" ou "28 nov".
export function rotuloPrazo(prazo: string, hoje: string): string {
  const dia = prazo.slice(0, 10);
  const n = diasEntre(hoje, dia);
  if (n === 0) return "Hoje";
  if (n === 1) return "Amanhã";
  if (n === -1) return "Ontem";
  if (n < 0 && n >= -6) return `Há ${-n} dias`;
  if (n > 1 && n <= 6) return `Em ${n} dias`;
  const [ano, mes, d] = dia.split("-").map(Number);
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${d} ${meses[mes - 1]}${ano !== Number(hoje.slice(0, 4)) ? ` ${ano}` : ""}`;
}

// Cor fixa de cada pessoa (avatar e etiqueta), a mesma em todas as telas.
// Sem vermelho e âmbar, que no quadro indicam prazo. Com esta ordem, Dimi fica azul (como no menu), Jullyana
// turquesa e Rayssa roxa.
const CORES_PESSOA = ["#3fc1c9", "#b58cff", "#3fb68b", "#4c8dff", "#f06fb5", "#e8d28a"];
export function corPessoa(nome: string): string {
  let h = 0;
  for (const c of nome) h = (h * 15 + c.charCodeAt(0)) >>> 0;
  return CORES_PESSOA[h % CORES_PESSOA.length];
}
