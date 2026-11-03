// Calendário: helpers de data (sempre AAAA-MM-DD, sem fuso: o dia de Brasília vem pronto da API).

export type TipoItem = "tarefa" | "negocio" | "reuniao";
export type Visao = "mes" | "semana";

export type ItemCal = {
  tipo: TipoItem;
  id: number;
  titulo: string;
  data: string;
  hora: string | null;
  detalhe: string | null;
  responsavel: string | null;
  feito: boolean;
  href: string | null;
  ics: string | null;
};

export type AgendaResumo = {
  hoje: string;
  atrasados: ItemCal[];
  de_hoje: ItemCal[];
  proximos: ItemCal[];
};

export const ROTULO_TIPO: Record<TipoItem, string> = {
  tarefa: "Tarefas",
  negocio: "Comercial",
  reuniao: "Reuniões",
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Meio-dia UTC: somar dias nunca cai no dia errado por causa de horário de verão.
const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const paraISO = (d: Date) => d.toISOString().slice(0, 10);

export function somarDias(iso: string, dias: number): string {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraISO(d);
}

export function inicioDaSemana(iso: string): string {
  return somarDias(iso, -paraData(iso).getUTCDay());
}

export function mesDe(iso: string): number {
  return paraData(iso).getUTCMonth();
}

// Dias exibidos: o mês inteiro completado até fechar as semanas (domingo a sábado), ou a semana do dia.
export function diasVisiveis(ref: string, visao: Visao): string[] {
  let inicio: string;
  let total: number;
  if (visao === "semana") {
    inicio = inicioDaSemana(ref);
    total = 7;
  } else {
    const primeiro = `${ref.slice(0, 7)}-01`;
    const d = paraData(primeiro);
    const ultimo = paraISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
    inicio = inicioDaSemana(primeiro);
    total = Math.ceil((paraData(somarDias(inicioDaSemana(ultimo), 6)).getTime() - paraData(inicio).getTime()) / 86_400_000 + 1);
  }
  return Array.from({ length: total }, (_, i) => somarDias(inicio, i));
}

export function deslocar(ref: string, visao: Visao, sentido: 1 | -1): string {
  if (visao === "semana") return somarDias(ref, 7 * sentido);
  const d = paraData(`${ref.slice(0, 7)}-01`);
  return paraISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + sentido, 1, 12)));
}

export function tituloPeriodo(ref: string, visao: Visao): string {
  if (visao === "mes") return `${MESES[mesDe(ref)]} de ${ref.slice(0, 4)}`;
  const dias = diasVisiveis(ref, "semana");
  const [a, b] = [dias[0], dias[6]];
  const mes = (iso: string) => MESES[mesDe(iso)].slice(0, 3);
  const dia = (iso: string) => Number(iso.slice(8));
  return mesDe(a) === mesDe(b)
    ? `${dia(a)} a ${dia(b)} de ${MESES[mesDe(b)]} de ${b.slice(0, 4)}`
    : `${dia(a)} de ${mes(a)}. a ${dia(b)} de ${mes(b)}. de ${b.slice(0, 4)}`;
}

export function diaPorExtenso(iso: string): string {
  const d = paraData(iso);
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function agruparPorDia(itens: readonly ItemCal[]): Map<string, ItemCal[]> {
  const mapa = new Map<string, ItemCal[]>();
  for (const i of itens) {
    const lista = mapa.get(i.data) ?? [];
    lista.push(i);
    mapa.set(i.data, lista);
  }
  return mapa;
}

export function atrasado(item: ItemCal, hoje: string): boolean {
  return item.tipo !== "reuniao" && !item.feito && item.data < hoje;
}

// Filtros da tela: tipos ligados e "só meus" (reuniões entram quando você é participante).
export function filtrar(itens: readonly ItemCal[], tipos: ReadonlySet<TipoItem>, usuario: string | null): ItemCal[] {
  return itens.filter((i) => {
    if (!tipos.has(i.tipo)) return false;
    if (!usuario) return true;
    if (i.tipo === "reuniao") return (i.detalhe ?? "").split(",").map((p) => p.trim()).includes(usuario);
    return i.responsavel === usuario;
  });
}
