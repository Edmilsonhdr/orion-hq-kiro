"use client";

// Lista de Docs (spec docs, Requirement 5.2): barra lateral com pastas e tags (com contagem), busca com
// debounce (atalho "/"), cartões com trecho em texto puro e filtros ativos removíveis.
// Sem polling: recarrega ao entrar e quando os filtros mudam. Os filtros iniciais vêm da URL
// (?pasta=, ?tag=, ?q=), para os links do documento (migalhas) funcionarem.

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { obter } from "../../../lib/api";
import {
  formatarData,
  tempoRelativo,
  type DocumentoResumo,
  type Filtros,
  type NoArvore,
} from "../../../lib/docs";
import { textoPuro } from "../../../lib/markdown";

const DEBOUNCE_MS = 300;
const FILTROS_VAZIOS: Filtros = {
  pastas: [],
  tags: [],
  contagem_pastas: {},
  contagem_tags: {},
  total: 0,
};

// O backend marca o termo achado com « » (busca full-text); aqui vira <mark> (texto puro, sem HTML).
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

// Resultado de busca traz « »; listagem normal traz o começo do markdown (vira texto puro).
function trechoDe(d: DocumentoResumo): string {
  if (!d.trecho) return "";
  if (d.trecho.includes("«")) return d.trecho.replace(/\s+/g, " ");
  // A listagem traz só os 200 primeiros caracteres: se chegou no limite, o texto continua.
  const puro = textoPuro(d.trecho, 180);
  return d.trecho.length >= 200 && !puro.endsWith("…") ? `${puro.replace(/\S*$/, "").trimEnd()}…` : puro;
}

function IconeBusca() {
  return (
    <svg className="docs-busca-icone" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function DocsPage() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pasta, setPasta] = useState("");
  const [titulosPorId, setTitulosPorId] = useState<Record<number, string>>({});
  const [tag, setTag] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [docs, setDocs] = useState<DocumentoResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  // Filtros iniciais a partir da URL (depois da montagem, para não divergir do HTML do servidor).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPasta(params.get("pasta") ?? "");
    setTag(params.get("tag") ?? "");
    const q = params.get("q") ?? "";
    setBusca(q);
    setTermo(q.trim());
  }, []);

  useEffect(() => {
    obter<NoArvore[]>("/documentos/arvore")
      .then((a) => setTitulosPorId(Object.fromEntries(a.map((n) => [n.id, n.titulo]))))
      .catch(() => {
        // o "dentro de" do cartão é só uma conveniência
      });
    obter<Filtros>("/documentos/pastas")
      .then(setFiltros)
      .catch(() => {
        // a barra lateral é só uma conveniência; a lista segue funcionando sem ela
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [busca]);

  // "/" foca a busca (fora de campos de texto).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (e.key === "/" && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        campoBusca.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

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

  // Na busca, o backend ignora pasta e tag; avisamos para não parecer que o filtro falhou.
  const buscando = termo.length > 0;
  const filtrando = !!(pasta || tag);

  function limparTudo() {
    setBusca("");
    setTermo("");
    setPasta("");
    setTag("");
  }

  return (
    <div className="docs-pagina">
      <div className="docs-topo">
        <h1 className="titulo-pixel" style={{ margin: 0, fontSize: "20px" }}>
          Docs
        </h1>
        <div className="docs-busca">
          <IconeBusca />
          <input
            ref={campoBusca}
            type="search"
            aria-label="Buscar nos documentos"
            placeholder="Buscar em título e conteúdo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {!busca && <kbd aria-hidden="true">/</kbd>}
        </div>
        <Link
          href="/docs/novo"
          className="botao botao-destaque"
          style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          + Novo documento
        </Link>
      </div>

      <div className="docs-grade">
        <aside className="docs-lateral" aria-label="Pastas e tags">
          <div>
            <p className="docs-secao-titulo">Pastas</p>
            <nav className="docs-nav">
              <button
                type="button"
                className="docs-nav-item"
                aria-current={!pasta ? "true" : undefined}
                onClick={() => setPasta("")}
              >
                <span>Todos os documentos</span>
                <span className="docs-nav-contagem">{filtros.total}</span>
              </button>
              {filtros.pastas.map((p) => {
                const partes = p.split(" / ");
                return (
                  <button
                    key={p}
                    type="button"
                    className="docs-nav-item"
                    aria-current={pasta === p ? "true" : undefined}
                    onClick={() => setPasta(pasta === p ? "" : p)}
                    title={p}
                    style={{ paddingLeft: `${10 + (partes.length - 1) * 14}px` }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {partes[partes.length - 1]}
                    </span>
                    <span className="docs-nav-contagem">{filtros.contagem_pastas[p] ?? ""}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {filtros.tags.length > 0 && (
            <div>
              <p className="docs-secao-titulo">Tags</p>
              <div className="docs-etiquetas">
                {filtros.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="docs-etiqueta-botao"
                    aria-pressed={tag === t}
                    onClick={() => setTag(tag === t ? "" : t)}
                  >
                    #{t}
                    <span style={{ opacity: 0.6, marginLeft: 4 }}>{filtros.contagem_tags[t] ?? ""}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="texto-secundario" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 10px", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={arquivados}
              onChange={(e) => setArquivados(e.target.checked)}
              style={{ minHeight: "auto" }}
            />
            Mostrar arquivados
          </label>
        </aside>

        <section aria-live="polite">
          {(filtrando || buscando) && (
            <div className="docs-filtros-ativos">
              <span>Filtrando por</span>
              {buscando && (
                <button type="button" className="docs-filtro-ativo" onClick={() => { setBusca(""); setTermo(""); }}>
                  “{termo}” ✕
                </button>
              )}
              {pasta && !buscando && (
                <button type="button" className="docs-filtro-ativo" onClick={() => setPasta("")}>
                  pasta: {pasta} ✕
                </button>
              )}
              {tag && !buscando && (
                <button type="button" className="docs-filtro-ativo" onClick={() => setTag("")}>
                  #{tag} ✕
                </button>
              )}
              {buscando && filtrando && <span>(na busca, pasta e tag não filtram)</span>}
            </div>
          )}

          {erro && (
            <p role="alert" className="doc-erro">
              {erro}
            </p>
          )}

          {docs === null && !erro && (
            <div className="docs-lista" aria-busy="true">
              <div className="docs-esqueleto" />
              <div className="docs-esqueleto" />
              <div className="docs-esqueleto" />
            </div>
          )}

          {docs !== null && docs.length === 0 && (
            <div className="docs-vazio">
              {buscando || filtrando ? (
                <>
                  <strong>Nada encontrado</strong>
                  <p style={{ margin: "0 0 14px" }}>
                    {buscando ? `Nenhum documento corresponde a “${termo}”.` : "Nenhum documento nesta seleção."}
                  </p>
                  <button type="button" onClick={limparTudo}>
                    Limpar filtros
                  </button>
                </>
              ) : (
                <>
                  <strong>Nenhum documento ainda</strong>
                  <p style={{ margin: "0 0 14px" }}>
                    Escreva o primeiro, ou peça no chat para os agentes proporem um. Eles também consultam o
                    que você escrever aqui.
                  </p>
                  <Link href="/docs/novo" className="botao botao-destaque" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                    + Novo documento
                  </Link>
                </>
              )}
            </div>
          )}

          <ul className="docs-lista">
            {docs?.map((d) => {
              const trecho = trechoDe(d);
              return (
                <li key={d.id}>
                  <Link href={`/docs/${d.id}`} className="docs-cartao" data-arquivado={d.arquivado}>
                    <h2 className="docs-cartao-titulo">{d.titulo}</h2>
                    {trecho && (
                      <p className="docs-cartao-trecho doc-trecho">
                        <Trecho texto={trecho} />
                      </p>
                    )}
                    <div className="docs-cartao-meta">
                      {d.arquivado && <span className="doc-etiqueta">arquivado</span>}
                      {d.pai_id !== null && titulosPorId[d.pai_id] && (
                        <span className="doc-etiqueta" title="Subpágina de">
                          ↳ {titulosPorId[d.pai_id]}
                        </span>
                      )}
                      {d.pasta && <span className="doc-etiqueta">{d.pasta}</span>}
                      {d.tags.map((t) => (
                        <span key={t} className="mono">
                          #{t}
                        </span>
                      ))}
                      <span style={{ marginLeft: "auto" }} title={formatarData(d.atualizado_em)}>
                        {d.autor} · {tempoRelativo(d.atualizado_em)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
