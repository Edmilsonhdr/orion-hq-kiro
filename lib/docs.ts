// Tipos e utilitários do módulo Docs (spec docs). As chamadas usam `obter`/`enviar`/`atualizar`
// de `lib/api.ts`, que já tratam 401 e mensagens de erro em português.

export type DocumentoResumo = {
  id: number;
  titulo: string;
  pasta: string | null;
  tags: string[];
  autor: string;
  arquivado: boolean;
  criado_em: string;
  atualizado_em: string;
  // Início do conteúdo (listagem) ou trecho da busca, com o termo entre « ».
  trecho?: string;
};

export type Documento = DocumentoResumo & { conteudo: string };

export type VersaoResumo = {
  id: number;
  documento_id: number;
  titulo: string;
  editado_por: string;
  criado_em: string;
};

export type Versao = VersaoResumo & { conteudo: string };

export type DadosDocumento = {
  titulo: string;
  conteudo: string;
  pasta: string | null;
  tags: string[];
};

export type Filtros = { pastas: string[]; tags: string[] };

export function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "api, MVP ,api" -> ["api", "mvp"] (o backend normaliza de novo; isto só limpa a digitação).
export function tagsDoTexto(texto: string): string[] {
  const vistas: string[] = [];
  for (const parte of texto.split(",")) {
    const tag = parte.trim().toLowerCase();
    if (tag && !vistas.includes(tag)) vistas.push(tag);
  }
  return vistas;
}
