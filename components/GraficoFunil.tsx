"use client";

// Faixa do funil: uma etapa em aberto por bloco, com a quantidade de negócios, o valor mensal e a parte do total.
// Apresentação pura.

import { ROTULO_ETAPA, formatarReais, resumoPorEtapa, type Negocio } from "../lib/comercial";

export default function GraficoFunil({ negocios }: { negocios: Negocio[] }) {
  const linhas = resumoPorEtapa(negocios);
  const total = linhas.reduce((s, l) => s + l.quantidade, 0);
  return (
    <section className="com-etapas" aria-label="Negócios por etapa">
      {linhas.map((l, i) => (
        <div key={l.etapa} className={`com-etapa funil-${l.etapa}`}>
          <span className="com-etapa-passo">{i + 1}</span>
          <span className="com-etapa-nome">{ROTULO_ETAPA[l.etapa]}</span>
          <span className="com-etapa-num">{l.quantidade}</span>
          <span className="com-etapa-valor">{l.valor ? `${formatarReais(l.valor)}/mês` : "sem valor"}</span>
          <span className="com-etapa-trilho" aria-hidden="true">
            <span style={{ width: `${total ? (l.quantidade / total) * 100 : 0}%` }} />
          </span>
        </div>
      ))}
    </section>
  );
}
