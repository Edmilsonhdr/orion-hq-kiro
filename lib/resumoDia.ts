// "Seu dia": junta o que precisa de atenção hoje (aprovações, Comercial, pilotos, menções, incidentes)
// em uma lista curta e priorizada. Só monta os textos; quem busca os dados é a página.

export type ItemDia = {
  chave: string;
  texto: string;
  href: string;
  alerta: boolean;
  detalhes: string[];
};

type NegocioCurto = { id: number; titulo: string; organizacao_nome: string };

export type EntradaDia = {
  aprovacoes: number;
  vencidos: NegocioCurto[];
  hoje: NegocioCurto[];
  parados: (NegocioCurto & { dias_parado?: number })[];
  pilotos: { organizacao_nome: string; dias_no_piloto: number }[];
  mencoes: number;
  incidentes: number;
  // minhas tarefas (do quadro de Tarefas)
  tarefasVencidas?: string[];
  tarefasHoje?: string[];
};

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

const nomes = (l: NegocioCurto[]) => l.slice(0, 3).map((n) => n.organizacao_nome);

export function resumoDoDia(e: EntradaDia): ItemDia[] {
  const itens: ItemDia[] = [];
  if (e.incidentes > 0)
    itens.push({ chave: "incidentes", texto: `${plural(e.incidentes, "incidente aberto", "incidentes abertos")}`, href: "/incidentes", alerta: true, detalhes: [] });
  const tv = e.tarefasVencidas ?? [];
  if (tv.length > 0)
    itens.push({ chave: "tarefas-vencidas", texto: `${plural(tv.length, "tarefa sua vencida", "tarefas suas vencidas")}`, href: "/tarefas", alerta: true, detalhes: tv.slice(0, 3) });
  if (e.vencidos.length > 0)
    itens.push({ chave: "vencidos", texto: `${plural(e.vencidos.length, "passo vencido", "passos vencidos")} no Comercial`, href: "/comercial", alerta: true, detalhes: nomes(e.vencidos) });
  if (e.aprovacoes > 0)
    itens.push({ chave: "aprovacoes", texto: `${plural(e.aprovacoes, "aprovação esperando", "aprovações esperando")} você`, href: "/aprovacoes", alerta: false, detalhes: [] });
  if (e.hoje.length > 0)
    itens.push({ chave: "hoje", texto: `${plural(e.hoje.length, "passo marcado", "passos marcados")} para hoje`, href: "/comercial", alerta: false, detalhes: nomes(e.hoje) });
  const th = e.tarefasHoje ?? [];
  if (th.length > 0)
    itens.push({ chave: "tarefas-hoje", texto: `${plural(th.length, "tarefa sua", "tarefas suas")} para hoje`, href: "/tarefas", alerta: false, detalhes: th.slice(0, 3) });
  if (e.parados.length > 0)
    itens.push({ chave: "parados", texto: `${plural(e.parados.length, "negócio parado", "negócios parados")} há mais de 7 dias`, href: "/comercial", alerta: false, detalhes: nomes(e.parados) });
  if (e.pilotos.length > 0) {
    const maisAntigo = Math.max(...e.pilotos.map((p) => p.dias_no_piloto));
    itens.push({
      chave: "pilotos",
      texto: `${plural(e.pilotos.length, "piloto em andamento", "pilotos em andamento")}${maisAntigo > 0 ? ` (o mais antigo há ${plural(maisAntigo, "dia", "dias")})` : ""}`,
      href: "/comercial?aba=pilotos",
      alerta: false,
      detalhes: e.pilotos.slice(0, 3).map((p) => p.organizacao_nome),
    });
  }
  if (e.mencoes > 0)
    itens.push({ chave: "mencoes", texto: `${plural(e.mencoes, "menção a você", "menções a você")} nos documentos`, href: "/docs", alerta: false, detalhes: [] });
  return itens;
}
