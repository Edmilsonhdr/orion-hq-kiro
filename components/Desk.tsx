// Estação de trabalho de uma sala (caixa 180×160 do mockup): balão com o que
// o agente está fazendo, crachá "Nome · Papel · Nível", cadeira, personagem
// (se estiver na mesa), mesa, monitor, teclado e caneca.

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
  const tela = ativo ? agente.cor : estado === "espera" ? "#F2A541" : "#2C3654";
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
        {/* cadeira */}
        <div
          style={{
            position: "absolute",
            left: 88,
            top: 68,
            width: 48,
            height: 44,
            background: "#2A2F45",
            borderRadius: "10px 10px 4px 4px",
          }}
        />
        {sentado && <FiguraMesa visual={pessoa.visual} mexendo={ativo} />}
        {/* mesa */}
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 112,
            width: 168,
            height: 40,
            background: "#7A5236",
            borderTop: "6px solid #9A6A45",
            borderRadius: 3,
            boxShadow: "0 6px 0 #4A3222",
          }}
        />
        {/* monitor */}
        <div
          style={{
            position: "absolute",
            left: 18,
            top: 70,
            width: 62,
            height: 44,
            background: "#1B2235",
            border: "3px solid #2C3654",
            borderRadius: 3,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {[70, 45, 85, 60].map((largura, i) => (
            <div
              key={i}
              className={ativo ? "esc-digitando" : undefined}
              style={{ width: `${largura}%`, height: 3, background: tela }}
            />
          ))}
        </div>
        <div style={{ position: "absolute", left: 43, top: 113, width: 12, height: 6, background: "#2C3654" }} />
        {/* teclado e caneca */}
        <div
          style={{
            position: "absolute",
            left: 94,
            top: 122,
            width: 36,
            height: 7,
            background: "#C9D2E6",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 146,
            top: 118,
            width: 10,
            height: 11,
            background: "#E8EEF9",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}
