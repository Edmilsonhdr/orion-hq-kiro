// Decoração fixa da planta (portas, móveis, quadros), posições do mockup
// docs/mockup-escritorio.dc.html. Puramente visual: aria-hidden.

import type { CSSProperties, ReactNode } from "react";

function Bloco({ s, className, children }: { s: CSSProperties; className?: string; children?: ReactNode }) {
  return (
    <div className={className} style={{ position: "absolute", ...s }}>
      {children}
    </div>
  );
}

function Planta({ x, y, folha = "#3E8E5A" }: { x: number; y: number; folha?: string }) {
  return (
    <Bloco s={{ left: x, top: y, width: 22, height: 34, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          width: 22,
          height: 20,
          background: folha,
          borderRadius: "10px 10px 4px 4px",
          boxShadow: "inset -5px -4px 0 #2F6F46",
        }}
      />
      <div style={{ width: 16, height: 14, background: "#8B5E3C" }} />
    </Bloco>
  );
}

const PORTAS_X = [122, 406, 690];

export function Portas() {
  return (
    <div aria-hidden="true">
      {PORTAS_X.flatMap((x) =>
        [286, 396].map((y) => (
          <Bloco key={`${x}-${y}`} s={{ left: x, top: y, width: 60, height: 6, background: "#2B2320", zIndex: 1 }} />
        ))
      )}
    </div>
  );
}

// Servidor da Engenharia: os LEDs continuam piscando à noite (fica acima da
// sombra noturna).
function Servidor() {
  const linha = (cor: string, piscando: boolean) => (
    <div style={{ display: "flex", gap: 3 }}>
      <div className={piscando ? "esc-led" : undefined} style={{ width: 3, height: 3, background: cor }} />
      <div style={{ width: 10, height: 3, background: "#2C3654" }} />
    </div>
  );
  return (
    <Bloco
      s={{
        left: 252,
        top: 196,
        width: 26,
        height: 50,
        zIndex: 6,
        background: "#1B2235",
        border: "2px solid #2C3654",
        padding: "5px 4px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {linha("#7BD88F", true)}
      {linha("#7BD88F", false)}
      {linha("#F2A541", true)}
    </Bloco>
  );
}

export function Decoracao() {
  return (
    <div aria-hidden="true">
      {/* Engenharia: quadro branco, planta, servidor */}
      <Bloco
        s={{
          left: 244,
          top: 26,
          width: 36,
          height: 26,
          background: "#E8EEF9",
          border: "2px solid #8C9AB8",
          padding: 4,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div style={{ width: "70%", height: 2, background: "#3FC1C9" }} />
        <div style={{ width: "90%", height: 2, background: "#4C8DFF" }} />
        <div style={{ width: "50%", height: 2, background: "#F2A541" }} />
      </Bloco>
      <Planta x={28} y={212} />
      <Servidor />

      {/* Sala do Chefe: tapete, quadro, plantas */}
      <Bloco
        s={{
          left: 326,
          top: 146,
          width: 220,
          height: 84,
          borderRadius: "50%",
          background: "rgba(76,141,255,.12)",
          border: "2px dashed rgba(127,176,255,.25)",
        }}
      />
      <Bloco
        s={{
          left: 528,
          top: 26,
          width: 34,
          height: 26,
          background: "#0B1020",
          border: "3px solid #A0703F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 10, height: 10, background: "#4C8DFF", boxShadow: "3px 3px 0 #2B5BB8" }} />
      </Bloco>
      <Planta x={312} y={212} />
      <Planta x={538} y={212} folha="#4FA56C" />

      {/* Agenda: calendário de parede, planta, estante */}
      <Bloco
        s={{
          left: 826,
          top: 24,
          width: 30,
          height: 30,
          background: "#E8EEF9",
          border: "2px solid #8C9AB8",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ height: 7, background: "#E5484D" }} />
        <div style={{ flexGrow: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, padding: 2 }}>
          {["#C9D4EA", "#C9D4EA", "#7BD88F", "#C9D4EA", "#C9D4EA", "#C9D4EA"].map((c, i) => (
            <div key={i} style={{ background: c }} />
          ))}
        </div>
      </Bloco>
      <Planta x={596} y={212} />
      <Bloco
        s={{
          left: 826,
          top: 196,
          width: 30,
          height: 50,
          background: "#6B4A30",
          border: "2px solid #4A3222",
          padding: 3,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div style={{ height: 12, display: "flex", gap: 2, alignItems: "flex-end" }}>
          <div style={{ width: 4, height: 12, background: "#4C8DFF" }} />
          <div style={{ width: 4, height: 10, background: "#7BD88F" }} />
          <div style={{ width: 4, height: 12, background: "#E8EEF9" }} />
        </div>
        <div style={{ height: 12, display: "flex", gap: 2, alignItems: "flex-end" }}>
          <div style={{ width: 4, height: 11, background: "#F2A541" }} />
          <div style={{ width: 4, height: 12, background: "#A58BFF" }} />
        </div>
      </Bloco>

      {/* Negócios: gráfico de parede, planta, arquivo */}
      <Bloco
        s={{
          left: 242,
          top: 410,
          width: 38,
          height: 28,
          background: "#E8EEF9",
          border: "2px solid #8C9AB8",
          padding: 3,
          display: "flex",
          gap: 3,
          alignItems: "flex-end",
        }}
      >
        {[
          [6, "#A58BFF"],
          [10, "#A58BFF"],
          [8, "#A58BFF"],
          [16, "#7BD88F"],
        ].map(([h, c], i) => (
          <div key={i} style={{ width: 5, height: h as number, background: c as string }} />
        ))}
      </Bloco>
      <Planta x={28} y={596} folha="#4FA56C" />
      <Bloco
        s={{
          left: 250,
          top: 580,
          width: 28,
          height: 50,
          background: "#5A6478",
          border: "2px solid #3B4666",
          padding: 4,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 10,
              background: "#6E7890",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div style={{ width: 8, height: 2, background: "#3B4666" }} />
          </div>
        ))}
      </Bloco>

      {/* Copa: máquina de café, bebedouro, mesa redonda com 3 cadeiras */}
      <Bloco
        s={{
          left: 318,
          top: 440,
          width: 34,
          height: 42,
          background: "#2C3654",
          border: "2px solid #1B2235",
          borderRadius: 3,
          padding: 4,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "center",
        }}
      >
        <div className="esc-led" style={{ width: 6, height: 4, background: "#E5484D" }} />
        <div style={{ width: 14, height: 12, background: "#0B1020" }} />
        <div style={{ width: 10, height: 8, background: "#E8EEF9" }} />
      </Bloco>
      <Bloco
        s={{ left: 526, top: 436, width: 26, height: 50, display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <div style={{ width: 20, height: 22, background: "rgba(127,176,255,.55)", borderRadius: "8px 8px 2px 2px" }} />
        <div style={{ width: 26, height: 28, background: "#C9D4EA", borderRadius: 2 }} />
      </Bloco>
      <Bloco
        s={{
          left: 394,
          top: 514,
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "#7A5236",
          boxShadow: "inset 0 -6px 0 #5E3E28",
        }}
      />
      <Bloco s={{ left: 418, top: 538, width: 14, height: 14, background: "#E8EEF9", borderRadius: 3 }} />
      <Bloco s={{ left: 444, top: 552, width: 14, height: 14, background: "#E8EEF9", borderRadius: 3 }} />
      <Bloco s={{ left: 368, top: 540, width: 30, height: 30, borderRadius: 8, background: "#2A2F45" }} />
      <Bloco s={{ left: 474, top: 540, width: 30, height: 30, borderRadius: 8, background: "#2A2F45" }} />
      <Bloco s={{ left: 421, top: 598, width: 30, height: 30, borderRadius: 8, background: "#2A2F45" }} />

      {/* Baia dos Workers: quadro de post-its, caixas */}
      <Bloco
        s={{
          left: 818,
          top: 408,
          width: 38,
          height: 30,
          background: "#6B4A30",
          border: "2px solid #4A3222",
          padding: 3,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 2,
        }}
      >
        {["#F2D65E", "#7BD88F", "#F2D65E", "#E0A8FF", "#F2D65E", "#7FB0FF"].map((c, i) => (
          <div key={i} style={{ background: c }} />
        ))}
      </Bloco>
      <Bloco
        s={{
          left: 596,
          top: 606,
          width: 30,
          height: 24,
          background: "#A0703F",
          boxShadow: "inset 0 -4px 0 #7A5236",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 4, height: 24, background: "#C9A26B" }} />
      </Bloco>
      <Bloco s={{ left: 820, top: 590, width: 30, height: 40, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ height: 18, background: "#A0703F", boxShadow: "inset 0 -3px 0 #7A5236" }} />
        <div style={{ height: 20, background: "#8B5E3C", boxShadow: "inset 0 -3px 0 #6B4A30" }} />
      </Bloco>
    </div>
  );
}
