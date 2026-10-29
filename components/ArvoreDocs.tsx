"use client";

// Árvore de páginas na lateral do Docs. Arrastar uma página sobre outra: no terço de cima ela vai para
// antes, no meio vira subpágina, no terço de baixo vai para depois. Pelo teclado: Alt+↑ / Alt+↓ na página
// sobem e descem entre as irmãs. A API valida ciclos e profundidade; erros voltam como aviso.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { NoArvore } from "../lib/docs";
import { achatar, destinoDoArrasto, montarArvore, type Zona } from "../lib/arvore";

type Props = {
  nos: NoArvore[];
  onMover: (id: number, paiId: number | null, posicao: number) => Promise<void>;
};

export default function ArvoreDocs({ nos, onMover }: Props) {
  const raiz = useMemo(() => montarArvore(nos), [nos]);
  const [fechados, setFechados] = useState<Set<number>>(new Set());
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<{ id: number; zona: Zona } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const abertos = useMemo(() => new Set(nos.filter((n) => !fechados.has(n.id)).map((n) => n.id)), [nos, fechados]);
  const linhas = useMemo(() => achatar(raiz, abertos), [raiz, abertos]);

  async function mover(id: number, paiId: number | null, posicao: number) {
    setAviso(null);
    try {
      await onMover(id, paiId, posicao);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível mover a página.");
    }
  }

  function zonaDe(e: React.DragEvent<HTMLElement>): Zona {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.3 ? "antes" : y > 0.7 ? "depois" : "dentro";
  }

  function aoTeclar(e: React.KeyboardEvent, id: number) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const no = nos.find((n) => n.id === id);
    if (!no) return;
    const irmas = nos.filter((n) => n.pai_id === no.pai_id);
    const i = irmas.findIndex((n) => n.id === id);
    const alvo = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (alvo < 0 || alvo >= irmas.length) return;
    mover(id, no.pai_id, alvo);
  }

  if (nos.length === 0) return null;

  return (
    <div>
      <p className="docs-secao-titulo">Páginas</p>
      <ul className="docs-arvore" role="tree" aria-label="Árvore de páginas">
        {linhas.map((n) => {
          const marca = sobre?.id === n.id && arrastando !== null ? sobre.zona : null;
          return (
            <li
              key={n.id}
              role="treeitem"
              aria-level={n.nivel + 1}
              aria-expanded={n.filhos.length ? abertos.has(n.id) : undefined}
              className="docs-arvore-item"
              data-alvo={marca ?? undefined}
              data-arrastando={arrastando === n.id}
              style={{ paddingLeft: n.nivel * 14 }}
              draggable
              onDragStart={(e) => {
                setArrastando(n.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(n.id));
              }}
              onDragEnd={() => {
                setArrastando(null);
                setSobre(null);
              }}
              onDragOver={(e) => {
                if (arrastando === null) return;
                const zona = zonaDe(e);
                if (!destinoDoArrasto(nos, arrastando, n.id, zona)) return;
                e.preventDefault();
                if (sobre?.id !== n.id || sobre.zona !== zona) setSobre({ id: n.id, zona });
              }}
              onDragLeave={() => setSobre((s) => (s?.id === n.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const alvo = arrastando !== null ? destinoDoArrasto(nos, arrastando, n.id, zonaDe(e)) : null;
                const id = arrastando;
                setArrastando(null);
                setSobre(null);
                if (id !== null && alvo) mover(id, alvo.pai_id, alvo.posicao);
              }}
            >
              <span className="docs-arvore-linha">
                {n.filhos.length > 0 ? (
                  <button
                    type="button"
                    className="docs-arvore-seta"
                    aria-label={abertos.has(n.id) ? `Recolher ${n.titulo}` : `Expandir ${n.titulo}`}
                    onClick={() =>
                      setFechados((f) => {
                        const novo = new Set(f);
                        if (novo.has(n.id)) novo.delete(n.id);
                        else novo.add(n.id);
                        return novo;
                      })
                    }
                  >
                    {abertos.has(n.id) ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="docs-arvore-seta" aria-hidden="true" />
                )}
                <Link href={`/docs/${n.id}`} onKeyDown={(e) => aoTeclar(e, n.id)} title="Arraste para reorganizar (Alt+↑/↓ pelo teclado)">
                  {n.titulo}
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="texto-secundario docs-arvore-dica">Arraste para reorganizar.</p>
      {aviso && (
        <p role="alert" className="doc-erro" style={{ fontSize: 13 }}>
          {aviso}
        </p>
      )}
    </div>
  );
}
