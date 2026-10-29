"use client";

// Barras por etapa em aberto: quantidade de negócios e valor mensal. Apresentação pura.

import { ROTULO_ETAPA, formatarReais, resumoPorEtapa, type Negocio } from "../lib/comercial";

export default function GraficoFunil({ negocios }: { negocios: Negocio[] }) {
  const linhas = resumoPorEtapa(negocios);
  const maior = Math.max(1, ...linhas.map((l) => l.quantidade));
  return (
    <section className="painel com-grafico" aria-label="Negócios por etapa">
      <h2 className="com-grafico-titulo">Negócios por etapa</h2>
      <ul>
        {linhas.map((l) => (
          <li key={l.etapa}>
            <span className="com-grafico-nome">{ROTULO_ETAPA[l.etapa]}</span>
            <span className="com-grafico-trilho" aria-hidden="true">
              <span className={`com-grafico-barra funil-${l.etapa}`} style={{ width: `${(l.quantidade / maior) * 100}%` }} />
            </span>
            <span className="mono com-grafico-num">{l.quantidade}</span>
            <span className="mono texto-secundario com-grafico-valor">{l.valor ? formatarReais(l.valor) : "—"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
