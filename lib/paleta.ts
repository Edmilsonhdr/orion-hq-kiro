// Itens da paleta de comandos (Ctrl+K): atalhos fixos e filtro sem acento nem caixa.

export type ItemPaleta = { id: string; rotulo: string; href: string; grupo: string; dica?: string };

export const ATALHOS: readonly ItemPaleta[] = [
  { id: "nova-pagina", rotulo: "Nova página", href: "/docs/novo", grupo: "Ações", dica: "Docs" },
  { id: "novo-negocio", rotulo: "Novo negócio", href: "/comercial", grupo: "Ações", dica: "Comercial" },
  { id: "ir-chat", rotulo: "Ir para o Chat", href: "/chat", grupo: "Ir para" },
  { id: "ir-escritorio", rotulo: "Ir para o Escritório", href: "/escritorio", grupo: "Ir para" },
  { id: "ir-comercial", rotulo: "Ir para o Comercial", href: "/comercial", grupo: "Ir para" },
  { id: "ir-docs", rotulo: "Ir para os Docs", href: "/docs", grupo: "Ir para" },
  { id: "ir-incidentes", rotulo: "Ir para os Incidentes", href: "/incidentes", grupo: "Ir para" },
  { id: "ir-aprovacoes", rotulo: "Ir para as Aprovações", href: "/aprovacoes", grupo: "Ir para" },
];

export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Atalhos que contêm todas as palavras da consulta (sem acento). Consulta vazia: os de "Ações".
export function filtrarAtalhos(consulta: string, atalhos: readonly ItemPaleta[] = ATALHOS): ItemPaleta[] {
  const termos = semAcento(consulta).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return atalhos.filter((a) => a.grupo === "Ações");
  return atalhos.filter((a) => {
    const alvo = semAcento(a.rotulo);
    return termos.every((t) => alvo.includes(t));
  });
}

export type ResultadoBusca = {
  documentos: { id: number; titulo: string; pasta: string | null }[];
  negocios: { id: number; titulo: string; organizacao: string; etapa: string }[];
  organizacoes: { id: number; nome: string; tipo: string }[];
};

// Une atalhos e resultados numa lista plana, na ordem em que aparecem na tela.
export function montarItens(consulta: string, busca: ResultadoBusca | null): ItemPaleta[] {
  const itens: ItemPaleta[] = [];
  for (const d of busca?.documentos ?? [])
    itens.push({ id: `doc-${d.id}`, rotulo: d.titulo, href: `/docs/${d.id}`, grupo: "Documentos", dica: d.pasta ?? undefined });
  for (const n of busca?.negocios ?? [])
    itens.push({ id: `neg-${n.id}`, rotulo: n.titulo, href: `/comercial/negocios/${n.id}`, grupo: "Negócios", dica: n.organizacao });
  for (const o of busca?.organizacoes ?? [])
    itens.push({ id: `org-${o.id}`, rotulo: o.nome, href: `/comercial/organizacoes/${o.id}`, grupo: "Organizações" });
  return [...itens, ...filtrarAtalhos(consulta)];
}
