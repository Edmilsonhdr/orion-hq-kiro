// Personagens em pixel art (CSS puro), no traço do mockup do escritório.
// A aparência vem de lib/agents.ts (Visual); nada de nome ou cor fixos aqui.

import type { CSSProperties } from "react";
import type { Visual } from "../lib/agents";

const OLHO = "#0B1020";
const CALCA = "#1B2235";

function px(left: number, top: number, width: number, height: number, extra: CSSProperties = {}): CSSProperties {
  return { position: "absolute", left, top, width, height, ...extra };
}

// Figura sentada à mesa, desenhada na caixa 180×120 da estação de trabalho.
export function FiguraMesa({ visual, mexendo }: { visual: Visual; mexendo: boolean }) {
  const v = visual;
  return (
    <div className={mexendo ? "esc-mexendo" : undefined} style={px(0, 0, 180, 120)} aria-hidden="true">
      {v.cabeloLongo && <div style={px(94, 65, 36, 38, { background: v.cabelo, borderRadius: "14px 14px 6px 6px", boxShadow: "inset 0 2px 0 rgba(255,255,255,.18)" })} />}
      {/* pescoço, rosto com sombra, orelhas e bochechas */}
      <div style={px(106, 90, 12, 8, { background: v.pele, filter: "brightness(.82)" })} />
      <div style={px(96, 77, 4, 8, { background: v.pele, borderRadius: 3, filter: "brightness(.9)" })} />
      <div style={px(124, 77, 4, 8, { background: v.pele, borderRadius: 3, filter: "brightness(.9)" })} />
      <div
        style={px(99, 70, 26, 25, {
          background: `linear-gradient(160deg, ${v.pele} 0%, ${v.pele} 55%, rgba(0,0,0,.18) 100%)`,
          borderRadius: "6px 6px 9px 9px",
          boxShadow: "inset 0 -3px 0 rgba(0,0,0,.08)",
        })}
      />
      <div style={px(99, 68, 26, 9, { background: v.cabelo, borderRadius: "8px 8px 2px 2px", boxShadow: "inset 0 2px 0 rgba(255,255,255,.22)" })} />
      <div style={px(103, 84, 5, 3, { background: "rgba(255,120,120,.28)", borderRadius: 2 })} />
      <div style={px(116, 84, 5, 3, { background: "rgba(255,120,120,.28)", borderRadius: 2 })} />
      <div style={px(105, 80, 3, 4, { background: OLHO, borderRadius: 2 })} />
      <div style={px(116, 80, 3, 4, { background: OLHO, borderRadius: 2 })} />
      <div style={px(109, 89, 6, 2, { background: "rgba(0,0,0,.35)", borderRadius: 2 })} />
      {v.barba && <div style={px(101, 86, 22, 10, { background: v.cabelo, borderRadius: "0 0 6px 6px" })} />}
      {v.oculos && (
        <>
          <div style={px(102, 77, 8, 7, { border: `2px solid ${OLHO}` })} />
          <div style={px(114, 77, 8, 7, { border: `2px solid ${OLHO}` })} />
          <div style={px(110, 79, 4, 2, { background: OLHO })} />
        </>
      )}
      {v.bone && (
        <>
          <div style={px(96, 62, 32, 10, { background: v.roupa, borderRadius: "6px 6px 0 0" })} />
          <div style={px(112, 70, 20, 4, { background: "#5E7399" })} />
        </>
      )}
      <div
        style={px(91, 94, 42, 26, {
          background: `linear-gradient(180deg, ${v.roupa} 0%, ${v.roupa} 60%, rgba(0,0,0,.22) 100%)`,
          borderRadius: "12px 12px 0 0",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,.2)",
        })}
      />
      {/* braços até o teclado */}
      <div style={px(88, 104, 9, 20, { background: v.roupa, borderRadius: 5, filter: "brightness(.9)" })} />
      <div style={px(127, 104, 9, 20, { background: v.roupa, borderRadius: 5, filter: "brightness(.9)" })} />
      <div style={px(90, 121, 7, 5, { background: v.pele, borderRadius: 3 })} />
      <div style={px(127, 121, 7, 5, { background: v.pele, borderRadius: 3 })} />
      {v.colete && <div style={px(93, 102, 38, 4, { background: "#F2D65E" })} />}
      {v.gravata && <div style={px(110, 95, 4, 14, { background: "#F2A541" })} />}
      {v.blazer && (
        <div style={px(106, 94, 12, 16, { background: "#E8EEF9", clipPath: "polygon(0 0, 100% 0, 50% 100%)" })} />
      )}
      {v.coque && <div style={px(106, 57, 12, 10, { background: v.cabelo, borderRadius: "6px 6px 2px 2px" })} />}
    </div>
  );
}

// Figura pequena (20×34): andando pelo corredor, na copa ou na guarita.
// `left/top` do contêiner ficam por conta de quem usa.
export function FiguraMini({
  visual,
  nome,
  andando = false,
  emPe = true,
  xicara = false,
}: {
  visual: Visual;
  nome?: string;
  andando?: boolean;
  emPe?: boolean;
  xicara?: boolean;
}) {
  const v = visual;
  return (
    <>
      {nome && (
        <div
          style={px(-14, -16, 48, 12, {
            textAlign: "center",
            fontFamily: "var(--fonte-titulo)",
            fontSize: 9,
            color: "#E8EEF9",
            whiteSpace: "nowrap",
            textShadow: "0 1px 0 #0B1020, 0 0 3px #0B1020",
          })}
        >
          {nome}
        </div>
      )}
      <div style={px(-2, 30, 24, 8, { background: "radial-gradient(ellipse, rgba(0,0,0,.5), transparent 70%)" })} aria-hidden="true" />
      <div className={andando ? "esc-passo" : xicara ? "esc-gole" : undefined} style={px(0, 0, 20, 34)} aria-hidden="true">
        {v.cabeloLongo && <div style={px(1, -2, 18, 18, { background: v.cabelo, borderRadius: "5px 5px 2px 2px" })} />}
        <div style={px(3, 0, 14, 13, { background: `linear-gradient(160deg, ${v.pele} 55%, rgba(0,0,0,.18))`, borderRadius: "4px 4px 6px 6px" })} />
        <div style={px(2, -3, 16, 6, { background: v.cabelo, borderRadius: "3px 3px 0 0" })} />
        {v.bone && <div style={px(2, -4, 16, 6, { background: v.roupa, borderRadius: "4px 4px 0 0" })} />}
        {v.coque && <div style={px(7, -7, 6, 5, { background: v.cabelo, borderRadius: "3px 3px 1px 1px" })} />}
        <div style={px(5, 5, 3, 3, { background: OLHO })} />
        <div style={px(12, 5, 3, 3, { background: OLHO })} />
        <div style={px(0, 13, 20, emPe ? 12 : 16, { background: `linear-gradient(180deg, ${v.roupa}, rgba(0,0,0,.25) 140%)`, borderRadius: "7px 7px 0 0", boxShadow: "inset 0 1px 0 rgba(255,255,255,.22)" })} />
        {v.colete && <div style={px(0, 19, 20, 3, { background: "#F2D65E" })} />}
        {v.gravata && <div style={px(9, 13, 2, 8, { background: "#F2A541" })} />}
        {xicara && <div style={px(20, 14, 6, 7, { background: "#E8EEF9", borderRadius: 1 })} />}
        {emPe && (
          <>
            <div style={px(3, 25, 5, 9, { background: CALCA })} />
            <div style={px(12, 25, 5, 9, { background: CALCA })} />
          </>
        )}
      </div>
    </>
  );
}
