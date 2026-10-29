"use client";

// Editor de documento: título, pasta, tags e markdown com pré-visualização (spec docs, 5.3/5.6).
// O texto fica em estado local e só some quando o salvamento der certo: erro de API mostra a
// mensagem sem perder o que foi digitado.

import { useState } from "react";
import Markdown from "./Markdown";
import { tagsDoTexto, type DadosDocumento } from "../lib/docs";

type Props = {
  inicial: DadosDocumento;
  pastasSugeridas: string[];
  rotuloSalvar?: string;
  onSalvar: (dados: DadosDocumento) => Promise<void>;
  onCancelar: () => void;
};

export default function DocEditor({
  inicial,
  pastasSugeridas,
  rotuloSalvar = "Salvar",
  onSalvar,
  onCancelar,
}: Props) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [conteudo, setConteudo] = useState(inicial.conteudo);
  const [pasta, setPasta] = useState(inicial.pasta ?? "");
  const [tags, setTags] = useState(inicial.tags.join(", "));
  const [verPrevia, setVerPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({
        titulo,
        conteudo,
        pasta: pasta.trim() || null,
        tags: tagsDoTexto(tags),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <input
        aria-label="Título"
        placeholder="Título do documento"
        value={titulo}
        maxLength={200}
        onChange={(e) => setTitulo(e.target.value)}
        style={{ fontSize: "20px" }}
      />

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <input
          aria-label="Pasta"
          placeholder="Pasta (opcional)"
          list="docs-pastas"
          value={pasta}
          maxLength={100}
          onChange={(e) => setPasta(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <datalist id="docs-pastas">
          {pastasSugeridas.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <input
          aria-label="Tags"
          placeholder="Tags separadas por vírgula"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          style={{ flex: "2 1 260px" }}
        />
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => setVerPrevia(false)}
          aria-pressed={!verPrevia}
          style={{ borderColor: !verPrevia ? "var(--destaque)" : undefined }}
        >
          Escrever
        </button>
        <button
          type="button"
          onClick={() => setVerPrevia(true)}
          aria-pressed={verPrevia}
          style={{ borderColor: verPrevia ? "var(--destaque)" : undefined }}
        >
          Pré-visualizar
        </button>
      </div>

      {verPrevia ? (
        <div className="painel" style={{ padding: "16px 20px", minHeight: "420px" }}>
          <Markdown texto={conteudo} />
        </div>
      ) : (
        <textarea
          className="doc-texto mono"
          aria-label="Conteúdo em markdown"
          placeholder="Escreva em markdown: # título, **negrito**, - lista, `código`…"
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
        />
      )}

      {erro && (
        <p role="alert" style={{ color: "#FF7A59", margin: 0 }}>
          {erro}
        </p>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          className="botao-destaque"
          onClick={salvar}
          disabled={salvando || !titulo.trim()}
        >
          {salvando ? "Salvando…" : rotuloSalvar}
        </button>
        <button type="button" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
