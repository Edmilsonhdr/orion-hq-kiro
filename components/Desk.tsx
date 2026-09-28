"use client";

// Mesa individual do escritório virtual (Requirements 8.1, 8.2, 8.3).
// Componente puramente de apresentação: recebe o agente e o estado já
// derivado das atividades (ver Office.tsx). Desenha uma mesa em pixel art
// de 200×160: bonequinho do agente, monitor, nome (fonte Silkscreen), nível,
// estado e rodapé com a ferramenta e os tokens do dia.
//   - ativo:  borda na cor do agente, monitor "digitando", balão com o detalhe
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
  // Tokens gastos hoje pelo agente.
  tokens?: number;
};

function corBorda(agente: Agente, estado: EstadoMesa): string {
  if (estado === "espera") return COR_ESPERA;
  if (estado === "ativo") return agente.cor;
  return "var(--borda-forte)";
}

// Bonequinho em pixel art: cabeça na cor do agente com dois olhos e corpo
// num tom mais escuro da mesma cor.
function Boneco({ agente, estado }: { agente: Agente; estado: EstadoMesa }) {
  const ativo = estado === "ativo";
  return (
    <div
      aria-hidden="true"
      className={ativo ? "boneco boneco-ativo" : "boneco"}
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div
        style={{
          width: "20px",
          height: "18px",
          background: agente.cor,
          position: "relative",
          boxShadow: "inset -2px -2px 0 rgba(0,0,0,0.18)",
        }}
      >
        {[5, 11].map((esq) => (
          <span
            key={esq}
            className="olho-boneco"
            style={{
              position: "absolute",
              top: "6px",
              left: `${esq}px`,
              width: "4px",
              height: "4px",
              background: "#0b1220",
            }}
          />
        ))}
      </div>
      <div
        style={{
          width: "26px",
          height: "16px",
          marginTop: "2px",
          background: `color-mix(in srgb, ${agente.cor} 55%, #0b1220)`,
          boxShadow: "inset -2px -2px 0 rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}

// Monitor com linhas de "código"; as linhas piscam na cor do agente quando ativo.
function Monitor({ agente, estado }: { agente: Agente; estado: EstadoMesa }) {
  const ligado = estado !== "ocioso";
  const cor = estado === "espera" ? COR_ESPERA : agente.cor;
  const larguras = ["70%", "50%", "85%", "40%"];
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div
        style={{
          width: "88px",
          height: "38px",
          borderRadius: "3px",
          background: "var(--fundo)",
          border: `2px solid ${ligado ? cor : "var(--borda-forte)"}`,
          padding: "5px 7px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          boxShadow: ligado ? `0 0 8px ${cor}55` : "none",
        }}
      >
        {larguras.slice(0, 3).map((w, i) => (
          <span
            key={i}
            className={estado === "ativo" ? "ponto-digitando" : undefined}
            style={{
              display: "block",
              width: w,
              height: "3px",
              background: ligado ? cor : "var(--borda-forte)",
              animationDelay: estado === "ativo" ? `${i * 0.2}s` : undefined,
            }}
          />
        ))}
      </div>
      <div style={{ width: "14px", height: "4px", background: "var(--borda-forte)" }} />
    </div>
  );
}

export default function Desk({ agente, estado, detalhe, tokens = 0 }: DeskProps) {
  const borda = corBorda(agente, estado);
  const ativo = estado === "ativo";
  const espera = estado === "espera";

  const textoEstado = espera
    ? "aguardando aprovação"
    : ativo
    ? detalhe || "trabalhando…"
    : agente.ocioso;
  const corPonto = espera ? COR_ESPERA : ativo ? agente.cor : "var(--texto-secundario)";

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
      {/* Balão com o detalhe da última atividade (ativo) ou aviso de espera */}
      {((ativo && detalhe) || espera) && (
        <div
          className="mono balao-mesa"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "220px",
            padding: "6px 10px",
            background: "#e8eef9",
            border: `1px solid ${espera ? COR_ESPERA : agente.cor}`,
            borderRadius: "6px",
            color: "#0b1220",
            fontSize: "11px",
            lineHeight: 1.35,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            zIndex: 3,
          }}
          title={espera ? "aguardando aprovação" : detalhe ?? undefined}
        >
          {espera ? "aguardando aprovação" : detalhe}
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
          justifyContent: "space-between",
          borderColor: borda,
          borderWidth: ativo || espera ? "2px" : "1px",
          boxShadow: ativo
            ? `0 0 0 1px ${agente.cor}, 0 0 16px ${agente.cor}44`
            : espera
            ? `0 0 0 1px ${COR_ESPERA}, 0 0 16px ${COR_ESPERA}44`
            : "none",
        }}
      >
        {/* Bonequinho + monitor */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            paddingLeft: "8px",
          }}
        >
          <Boneco agente={agente} estado={estado} />
          <Monitor agente={agente} estado={estado} />
        </div>

        {/* Nome + nível */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <span
            className="titulo-pixel"
            style={{
              fontSize: "11px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: ativo ? agente.cor : "var(--texto)",
            }}
          >
            {agente.nome}
          </span>
          <span
            className="mono texto-secundario"
            style={{
              fontSize: "9px",
              padding: "1px 5px",
              border: "1px solid var(--borda-forte)",
              borderRadius: "3px",
            }}
            aria-label={`nível ${agente.nivel}`}
          >
            {agente.nivel}
          </span>
        </div>

        {/* Estado + rodapé */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            className="mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              color: ativo || espera ? "var(--texto)" : "var(--texto-secundario)",
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                flexShrink: 0,
                background: corPonto,
              }}
            />
            <span
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {textoEstado}
            </span>
          </div>
          <div
            className="mono"
            style={{ fontSize: "10px", color: `color-mix(in srgb, ${agente.cor} 60%, var(--texto-secundario))` }}
          >
            {agente.ferramenta} · {tokens.toLocaleString("pt-BR")} tk
          </div>
        </div>
      </div>
    </div>
  );
}
