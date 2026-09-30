// Guarita do Rui (Vigia) na ponta esquerda do corredor: balcão, monitor de
// câmeras 2×2 e luz de alerta, que pisca em #FF7A59 com incidente aberto.

import { GUARITA, type Agente, type Pessoa } from "../lib/agents";
import { FiguraMini } from "./Personagem";

export default function Guarita({
  agente,
  pessoa,
  presente,
  alerta,
  ativo,
  noite,
  descricao,
}: {
  agente: Agente;
  pessoa: Pessoa;
  presente: boolean;
  alerta: boolean;
  ativo: boolean;
  noite: boolean;
  descricao: string;
}) {
  const camera = noite ? "#2F6B5E" : "#1E3A34";
  const anel = alerta || ativo ? agente.cor : "transparent";
  return (
    <div
      role="img"
      aria-label={`${pessoa.nome}, ${agente.papel}: ${descricao}`}
      style={{
        position: "absolute",
        left: GUARITA.x,
        top: GUARITA.y,
        width: GUARITA.largura,
        height: GUARITA.altura,
        zIndex: 3,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `2px solid ${anel}`,
          borderRadius: 6,
          background: "rgba(11,16,32,.35)",
          transition: "border-color .3s",
        }}
      />
      {presente && (
        <div style={{ position: "absolute", left: 10, top: 10, width: 20, height: 34 }}>
          <FiguraMini visual={pessoa.visual} emPe={false} />
        </div>
      )}
      <div
        className={alerta ? "esc-alerta" : undefined}
        style={{
          position: "absolute",
          left: 44,
          top: 8,
          width: 12,
          height: 8,
          borderRadius: "6px 6px 0 0",
          background: alerta ? agente.cor : "#3B4666",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 36,
          top: 16,
          width: 56,
          height: 26,
          background: "#1B2235",
          border: "2px solid #2C3654",
          padding: 2,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 2,
          boxShadow: noite ? "0 0 10px rgba(79,200,170,.35)" : "none",
        }}
      >
        <div style={{ background: camera }} />
        <div style={{ background: camera }} />
        <div style={{ background: camera }} />
        <div style={{ background: alerta ? agente.cor : camera }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 4,
          top: 40,
          width: 92,
          height: 22,
          background: "#5A6478",
          borderTop: "5px solid #6E7890",
          borderRadius: 3,
          boxShadow: "0 5px 0 #3B4666",
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center" }}>
        <div className="esc-cracha" style={{ borderColor: agente.cor, gap: 4, padding: "2px 6px" }}>
          <span style={{ fontFamily: "var(--fonte-titulo)", fontSize: 11, color: "#E8EEF9" }}>{pessoa.nome}</span>
          <span style={{ fontSize: 9, color: "#A3B0CC" }}>
            {agente.papel} · {agente.nivel}
          </span>
        </div>
      </div>
    </div>
  );
}
