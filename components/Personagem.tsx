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
      {v.cabeloLongo && <div style={px(95, 66, 34, 34, { background: v.cabelo, borderRadius: "8px 8px 2px 2px" })} />}
      <div style={px(99, 70, 26, 24, { background: v.pele, borderRadius: 4 })} />
      <div style={px(97, 66, 30, 9, { background: v.cabelo, borderRadius: "4px 4px 0 0" })} />
      <div style={px(105, 80, 3, 3, { background: OLHO })} />
      <div style={px(116, 80, 3, 3, { background: OLHO })} />
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
      <div style={px(93, 94, 38, 24, { background: v.roupa, borderRadius: "6px 6px 0 0" })} />
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
      <div className={andando ? "esc-passo" : xicara ? "esc-gole" : undefined} style={px(0, 0, 20, 34)} aria-hidden="true">
        {v.cabeloLongo && <div style={px(1, -2, 18, 18, { background: v.cabelo, borderRadius: "5px 5px 2px 2px" })} />}
        <div style={px(3, 0, 14, 13, { background: v.pele, borderRadius: 3 })} />
        <div style={px(2, -3, 16, 6, { background: v.cabelo, borderRadius: "3px 3px 0 0" })} />
        {v.bone && <div style={px(2, -4, 16, 6, { background: v.roupa, borderRadius: "4px 4px 0 0" })} />}
        {v.coque && <div style={px(7, -7, 6, 5, { background: v.cabelo, borderRadius: "3px 3px 1px 1px" })} />}
        <div style={px(5, 5, 3, 3, { background: OLHO })} />
        <div style={px(12, 5, 3, 3, { background: OLHO })} />
        <div style={px(0, 13, 20, emPe ? 12 : 16, { background: v.roupa, borderRadius: "4px 4px 0 0" })} />
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
