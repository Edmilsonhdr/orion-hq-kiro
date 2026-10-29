"use client";

// Sumário lateral do documento (só aparece em telas largas): links para os títulos e destaque do
// título visível. Some se o documento tiver menos de 2 títulos.

import { useEffect, useMemo, useState } from "react";
import { extrairTitulos, parseMarkdown } from "../lib/markdown";

export default function Sumario({ texto }: { texto: string }) {
  const titulos = useMemo(() => extrairTitulos(parseMarkdown(texto)), [texto]);
  const [ativo, setAtivo] = useState<string | null>(null);

  useEffect(() => {
    if (titulos.length < 2 || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.find((e) => e.isIntersecting);
        if (visivel) setAtivo(visivel.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const t of titulos) {
      const el = document.getElementById(t.id);
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [titulos]);

  if (titulos.length < 2) return null;

  const menor = Math.min(...titulos.map((t) => t.nivel));
  return (
    <nav className="doc-sumario" aria-label="Neste documento">
      <p className="docs-secao-titulo" style={{ padding: 0 }}>
        Neste documento
      </p>
      <ul>
        {titulos.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              aria-current={ativo === t.id ? "true" : undefined}
              style={{ paddingLeft: `${12 + (t.nivel - menor) * 12}px` }}
            >
              {t.texto}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
