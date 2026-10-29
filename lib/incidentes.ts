// Incidentes novos por dia (pela data da primeira ocorrência), para o gráfico da tela de Incidentes.

export type PontoDia = { dia: string; rotulo: string; total: number };

function chaveDia(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

export function incidentesPorDia(lista: { primeira_vez: string }[], dias = 14, agora = new Date()): PontoDia[] {
  const pontos: PontoDia[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
    pontos.push({ dia: chaveDia(d), rotulo: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, total: 0 });
  }
  const indice = new Map(pontos.map((p) => [p.dia, p]));
  for (const inc of lista) {
    const quando = new Date(inc.primeira_vez);
    if (Number.isNaN(quando.getTime())) continue;
    const p = indice.get(chaveDia(quando));
    if (p) p.total += 1;
  }
  return pontos;
}
