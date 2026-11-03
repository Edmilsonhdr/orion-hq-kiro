"use client";

// Uso de um agente nos últimos 30 dias (tokens, execuções, série diária) e as últimas execuções.
// Só leitura; os números vêm das atividades que os agentes já registram.

import { useEffect, useState } from "react";
import { obter } from "../lib/api";
import { tempoRelativo } from "../lib/docs";

type Uso = { tokens: number; execucoes: number; ultima_em: string | null; serie: number[] };
type RespostaUso = { dias: number; agentes: Record<string, Uso> };
type Execucao = { run_id: string; inicio: string; fim: string; tokens: number; detalhe: string | null; erro: boolean; eventos: number };

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export default function UsoAgente({ agenteId, nome }: { agenteId: string; nome: string }) {
  const [uso, setUso] = useState<Uso | null | undefined>(undefined);
  const [dias, setDias] = useState(30);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    setUso(undefined);
    setErro(false);
    obter<RespostaUso>("/agentes/uso?dias=30")
      .then((r) => {
        if (!ativo) return;
        setDias(r.dias);
        setUso(r.agentes[agenteId] ?? null);
      })
      .catch(() => ativo && setErro(true));
    obter<Execucao[]>(`/agentes/${encodeURIComponent(agenteId)}/execucoes`)
      .then((l) => ativo && setExecucoes(Array.isArray(l) ? l : []))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [agenteId]);

  const maximo = Math.max(1, ...(uso?.serie ?? [0]));

  return (
    <div className="ag-cartao">
      <h2 className="ag-h2">Uso de {nome}</h2>
      {erro && <p className="ag-vazio">Não foi possível carregar o uso.</p>}
      {uso === undefined && !erro && <p className="ag-vazio">Carregando…</p>}
      {uso === null && <p className="ag-vazio">Sem atividade nos últimos {dias} dias.</p>}
      {uso && (
        <>
          <div className="uso-numeros">
            <div>
              <strong className="mono">{fmt(uso.tokens)}</strong>
              <span className="texto-secundario">tokens em {dias} dias</span>
            </div>
            <div>
              <strong className="mono">{fmt(uso.execucoes)}</strong>
              <span className="texto-secundario">execuções</span>
            </div>
            <div>
              <strong className="mono">{uso.execucoes ? fmt(Math.round(uso.tokens / uso.execucoes)) : "—"}</strong>
              <span className="texto-secundario">tokens por execução</span>
            </div>
          </div>
          <div className="uso-barras" role="img" aria-label={`Tokens por dia nos últimos ${dias} dias`}>
            {uso.serie.map((v, i) => (
              <span key={i} style={{ height: `${Math.max(2, (v / maximo) * 100)}%` }} title={`${fmt(v)} tokens`} data-zero={v === 0} />
            ))}
          </div>
        </>
      )}
      {execucoes.length > 0 && (
        <>
          <h3 className="ag-h3">Últimas execuções</h3>
          <ul className="uso-execucoes">
            {execucoes.map((e) => (
              <li key={e.run_id} data-erro={e.erro}>
                <span className="uso-detalhe">{e.detalhe ?? "Execução"}</span>
                <span className="texto-secundario mono">
                  {e.erro ? "erro · " : ""}
                  {fmt(e.tokens)} tokens · {tempoRelativo(e.fim)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
