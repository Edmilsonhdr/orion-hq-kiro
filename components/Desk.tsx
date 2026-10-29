// Estação de trabalho de uma sala (caixa 180×160): balão com o que o agente está fazendo, crachá
// "Nome · Papel · Nível", cadeira, personagem (se estiver na mesa), mesa, monitor, luminária,
// teclado e caneca. A tela e o brilho sobre a mesa usam a cor do agente quando ele trabalha.

import type { Agente, Pessoa } from "../lib/agents";
import { FiguraMesa } from "./Personagem";

export type EstadoMesa = "ativo" | "ocioso" | "espera";

export const LARGURA_ESTACAO = 180;
export const ALTURA_ESTACAO = 160;

export default function Desk({
  agente,
  pessoa,
  estado,
  balao,
  sentado,
  cracha = true,
}: {
  agente: Agente;
  pessoa: Pessoa;
  estado: EstadoMesa;
  balao: string | null;
  sentado: boolean;
  cracha?: boolean;
}) {
  const ativo = estado === "ativo" && sentado;
  const tela = ativo ? agente.cor : estado === "espera" ? "#F2A541" : "#33415f";
  const brilho = ativo || estado === "espera";
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: LARGURA_ESTACAO, height: ALTURA_ESTACAO }}>
      {balao && sentado && (
        <div className="esc-balao" style={{ left: 0, right: 0, top: 0, zIndex: 3 }}>
          {balao}
        </div>
      )}
      {cracha && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 36, display: "flex", justifyContent: "center" }}>
          <div className="esc-cracha" style={{ borderColor: agente.cor }}>
            <span style={{ fontFamily: "var(--fonte-titulo)", fontSize: 12, color: "#E8EEF9" }}>{pessoa.nome}</span>
            <span style={{ fontSize: 10, color: "#A3B0CC" }}>
              {agente.papel} · {agente.nivel}
            </span>
          </div>
        </div>
      )}

      <div aria-hidden="true">
        {/* sombra da cadeira e da mesa no chão */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 142,
            width: 180,
            height: 22,
            background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,.45), transparent 70%)",
          }}
        />
        {/* cadeira: encosto, assento e apoios */}
        <div
          style={{
            position: "absolute",
            left: 86,
            top: 62,
            width: 52,
            height: 52,
            background: "linear-gradient(180deg, #3a4668 0%, #232b44 100%)",
            borderRadius: "16px 16px 8px 8px",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,.12), 0 3px 6px rgba(0,0,0,.4)",
          }}
        />
        <div style={{ position: "absolute", left: 82, top: 92, width: 6, height: 22, background: "#232b44", borderRadius: 3 }} />
        <div style={{ position: "absolute", left: 136, top: 92, width: 6, height: 22, background: "#232b44", borderRadius: 3 }} />
        {sentado && <FiguraMesa visual={pessoa.visual} mexendo={ativo} />}
        {/* mesa: tampo claro, frente e pés */}
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 112,
            width: 172,
            height: 44,
            background: "linear-gradient(180deg, #a77a52 0%, #8a603c 18%, #6e4a2e 100%)",
            borderRadius: 6,
            boxShadow: "inset 0 2px 0 rgba(255,255,255,.28), 0 8px 0 #3d2a1b, 0 14px 14px rgba(0,0,0,.45)",
          }}
        />
        {/* faixa com a cor do agente na frente da mesa */}
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 146,
            width: 148,
            height: 3,
            borderRadius: 2,
            background: agente.cor,
            opacity: 0.85,
            boxShadow: `0 0 8px ${agente.cor}`,
          }}
        />
        {/* brilho da tela sobre a mesa */}
        {brilho && (
          <div
            className="esc-digitando"
            style={{
              position: "absolute",
              left: 8,
              top: 114,
              width: 84,
              height: 26,
              background: `radial-gradient(ellipse at 50% 0%, ${tela}66, transparent 70%)`,
            }}
          />
        )}
        {/* monitor */}
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 64,
            width: 66,
            height: 48,
            background: "#0d1322",
            border: "3px solid #2f3a58",
            borderRadius: 6,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            boxShadow: brilho ? `0 0 14px ${tela}55, inset 0 0 12px ${tela}22` : "0 2px 6px rgba(0,0,0,.4)",
          }}
        >
          {[70, 45, 85, 60].map((largura, i) => (
            <div
              key={i}
              className={ativo ? "esc-digitando" : undefined}
              style={{ width: `${largura}%`, height: 3, borderRadius: 2, background: tela }}
            />
          ))}
        </div>
        <div style={{ position: "absolute", left: 42, top: 112, width: 14, height: 6, background: "#2f3a58", borderRadius: "0 0 3px 3px" }} />
        {/* luminária */}
        <div style={{ position: "absolute", left: 150, top: 92, width: 3, height: 22, background: "#8fa0c4", borderRadius: 2 }} />
        <div
          style={{
            position: "absolute",
            left: 140,
            top: 88,
            width: 18,
            height: 7,
            background: "#c9d4ea",
            borderRadius: "8px 8px 2px 2px",
            boxShadow: "0 3px 8px rgba(255,226,150,.55)",
          }}
        />
        {/* teclado e caneca */}
        <div
          style={{
            position: "absolute",
            left: 92,
            top: 122,
            width: 38,
            height: 8,
            background: "linear-gradient(180deg, #dbe3f3, #aebbd6)",
            borderRadius: 3,
            boxShadow: "0 2px 0 rgba(0,0,0,.35)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 138,
            top: 118,
            width: 11,
            height: 12,
            background: "linear-gradient(90deg, #ffffff, #cdd7ea)",
            borderRadius: "2px 2px 4px 4px",
            boxShadow: "0 2px 0 rgba(0,0,0,.3)",
          }}
        />
      </div>
    </div>
  );
}
