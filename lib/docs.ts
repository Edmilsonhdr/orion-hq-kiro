// Tipos e utilitários do módulo Docs (spec docs). As chamadas usam `obter`/`enviar`/`atualizar`
// de `lib/api.ts`, que já tratam 401 e mensagens de erro em português.

export type DocumentoResumo = {
  id: number;
  titulo: string;
  pasta: string | null;
  pai_id: number | null;
  tags: string[];
  autor: string;
  arquivado: boolean;
  criado_em: string;
  atualizado_em: string;
  // Início do conteúdo (listagem) ou trecho da busca, com o termo entre « ».
  trecho?: string;
};

export type Ancestral = { id: number; titulo: string };

export type Documento = DocumentoResumo & {
  conteudo: string;
  // Só no detalhe: caminho da raiz até o pai e as subpáginas (não arquivadas).
  ancestrais?: Ancestral[];
  subpaginas?: DocumentoResumo[];
};

export type NoArvore = { id: number; titulo: string; pai_id: number | null; pasta: string | null };

export type OpcaoPai = { id: number; rotulo: string };

// Opções do seletor "Página pai", em ordem de árvore e com recuo. Sem o próprio documento nem os
// descendentes dele (não dá para mover uma página para dentro de si mesma).
export function opcoesPai(arvore: NoArvore[], excluirId?: number): OpcaoPai[] {
  const filhos = new Map<number | null, NoArvore[]>();
  for (const no of arvore) {
    const lista = filhos.get(no.pai_id) ?? [];
    lista.push(no);
    filhos.set(no.pai_id, lista);
  }
  const ids = new Set(arvore.map((n) => n.id));
  const saida: OpcaoPai[] = [];
  const visitar = (pai: number | null, nivel: number) => {
    for (const no of filhos.get(pai) ?? []) {
      if (no.id === excluirId) continue;
      saida.push({ id: no.id, rotulo: `${"— ".repeat(nivel)}${no.titulo}` });
      visitar(no.id, nivel + 1);
    }
  };
  visitar(null, 0);
  // Documentos cujo pai não está na árvore (ex.: arquivado) entram como se fossem de topo.
  for (const no of arvore) {
    if (no.pai_id !== null && !ids.has(no.pai_id) && no.id !== excluirId) {
      saida.push({ id: no.id, rotulo: no.titulo });
      visitar(no.id, 1);
    }
  }
  return saida;
}

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
  pai_id: number | null;
  tags: string[];
};

export type Filtros = {
  pastas: string[];
  tags: string[];
  contagem_pastas: Record<string, number>;
  contagem_tags: Record<string, number>;
  total: number;
};

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

// "há 5 min", "há 3 h", "ontem"… ; datas mais antigas em dd/mm/aaaa.
export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const segundos = Math.round((agora.getTime() - data.getTime()) / 1000);
  if (segundos < 45) return "agora há pouco";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function contarPalavras(texto: string): number {
  const palavras = texto.trim().match(/\S+/g);
  return palavras ? palavras.length : 0;
}

// Limite do conteúdo (igual ao backend: `documentos.CONTEUDO_MAX`).
export const CONTEUDO_MAX = 200_000;
