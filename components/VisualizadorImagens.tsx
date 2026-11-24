"use client";

// Visualizador de imagens em tela cheia, como no Jira: fundo escuro, nome e tamanho no topo, baixar e fechar à
// direita, setas (e ← →) para passar entre as imagens da tarefa. Clicar na imagem alterna entre caber na tela e o
// tamanho real. Esc ou clicar fora fecha.

import { useEffect, useState } from "react";
import { formatarTamanho, type Anexo } from "../lib/comercial";

type Props = { lista: Anexo[]; inicial: number; onFechar: () => void };

export default function VisualizadorImagens({ lista, inicial, onFechar }: Props) {
  const [i, setI] = useState(Math.max(0, lista.findIndex((a) => a.id === inicial)));
  const [real, setReal] = useState(false);
  const atual = lista[i];

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onFechar();
      } else if (e.key === "ArrowRight") setI((n) => Math.min(lista.length - 1, n + 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    }
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [lista.length, onFechar]);

  useEffect(() => setReal(false), [i]);

  if (!atual) return null;
  const src = `/api/anexos/${atual.id}`;

  return (
    <div className="vis" role="dialog" aria-modal="true" aria-label={`Imagem ${atual.nome}`} onClick={onFechar}>
      <header className="vis-topo" onClick={(e) => e.stopPropagation()}>
        <span className="vis-icone" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="m21 16-5-5-9 9" />
          </svg>
        </span>
        <span className="vis-nome">
          <strong>{atual.nome}</strong>
          <span>
            imagem · {formatarTamanho(atual.tamanho)}
            {lista.length > 1 && ` · ${i + 1} de ${lista.length}`}
          </span>
        </span>
        <a className="vis-botao" href={src} download={atual.nome} title="Baixar" aria-label="Baixar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
        </a>
        <button type="button" className="vis-botao" onClick={onFechar} title="Fechar (Esc)" aria-label="Fechar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div className={`vis-palco${real ? " real" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={atual.id}
          src={src}
          alt={atual.nome}
          title={real ? "Clique para caber na tela" : "Clique para ver no tamanho real"}
          onClick={(e) => {
            e.stopPropagation();
            setReal((r) => !r);
          }}
        />
      </div>

      {i > 0 && (
        <button type="button" className="vis-seta esquerda" aria-label="Imagem anterior" onClick={(e) => (e.stopPropagation(), setI(i - 1))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
      )}
      {i < lista.length - 1 && (
        <button type="button" className="vis-seta direita" aria-label="Próxima imagem" onClick={(e) => (e.stopPropagation(), setI(i + 1))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
