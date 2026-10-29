"use client";

// Paleta de comandos (Ctrl+K / Cmd+K): busca global em documentos, negócios e organizações, mais
// atalhos de navegação. Setas e Enter navegam, Esc fecha. Montada no Header, vale para todas as telas.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { obter } from "../lib/api";
import { montarItens, type ResultadoBusca } from "../lib/paleta";

const DEBOUNCE_MS = 200;

export default function Paleta() {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [busca, setBusca] = useState<ResultadoBusca | null>(null);
  const [indice, setIndice] = useState(0);
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((a) => !a);
      }
    }
    function aoPedir() {
      setAberta(true);
    }
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("orion:paleta", aoPedir);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("orion:paleta", aoPedir);
    };
  }, []);

  useEffect(() => {
    const d = dialogoRef.current;
    if (!d) return;
    if (aberta && !d.open) {
      d.showModal();
      campoRef.current?.focus();
    }
    if (!aberta && d.open) d.close();
    if (!aberta) {
      setConsulta("");
      setBusca(null);
      setIndice(0);
    }
  }, [aberta]);

  useEffect(() => {
    const termo = consulta.trim();
    if (!aberta || !termo) {
      setBusca(null);
      return;
    }
    let ativo = true;
    const t = setTimeout(() => {
      obter<ResultadoBusca>(`/busca?q=${encodeURIComponent(termo)}`)
        .then((r) => ativo && setBusca(r))
        .catch(() => ativo && setBusca(null));
    }, DEBOUNCE_MS);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [consulta, aberta]);

  const itens = useMemo(() => montarItens(consulta, busca), [consulta, busca]);

  useEffect(() => setIndice(0), [itens.length, consulta]);

  function ir(i: number) {
    const item = itens[i];
    if (!item) return;
    setAberta(false);
    router.push(item.href);
  }

  function aoTeclarCampo(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, Math.max(itens.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(indice);
    }
  }

  let grupoAnterior = "";
  return (
    <dialog
      ref={dialogoRef}
      className="modal paleta"
      aria-label="Busca e comandos"
      onClose={() => setAberta(false)}
      onClick={(e) => {
        if (e.target === dialogoRef.current) setAberta(false);
      }}
    >
      <input
        ref={campoRef}
        className="paleta-campo"
        role="combobox"
        aria-expanded="true"
        aria-controls="paleta-lista"
        aria-activedescendant={itens[indice] ? `paleta-${itens[indice].id}` : undefined}
        placeholder="Buscar documentos, negócios, organizações ou ações…"
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        onKeyDown={aoTeclarCampo}
      />
      <ul id="paleta-lista" role="listbox" className="paleta-lista">
        {itens.length === 0 && <li className="paleta-vazio texto-secundario">Nada encontrado.</li>}
        {itens.map((item, i) => {
          const cabecalho = item.grupo !== grupoAnterior;
          grupoAnterior = item.grupo;
          return (
            <li key={item.id} role="presentation">
              {cabecalho && <div className="paleta-grupo">{item.grupo}</div>}
              <div
                id={`paleta-${item.id}`}
                role="option"
                aria-selected={i === indice}
                className={`paleta-item${i === indice ? " ativo" : ""}`}
                onMouseMove={() => setIndice(i)}
                onClick={() => ir(i)}
              >
                <span>{item.rotulo}</span>
                {item.dica && <span className="texto-secundario">{item.dica}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="paleta-rodape texto-secundario mono">↑↓ navegar · Enter abrir · Esc fechar</div>
    </dialog>
  );
}
