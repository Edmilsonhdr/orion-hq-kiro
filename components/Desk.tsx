"use client";

// Mesa individual do escritório virtual (Requirements 8.1, 8.2, 8.3).
// Componente puramente de apresentação: recebe o agente e o estado já
// derivado das atividades (ver Office.tsx). Desenha uma mesa em pixel art
// de 200×160 com o nome do agente (fonte Silkscreen) e o estado visual:
//   - ativo:  borda na cor do agente, tela "digitando", balão com o detalhe
//             da última atividade;
//   - ocioso: texto ocioso do agente;
//   - espera: âmbar (#F2A541), usado quando há aprovação pendente (Agenda).

import { Agente } from "../lib/agents";

export const LARGURA_MESA = 200;
export const ALTURA_MESA = 160;

export type EstadoMesa = "ativo" | "ocioso" | "espera";

const COR_ESPERA = "#f2a541";

export type DeskProps = {
  agente: Agente;
  estado: EstadoMesa;
  // Detalhe da última atividade (mostrado no balão quando ativo).
  detalhe?: string | null;
};

function corBorda(agente: Agente, estado: EstadoMesa): string {
  if (estado === "espera") return COR_ESPERA;
  if (estado === "ativo") return agente.cor;
  return "var(--borda-forte)";
}

// "Telinha" do computador na mesa: mostra três blocos que piscam quando ativo.
function Tela({ agente, estado }: { agente: Agente; estado: EstadoMesa }) {
  const cor = estado === "espera" ? COR_ESPERA : agente.cor;
  const digitando = estado === "ativo";
  return (
    <div
      aria-hidden="true"
      style={{
        width: "72px",
        height: "44px",
        borderRadius: "3px",
        background: "var(--fundo)",
        border: `2px solid ${estado === "ocioso" ? "var(--borda-forte)" : cor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "5px",
        boxShadow: digitando ? `0 0 8px ${cor}66` : "none",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ponto-digitando"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "1px",
            background: digitando ? cor : "var(--borda-forte)",
            opacity: digitando ? undefined : 0.6,
            animationDelay: digitando ? `${i * 0.18}s` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export default function Desk({ agente, estado, detalhe }: DeskProps) {
  const borda = corBorda(agente, estado);
  const ativo = estado === "ativo";
  const espera = estado === "espera";

  return (
    <div
      style={{
        width: `${LARGURA_MESA}px`,
        height: `${ALTURA_MESA}px`,
        position: "relative",
      }}
      data-agente={agente.id}
      data-estado={estado}
    >
      {/* Balão com o detalhe da última atividade (só quando ativo) */}
      {ativo && detalhe && (
        <div
          className="mono balao-mesa"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "220px",
            padding: "6px 10px",
            background: "var(--painel)",
            border: `1px solid ${agente.cor}`,
            borderRadius: "6px",
            color: "var(--texto)",
            fontSize: "11px",
            lineHeight: 1.35,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            zIndex: 3,
          }}
          title={detalhe}
        >
          {detalhe}
        </div>
      )}

      {/* Corpo da mesa */}
      <div
        className="painel"
        style={{
          width: "100%",
          height: "100%",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "6px",
          borderColor: borda,
          borderWidth: ativo || espera ? "2px" : "1px",
          boxShadow: ativo
            ? `0 0 0 1px ${agente.cor}, 0 0 16px ${agente.cor}44`
            : espera
            ? `0 0 0 1px ${COR_ESPERA}, 0 0 16px ${COR_ESPERA}44`
            : "none",
        }}
      >
        {/* Cabeçalho: nome + nível */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            alignSelf: "stretch",
            justifyContent: "space-between",
          }}
        >
          <span
            className="titulo-pixel"
            style={{ fontSize: "12px", color: ativo ? agente.cor : "var(--texto)" }}
          >
            {agente.nome}
          </span>
          <span
            className="mono texto-secundario"
            style={{ fontSize: "10px" }}
            aria-label={`nível ${agente.nivel}`}
          >
            {agente.nivel}
          </span>
        </div>

        {/* Telinha "digitando" */}
        <Tela agente={agente} estado={estado} />

        {/* Estado textual */}
        <div
          className="mono"
          style={{
            fontSize: "10px",
            textAlign: "center",
            color: espera
              ? COR_ESPERA
              : ativo
              ? "var(--texto)"
              : "var(--texto-secundario)",
            minHeight: "13px",
            alignSelf: "stretch",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {espera
            ? "aguardando aprovação"
            : ativo
            ? "trabalhando…"
            : agente.ocioso}
        </div>
      </div>
    </div>
  );
}
