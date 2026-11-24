"use client";

// Campo de data no padrão do HQ (no lugar do calendário do navegador): botão com a data por extenso e, ao
// clicar, um calendário do mês com Hoje, Amanhã, Próxima semana e Limpar. Setas ← → ↑ ↓ andam pelos dias,
// Enter escolhe, Esc fecha.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = { valor: string | null; onEscolher: (iso: string | null) => void; rotulo: string; vazio?: string; className?: string };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deIso = (s: string) => {
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
};
const somar = (d: Date, dias: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias);
const hojeSP = () => deIso(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
const porExtenso = (s: string) => {
  const d = deIso(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function CampoData({ valor, onEscolher, rotulo, vazio = "Sem data", className }: Props) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState<Date>(() => (valor ? deIso(valor) : hojeSP()));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const hoje = hojeSP();

  const posicionar = useCallback(() => {
    const r = botao.current?.getBoundingClientRect();
    if (!r) return;
    const altura = 360;
    const acima = r.bottom + altura > window.innerHeight && r.top > altura;
    setPos({ top: acima ? r.top - altura - 6 : r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) });
  }, []);

  useLayoutEffect(() => {
    if (aberto) posicionar();
  }, [aberto, posicionar]);

  useEffect(() => {
    if (!aberto) return;
    setFoco(valor ? deIso(valor) : hojeSP());
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) setAberto(false);
    };
    const rolou = (e: Event) => !caixa.current?.contains(e.target as Node) && posicionar();
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", rolou, true);
    requestAnimationFrame(() => caixa.current?.querySelector<HTMLElement>(".cd-dia.foco")?.focus());
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("scroll", rolou, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => {
    if (aberto) caixa.current?.querySelector<HTMLElement>(".cd-dia.foco")?.focus();
  }, [foco, aberto]);

  function escolher(d: Date | null) {
    setAberto(false);
    botao.current?.focus();
    const novo = d ? iso(d) : null;
    if (novo !== (valor ? valor.slice(0, 10) : null)) onEscolher(novo);
  }

  function teclas(e: React.KeyboardEvent) {
    const passos: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in passos) {
      e.preventDefault();
      setFoco((f) => somar(f, passos[e.key]));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      botao.current?.focus();
    }
  }

  const primeiro = new Date(foco.getFullYear(), foco.getMonth(), 1);
  const inicio = somar(primeiro, -primeiro.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => somar(inicio, i));
  const escolhido = valor ? valor.slice(0, 10) : null;
  const mudarMes = (n: number) => setFoco((f) => new Date(f.getFullYear(), f.getMonth() + n, Math.min(f.getDate(), 28)));

  return (
    <>
      <button ref={botao} type="button" className={`esc-botao cd-botao${aberto ? " aberto" : ""}${className ? ` ${className}` : ""}`} aria-label={rotulo} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className={`esc-valor${valor ? "" : " vazio"}`}>{valor ? porExtenso(valor) : vazio}</span>
      </button>
      {aberto && pos && (
        <div ref={caixa} className="cd" role="dialog" aria-label={rotulo} style={{ top: pos.top, left: pos.left }} onKeyDown={teclas}>
          <div className="cd-topo">
            <button type="button" className="cd-seta" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
              ‹
            </button>
            <strong>
              {MESES[foco.getMonth()]} de {foco.getFullYear()}
            </strong>
            <button type="button" className="cd-seta" aria-label="Próximo mês" onClick={() => mudarMes(1)}>
              ›
            </button>
          </div>
          <div className="cd-grade" role="grid">
            {SEMANA.map((s, i) => (
              <span key={i} className="cd-semana" aria-hidden>
                {s}
              </span>
            ))}
            {dias.map((d) => {
              const chave = iso(d);
              const classes = ["cd-dia"];
              if (d.getMonth() !== foco.getMonth()) classes.push("fora");
              if (chave === iso(hoje)) classes.push("hoje");
              if (chave === escolhido) classes.push("escolhido");
              if (chave === iso(foco)) classes.push("foco");
              return (
                <button
                  key={chave}
                  type="button"
                  className={classes.join(" ")}
                  tabIndex={chave === iso(foco) ? 0 : -1}
                  aria-label={porExtenso(chave)}
                  aria-pressed={chave === escolhido}
                  onClick={() => escolher(d)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), escolher(d))}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="cd-atalhos">
            <button type="button" onClick={() => escolher(hoje)}>
              Hoje
            </button>
            <button type="button" onClick={() => escolher(somar(hoje, 1))}>
              Amanhã
            </button>
            <button type="button" onClick={() => escolher(somar(hoje, 7))}>
              Em 1 semana
            </button>
            {valor && (
              <button type="button" className="cd-limpar" onClick={() => escolher(null)}>
                Limpar
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
