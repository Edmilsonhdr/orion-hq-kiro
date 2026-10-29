"use client";

// Resolve um link [[Título]]: abre a página com esse título (ou a busca, se não houver correspondência exata).

import { useEffect, useState } from "react";
import Link from "next/link";
import { obter } from "../../../../lib/api";
import type { DocumentoResumo } from "../../../../lib/docs";

export default function IrParaPagina() {
  const [titulo, setTitulo] = useState<string | null>(null);
  const [candidatas, setCandidatas] = useState<DocumentoResumo[] | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("titulo") ?? "";
    setTitulo(t);
    if (!t) return;
    obter<DocumentoResumo[]>(`/documentos?q=${encodeURIComponent(t)}`)
      .then((lista) => {
        const exata = lista.find((d) => d.titulo.trim().toLowerCase() === t.trim().toLowerCase());
        if (exata) window.location.replace(`/docs/${exata.id}`);
        else setCandidatas(lista);
      })
      .catch(() => setCandidatas([]));
  }, []);

  return (
    <div className="docs-pagina pagina-estreita">
      <h1 className="titulo-pixel com-titulo">{titulo ? `“${titulo}”` : "Link para página"}</h1>
      {candidatas === null ? (
        <p className="texto-secundario">Procurando a página…</p>
      ) : (
        <div className="docs-vazio">
          <strong>Não encontrei uma página com esse título</strong>
          {candidatas.length > 0 && (
            <ul style={{ textAlign: "left", margin: "10px auto", maxWidth: 420 }}>
              {candidatas.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <Link href={`/docs/${d.id}`}>{d.titulo}</Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/docs/novo`} className="botao botao-destaque" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Criar a página
          </Link>
        </div>
      )}
    </div>
  );
}
