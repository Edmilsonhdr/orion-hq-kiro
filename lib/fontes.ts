// "Consultou…" das respostas do chat: traduz as atividades `ferramenta` (ex.: "ler_documento(documento_id=12)")
// em fontes legíveis, com link quando a ferramenta apontou para um documento específico.

export type Fonte = { rotulo: string; href?: string };

const ROTULO_FERRAMENTA: Record<string, string> = {
  buscar_documentos: "documentos",
  ler_documento: "documentos",
  resumo_funil: "funil comercial",
  buscar_negocios: "negócios",
  ver_negocio: "negócios",
  negocios_parados: "negócios parados",
  agenda_comercial: "agenda comercial",
};

export function fontesDe(detalhes: string[]): Fonte[] {
  const fontes: Fonte[] = [];
  const vistos = new Set<string>();
  const docs: string[] = [];

  for (const detalhe of detalhes) {
    const nome = detalhe.split("(")[0].trim();
    if (nome === "ler_documento") {
      const id = /documento_id\D{0,3}(\d+)/.exec(detalhe)?.[1];
      if (id && !docs.includes(id)) docs.push(id);
      continue;
    }
    const rotulo = ROTULO_FERRAMENTA[nome];
    if (rotulo && !vistos.has(rotulo)) {
      vistos.add(rotulo);
      fontes.push({ rotulo });
    }
  }

  // Documentos lidos: um link por documento ("documento #12"), antes das demais fontes.
  const links: Fonte[] = docs.map((id) => ({ rotulo: `documento #${id}`, href: `/docs/${id}` }));
  const semLeitura = fontes.filter((f) => !(f.rotulo === "documentos" && links.length > 0));
  return [...links, ...semLeitura];
}
