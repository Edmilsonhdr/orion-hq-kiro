"use client";

// Lista de escolha no padrão do HQ (no lugar do <select> nativo, que cada navegador desenha de um jeito).
// Botão mostra o valor atual com ícone; o menu abre por cima de tudo (position: fixed), com busca quando há muitas
// opções, setas ↑ ↓, Enter escolhe e Esc fecha.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type OpcaoEscolha = { valor: string; rotulo: string; icone?: ReactNode; dica?: string };

type Props = {
  valor: string;
  opcoes: OpcaoEscolha[];
  onEscolher: (valor: string) => void;
  rotulo: string; // para leitores de tela
  vazio?: string; // texto quando nada está escolhido
  disabled?: boolean;
  className?: string;
  /** Mostra a busca a partir de quantas opções (padrão 8). */
  buscaDesde?: number;
  /** Conteúdo do botão no lugar do padrão (ícone + rótulo + seta). */
  gatilho?: ReactNode;
};

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Escolha({ valor, opcoes, onEscolher, rotulo, vazio = "Nenhum", disabled, className, buscaDesde = 8, gatilho }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; acima: boolean } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const atual = opcoes.find((o) => o.valor === valor);
  const comBusca = opcoes.length >= buscaDesde;

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    return q ? opcoes.filter((o) => normalizar(o.rotulo).includes(q)) : opcoes;
  }, [busca, opcoes]);

  const posicionar = useCallback(() => {
    if (!botao.current) return;
    const r = botao.current.getBoundingClientRect();
    const altura = Math.min(320, opcoes.length * 36 + (comBusca ? 52 : 0) + 12);
    const acima = r.bottom + altura + 8 > window.innerHeight && r.top > altura + 8;
    setPos({ top: acima ? r.top - altura - 6 : r.bottom + 6, left: Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8), width: Math.max(r.width, 240), acima });
  }, [opcoes.length, comBusca]);

  useLayoutEffect(() => {
    if (aberto) posicionar();
  }, [aberto, posicionar]);

  useEffect(() => {
    if (!aberto) return;
    setBusca("");
    setAtivo(Math.max(0, opcoes.findIndex((o) => o.valor === valor)));
    function fora(e: MouseEvent) {
      if (!menu.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) setAberto(false);
    }
    // Rolou a tela: o menu acompanha o botão (fecha só se o botão sair da vista).
    function rolou(e: Event) {
      if (menu.current?.contains(e.target as Node)) return;
      const r = botao.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) setAberto(false);
      else posicionar();
    }
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", rolou);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("scroll", rolou, true);
      window.removeEventListener("resize", rolou);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  function escolher(o: OpcaoEscolha) {
    setAberto(false);
    botao.current?.focus();
    if (o.valor !== valor) onEscolher(o.valor);
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(filtradas.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtradas[ativo];
      if (o) escolher(o);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      botao.current?.focus();
    } else if (e.key === "Tab") setAberto(false);
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        className={`esc-botao${aberto ? " aberto" : ""}${className ? ` ${className}` : ""}`}
        aria-label={rotulo}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        disabled={disabled}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={(e) => {
          if (!aberto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setAberto(true);
          } else if (aberto) teclas(e);
        }}
      >
        {gatilho ?? (
          <>
            {atual?.icone}
            <span className={`esc-valor${atual ? "" : " vazio"}`}>{atual?.rotulo ?? vazio}</span>
            <svg className="esc-seta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        )}
      </button>
      {aberto && pos && (
        <div ref={menu} className={`esc-menu${pos.acima ? " acima" : ""}`} style={{ top: pos.top, left: pos.left, width: pos.width }} onKeyDown={teclas}>
          {comBusca && (
            <input
              autoFocus
              className="esc-busca"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setAtivo(0);
              }}
              placeholder="Buscar…"
              aria-label={`Buscar em ${rotulo}`}
            />
          )}
          <ul role="listbox" aria-label={rotulo} className="esc-lista">
            {filtradas.map((o, i) => (
              <li
                key={o.valor}
                data-i={i}
                role="option"
                aria-selected={o.valor === valor}
                className={`esc-opcao${i === ativo ? " ativa" : ""}${o.valor === valor ? " escolhida" : ""}`}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o)}
              >
                {o.icone}
                <span className="esc-opcao-texto">
                  {o.rotulo}
                  {o.dica && <small>{o.dica}</small>}
                </span>
                {o.valor === valor && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </li>
            ))}
            {filtradas.length === 0 && <li className="esc-nada">Nada encontrado</li>}
          </ul>
        </div>
      )}
    </>
  );
}
