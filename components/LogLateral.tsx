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

import { useMemo, type ReactNode } from "react";
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
  const autor = typeof a.dados?.autor === "string" ? a.dados.autor : null;
  if (a.tipo === "inicio" && autor && a.detalhe) return `${autor} pediu: ${a.detalhe}`;
  if (a.detalhe && a.detalhe.trim().length > 0) return a.detalhe;
  return a.tipo;
}

function formatarNumero(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export default function LogLateral({
  atividades,
  tokens,
  filtro = null,
  onLimpar,
  topo,
}: {
  atividades: Atividade[];
  filtro?: string | null;
  onLimpar?: () => void;
  // Conteúdo extra no alto da barra (painel do agente escolhido).
  topo?: ReactNode;
  // {agente: tokens} de hoje (do endpoint /atividades/tokens).
  tokens: Record<string, number>;
}) {
  // Últimas atividades primeiro (maior id no topo), limitado para não crescer
  // indefinidamente na tela.
  const recentes = useMemo(() => {
    return [...atividades]
      .filter((a) => !filtro || a.agente === filtro)
      .sort((a, b) => b.id - a.id)
      .slice(0, MAX_LINHAS_LOG)
      .map((a) => ({ ...a, nome: nomeEm(a.agente, a.criado_em, atividades) }));
  }, [atividades, filtro]);

  // Linhas de tokens por agente (na ordem de lib/agents.ts), só quem gastou,
  // mais o total.
  const linhasTokens = useMemo(() => {
    const linhas = AGENTES.map((ag) => ({
      id: ag.id,
      nome: ag.pessoas.length > 1 ? ag.papel : pessoaDoAgente(ag).nome,
      cor: ag.cor,
      total: tokens[ag.id] ?? 0,
    }));
    const total = Object.values(tokens).reduce((s, n) => s + n, 0);
    return { linhas, total, todas: linhas };
  }, [tokens]);

  const maior = Math.max(1, ...linhasTokens.todas.map((l) => l.total));

  return (
    <aside className="log-lateral esc-lateral" aria-label="Atividades e tokens">
      {topo}
      {/* Tokens do dia: uma barra por agente, na cor dele */}
      <section className="painel esc-painel" aria-label="Tokens gastos hoje">
        <header className="esc-painel-topo">
          <h3 className="titulo-pixel">Tokens hoje</h3>
          <span className="mono">{formatarNumero(linhasTokens.total)}</span>
        </header>
        <ul className="esc-barras">
          {linhasTokens.todas.map((l) => (
            <li key={l.id} className={l.total === 0 ? "vazio" : undefined}>
              <span className="esc-barra-nome">{l.nome}</span>
              <span className="esc-barra-trilho" aria-hidden="true">
                <span className="esc-barra-valor" style={{ width: `${(l.total / maior) * 100}%`, background: l.cor }} />
              </span>
              <span className="mono esc-barra-numero">{formatarNumero(l.total)}</span>
            </li>
          ))}
        </ul>
        {linhasTokens.total === 0 && (
          <p className="texto-secundario esc-painel-nota">Nenhum gasto hoje.</p>
        )}
      </section>

      {/* Atividades: linha do tempo, mais recente no topo */}
      <section className="painel esc-painel esc-feed" aria-label="Atividades recentes">
        <header className="esc-painel-topo">
          <h3 className="titulo-pixel">Atividades</h3>
          <span className="mono texto-secundario">
            {filtro && onLimpar && (
              <button type="button" className="esc-limpar" onClick={onLimpar}>
                limpar filtro
              </button>
            )}{" "}
            {recentes.length}
          </span>
        </header>
        {recentes.length === 0 ? (
          <p className="texto-secundario esc-painel-nota">{filtro ? "Nenhuma atividade desse agente." : "Sem atividades recentes."}</p>
        ) : (
          <ol className="esc-linha-tempo">
            {recentes.map((a) => (
              <li key={a.id} style={{ ["--cor" as string]: corAgente(a.agente) }}>
                <div className="esc-evento-topo">
                  <strong style={{ color: corAgente(a.agente) }}>{a.nome}</strong>
                  <span className="mono texto-secundario" title={a.criado_em}>
                    {horaFormatada(a.criado_em)}
                  </span>
                </div>
                <div className="esc-evento-texto">{textoLinha(a)}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
