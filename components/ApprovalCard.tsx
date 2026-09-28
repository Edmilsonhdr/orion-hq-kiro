"use client";

// Cartão de aprovação (Requirements 9.1, 9.3).
// Mostra a proposta de forma legível, quem pediu e quando, com botões
// Aprovar/Recusar. Reutilizável no topo do chat e na tela de aprovações.
// A decisão é delegada ao pai via `onDecidir(id, aprovado)`.

export type Aprovacao = {
  id: number;
  tipo: string;
  proposta: PropostaReuniao | Record<string, unknown>;
  pedido_por: string | null;
  status: string;
  aprovado?: boolean | null;
  decidido_por: string | null;
  criado_em: string;
  decidido_em: string | null;
};

type PropostaReuniao = {
  titulo?: string;
  inicio?: string;
  duracao_min?: number;
  participantes?: string[];
  pauta?: string[];
};

function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function DetalhesReuniao({ proposta }: { proposta: PropostaReuniao }) {
  const participantes = proposta.participantes ?? [];
  const pauta = proposta.pauta ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {proposta.inicio && (
        <div>
          <span className="texto-secundario">Início: </span>
          <span className="mono">{dataHora(proposta.inicio)}</span>
          {typeof proposta.duracao_min === "number" && (
            <span className="texto-secundario">
              {" "}
              · {proposta.duracao_min} min
            </span>
          )}
        </div>
      )}
      {participantes.length > 0 && (
        <div>
          <span className="texto-secundario">Participantes: </span>
          <span>{participantes.join(", ")}</span>
        </div>
      )}
      {pauta.length > 0 && (
        <div>
          <span className="texto-secundario">Pauta:</span>
          <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
            {pauta.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ApprovalCard({
  aprovacao,
  onDecidir,
  onRetomar,
  ocupado = false,
}: {
  aprovacao: Aprovacao;
  onDecidir?: (id: number, aprovado: boolean) => void;
  onRetomar?: (id: number) => void;
  ocupado?: boolean;
}) {
  const proposta = (aprovacao.proposta ?? {}) as PropostaReuniao;
  const titulo = proposta.titulo || "Proposta de reunião";
  const pendente = aprovacao.status === "pendente";
  const comErro = aprovacao.status === "erro";
  const destaque = pendente || comErro;

  return (
    <div
      className="painel"
      style={{
        padding: "14px 16px",
        borderColor: destaque ? "var(--espera)" : "var(--borda)",
        borderLeft: `3px solid ${
          destaque ? "var(--espera)" : "var(--borda-forte)"
        }`,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <span className="titulo-pixel" style={{ fontSize: "13px" }}>
          {titulo}
        </span>
        <span className="mono texto-secundario" style={{ fontSize: "11px" }}>
          {dataHora(aprovacao.criado_em)}
        </span>
      </div>

      <DetalhesReuniao proposta={proposta} />

      {aprovacao.pedido_por && (
        <div className="texto-secundario" style={{ fontSize: "13px" }}>
          Pedido por {aprovacao.pedido_por}
        </div>
      )}

      {pendente && onDecidir ? (
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="botao-destaque"
            disabled={ocupado}
            onClick={() => onDecidir(aprovacao.id, true)}
          >
            Aprovar
          </button>
          <button
            type="button"
            className="botao"
            disabled={ocupado}
            onClick={() => onDecidir(aprovacao.id, false)}
          >
            Recusar
          </button>
        </div>
      ) : comErro ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "13px", color: "var(--espera)" }}>
            {aprovacao.aprovado ? "Aprovada" : "Recusada"}
            {aprovacao.decidido_por ? ` por ${aprovacao.decidido_por}` : ""}, mas
            a ação não foi concluída.
          </div>
          {onRetomar && (
            <div>
              <button
                type="button"
                className="botao-destaque"
                disabled={ocupado}
                onClick={() => onRetomar(aprovacao.id)}
              >
                Tentar de novo
              </button>
            </div>
          )}
        </div>
      ) : !pendente ? (
        <div className="texto-secundario" style={{ fontSize: "13px" }}>
          {aprovacao.status === "aprovada" ? "Aprovada" : "Recusada"}
          {aprovacao.decidido_por ? ` por ${aprovacao.decidido_por}` : ""}
          {aprovacao.decidido_em ? ` · ${dataHora(aprovacao.decidido_em)}` : ""}
        </div>
      ) : null}
    </div>
  );
}
