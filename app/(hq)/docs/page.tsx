"use client";

// Lista de Docs: busca com debounce, filtros de pasta e tag, arquivados e "Novo documento"
// (spec docs, Requirement 5.2). Sem polling: recarrega ao entrar e quando os filtros mudam.

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { obter } from "../../../lib/api";
import {
  formatarData,
  type DocumentoResumo,
  type Filtros,
} from "../../../lib/docs";

const DEBOUNCE_MS = 300;

// O backend marca o termo achado com « »; aqui vira <mark> (texto puro, sem HTML).
function Trecho({ texto }: { texto: string }) {
  const partes = texto.split(/(«[^»]*»)/);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("«") && p.endsWith("»") ? (
          <mark key={i}>{p.slice(1, -1)}</mark>
        ) : (
          <Fragment key={i}>{p.replace(/[«»]/g, "")}</Fragment>
        ),
      )}
    </>
  );
}

export default function DocsPage() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pasta, setPasta] = useState("");
  const [tag, setTag] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({ pastas: [], tags: [] });
  const [docs, setDocs] = useState<DocumentoResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    obter<Filtros>("/documentos/pastas")
      .then(setFiltros)
      .catch(() => {
        // filtros são só uma conveniência; a lista segue funcionando sem eles
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let ativo = true;
    const params = new URLSearchParams();
    if (termo) params.set("q", termo);
    if (pasta) params.set("pasta", pasta);
    if (tag) params.set("tag", tag);
    if (arquivados) params.set("arquivados", "true");
    const consulta = params.toString();

    obter<DocumentoResumo[]>(`/documentos${consulta ? `?${consulta}` : ""}`)
      .then((lista) => {
        if (!ativo) return;
        setDocs(lista);
        setErro(null);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Erro ao carregar os documentos.");
      });
    return () => {
      ativo = false;
    };
  }, [termo, pasta, tag, arquivados]);

  // Na busca, o backend ignora pasta/tag; avisamos para não parecer que o filtro falhou.
  const buscando = termo.length > 0;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <h1 style={{ margin: 0, fontSize: "22px", flex: 1 }}>Docs</h1>
        <Link
          href="/docs/novo"
          className="botao botao-destaque"
          style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
        >
          Novo documento
        </Link>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "8px" }}>
        <input
          type="search"
          aria-label="Buscar nos documentos"
          placeholder="Buscar em título e conteúdo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ flex: "2 1 260px" }}
        />
        <select
          aria-label="Filtrar por pasta"
          value={pasta}
          onChange={(e) => setPasta(e.target.value)}
          disabled={buscando}
          style={{ flex: "1 1 140px", minHeight: "44px" }}
        >
          <option value="">Todas as pastas</option>
          {filtros.pastas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          disabled={buscando}
          style={{ flex: "1 1 140px", minHeight: "44px" }}
        >
          <option value="">Todas as tags</option>
          {filtros.tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <label className="texto-secundario" style={{ display: "inline-flex", gap: "8px", marginBottom: "16px" }}>
        <input
          type="checkbox"
          checked={arquivados}
          onChange={(e) => setArquivados(e.target.checked)}
          style={{ minHeight: "auto" }}
        />
        Mostrar arquivados
      </label>
      {buscando && (pasta || tag) && (
        <p className="texto-secundario" style={{ marginTop: 0 }}>
          Na busca, os filtros de pasta e tag ficam desligados.
        </p>
      )}

      {erro && (
        <p role="alert" style={{ color: "#FF7A59" }}>
          {erro}
        </p>
      )}

      {docs === null && !erro && <p className="texto-secundario">Carregando…</p>}

      {docs !== null && docs.length === 0 && (
        <div className="painel" style={{ padding: "24px", textAlign: "center" }}>
          <p style={{ margin: 0 }}>
            {buscando ? `Nenhum documento encontrado para “${termo}”.` : "Nenhum documento ainda."}
          </p>
          {!buscando && (
            <p className="texto-secundario" style={{ marginBottom: 0 }}>
              Crie o primeiro em “Novo documento”. Os agentes consultam o que você escrever aqui.
            </p>
          )}
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "10px" }}>
        {docs?.map((d) => (
          <li key={d.id}>
            <Link
              href={`/docs/${d.id}`}
              className="painel"
              style={{
                display: "block",
                padding: "14px 16px",
                textDecoration: "none",
                color: "var(--texto)",
                opacity: d.arquivado ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "17px" }}>{d.titulo}</strong>
                {d.arquivado && <span className="doc-etiqueta">arquivado</span>}
                {d.pasta && <span className="doc-etiqueta">{d.pasta}</span>}
                {d.tags.map((t) => (
                  <span key={t} className="doc-etiqueta mono">
                    #{t}
                  </span>
                ))}
              </div>
              {d.trecho && (
                <p
                  className="texto-secundario doc-trecho"
                  style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}
                >
                  <Trecho texto={d.trecho} />
                </p>
              )}
              <p className="texto-secundario mono" style={{ margin: "6px 0 0", fontSize: "12px" }}>
                {d.autor} · atualizado em {formatarData(d.atualizado_em)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
