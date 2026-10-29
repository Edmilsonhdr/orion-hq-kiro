// Tipos e utilitários do módulo Comercial (spec comercial). As chamadas usam `obter`/`enviar`/
// `atualizar` de `lib/api.ts`. Só dados comerciais: nunca dados de saúde de pessoas.

export const ETAPAS = ["lead", "contato", "demonstracao", "piloto", "proposta", "ganho", "perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const ETAPAS_ABERTAS: readonly Etapa[] = ETAPAS.slice(0, 5);

export const ROTULO_ETAPA: Record<Etapa, string> = {
  lead: "Lead",
  contato: "Contato",
  demonstracao: "Demonstração",
  piloto: "Piloto",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

export const TIPOS_ORG = ["clinica", "autonomo", "empresa", "outro"] as const;
export const ROTULO_TIPO_ORG: Record<string, string> = {
  clinica: "Clínica",
  autonomo: "Profissional autônomo",
  empresa: "Empresa",
  outro: "Outro",
};

export const AREAS = ["nutricao", "educacao_fisica", "ambas", "outra"] as const;
export const ROTULO_AREA: Record<string, string> = {
  nutricao: "Nutrição",
  educacao_fisica: "Educação física",
  ambas: "Nutrição e educação física",
  outra: "Outra",
};

export const TIPOS_INTERACAO = ["ligacao", "reuniao", "email", "whatsapp", "nota"] as const;
export const ROTULO_INTERACAO: Record<string, string> = {
  ligacao: "Ligação",
  reuniao: "Reunião",
  email: "E-mail",
  whatsapp: "WhatsApp",
  nota: "Nota",
  etapa: "Etapa",
};

export const PLANOS = ["essencial", "completo"] as const;

export type Negocio = {
  id: number;
  organizacao_id: number;
  organizacao_nome: string;
  organizacao_tipo: string;
  titulo: string;
  etapa: Etapa;
  valor_mensal: number | null;
  pacientes_ativos: number | null;
  plano_interesse: string | null;
  usa_hoje: string | null;
  origem: string | null;
  responsavel: string;
  proximo_passo: string | null;
  proximo_passo_em: string | null;
  etapa_desde: string;
  fechado_em: string | null;
  motivo_perda: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type Interacao = {
  id: number;
  negocio_id: number;
  tipo: string;
  resumo: string;
  ocorrida_em: string;
  autor: string;
};

export type Contato = {
  id: number;
  organizacao_id: number;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
};

export type NegocioDetalhe = Negocio & { interacoes: Interacao[]; contatos: Contato[] };

export type Organizacao = {
  id: number;
  nome: string;
  tipo: string;
  area: string | null;
  cidade: string | null;
  site: string | null;
  observacoes: string | null;
  arquivada: boolean;
  negocios_abertos?: number;
  total_contatos?: number;
};

export type OrganizacaoDetalhe = Organizacao & { contatos: Contato[]; negocios: Negocio[] };

export type Hoje = {
  vencidos: Negocio[];
  hoje: Negocio[];
  proximos: Negocio[];
  sem_passo: Negocio[];
};

export type ResumoFunil = {
  por_etapa: Record<string, { quantidade: number; valor_mensal: number }>;
  abertos: number;
  valor_mensal_potencial: number;
  ganhos_30d: number;
  perdidos_30d: number;
  conversao_90d: number | null;
  vencidos: number;
  sem_passo: number;
  parados: number;
};

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarReais(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "—" : REAIS.format(valor);
}

// "2026-11-05" (ou ISO completo) → "05/11/2026", sem passar por fuso (a data é do calendário).
export function formatarDia(dia: string | null | undefined): string {
  if (!dia) return "—";
  const [ano, mes, d] = dia.slice(0, 10).split("-");
  return ano && mes && d ? `${d}/${mes}/${ano}` : "—";
}

export function hojeISO(agora: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(agora);
}

export type SituacaoPasso = "vencido" | "hoje" | "ok" | "sem";

// Compara só datas (AAAA-MM-DD), que ordenam como texto.
export function situacaoPasso(dia: string | null | undefined, hoje: string = hojeISO()): SituacaoPasso {
  if (!dia) return "sem";
  const d = dia.slice(0, 10);
  if (d < hoje) return "vencido";
  return d === hoje ? "hoje" : "ok";
}

export function porcentagem(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "—" : `${Math.round(valor * 100)}%`;
}

// Campos de texto opcionais vazios viram null; números vazios também.
export function numeroOuNulo(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}
