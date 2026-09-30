"use client";

// Barra lateral do escritório virtual (Requirement 8.5).
// Mostra duas seções:
//   - Log das atividades recentes: horário (fuso America/Sao_Paulo), cor do
//     agente e detalhe. Horário/números em fonte mono.
//   - Tokens do dia: gasto de hoje por agente e o total. Também em mono.
//
// Componente puramente de apresentação; recebe atividades e tokens por props.
// O polling incremental das atividades e o polling leve dos tokens ficam na
// página (app/(hq)/escritorio/page.tsx).

import { useMemo } from "react";
import { AGENTES, agentePorId, pessoaDoAgente } from "../lib/agents";
import { nomeEm } from "../lib/exibicao";
import { Atividade } from "./Office";

const FUSO = "America/Sao_Paulo";
const MAX_LINHAS_LOG = 40;

// Formata só o horário (HH:MM:SS) no fuso de São Paulo.
const formatadorHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function horaFormatada(criadoEm: string): string {
  const t = new Date(criadoEm);
  if (Number.isNaN(t.getTime())) return "--:--:--";
  return formatadorHora.format(t);
}

function corAgente(id: string): string {
  return agentePorId(id)?.cor ?? "var(--texto-secundario)";
}

// Texto legível do que a atividade representa (detalhe ou o tipo em fallback).
function textoLinha(a: Atividade): string {
  if (a.detalhe && a.detalhe.trim().length > 0) return a.detalhe;
  return a.tipo;
}

function formatarNumero(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export default function LogLateral({
  atividades,
  tokens,
}: {
  atividades: Atividade[];
  // {agente: tokens} de hoje (do endpoint /atividades/tokens).
  tokens: Record<string, number>;
}) {
  // Últimas atividades primeiro (maior id no topo), limitado para não crescer
  // indefinidamente na tela.
  const recentes = useMemo(() => {
    return [...atividades]
      .sort((a, b) => b.id - a.id)
      .slice(0, MAX_LINHAS_LOG)
      .map((a) => ({ ...a, nome: nomeEm(a.agente, a.criado_em, atividades) }));
  }, [atividades]);

  // Linhas de tokens por agente (na ordem de lib/agents.ts), só quem gastou,
  // mais o total.
  const linhasTokens = useMemo(() => {
    const linhas = AGENTES.map((ag) => ({
      id: ag.id,
      nome: ag.pessoas.length > 1 ? ag.papel : pessoaDoAgente(ag).nome,
      cor: ag.cor,
      total: tokens[ag.id] ?? 0,
    })).filter((l) => l.total > 0);
    const total = Object.values(tokens).reduce((s, n) => s + n, 0);
    return { linhas, total };
  }, [tokens]);

  return (
    <aside className="log-lateral" aria-label="Atividades e tokens">
      {/* Tokens do dia */}
      <section
        className="painel"
        style={{ padding: "12px" }}
        aria-label="Tokens gastos hoje"
      >
        <h3 className="titulo-pixel" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Tokens hoje
        </h3>
        {linhasTokens.linhas.length === 0 ? (
          <p className="texto-secundario" style={{ fontSize: "12px", margin: 0 }}>
            Nenhum gasto hoje.
          </p>
        ) : (
          linhasTokens.linhas.map((l) => (
            <div key={l.id} className="tokens-linha">
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    background: l.cor,
                    flexShrink: 0,
                  }}
                />
                {l.nome}
              </span>
              <span className="mono">{formatarNumero(l.total)}</span>
            </div>
          ))
        )}
        <div
          className="tokens-linha"
          style={{
            marginTop: "6px",
            paddingTop: "6px",
            borderTop: "1px solid var(--borda-forte)",
            fontWeight: 600,
          }}
        >
          <span>Total</span>
          <span className="mono">{formatarNumero(linhasTokens.total)}</span>
        </div>
      </section>

      {/* Log das atividades recentes */}
      <section
        className="painel"
        style={{ padding: "12px", flex: 1, minHeight: 0, overflowY: "auto" }}
        aria-label="Atividades recentes"
      >
        <h3 className="titulo-pixel" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Atividades
        </h3>
        {recentes.length === 0 ? (
          <p className="texto-secundario" style={{ fontSize: "12px", margin: 0 }}>
            Sem atividades recentes.
          </p>
        ) : (
          recentes.map((a) => (
            <div key={a.id} className="log-linha">
              <span
                className="mono texto-secundario"
                style={{ flexShrink: 0 }}
                title={a.criado_em}
              >
                {horaFormatada(a.criado_em)}
              </span>
              <span
                style={{
                  color: corAgente(a.agente),
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {a.nome}
              </span>
              <span
                style={{
                  color: "var(--texto)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={textoLinha(a)}
              >
                {textoLinha(a)}
              </span>
            </div>
          ))
        )}
      </section>
    </aside>
  );
}
