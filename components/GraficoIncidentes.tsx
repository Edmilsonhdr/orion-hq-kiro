"use client";

// Incidentes novos nos últimos dias (barras). Apresentação pura.

import { incidentesPorDia } from "../lib/incidentes";

export default function GraficoIncidentes({ incidentes, dias = 14 }: { incidentes: { primeira_vez: string }[]; dias?: number }) {
  const pontos = incidentesPorDia(incidentes, dias);
  const total = pontos.reduce((s, p) => s + p.total, 0);
  const maior = Math.max(1, ...pontos.map((p) => p.total));
  const L = 60;
  const largura = pontos.length * L;
  const altura = 100;
  return (
    <section className="painel inc-grafico" aria-label={`Incidentes novos nos últimos ${dias} dias`}>
      <h2 className="com-grafico-titulo">
        Novos nos últimos {dias} dias <span className="mono texto-secundario">· {total}</span>
      </h2>
      <svg viewBox={`0 0 ${largura} ${altura + 18}`} role="img" aria-label={pontos.map((p) => `${p.rotulo}: ${p.total}`).join("; ")}>
        {pontos.map((p, i) => {
          const h = (p.total / maior) * altura;
          return (
            <g key={p.dia}>
              <rect x={i * L + 4} y={altura - Math.max(h, p.total ? 3 : 1)} width={L - 8} height={Math.max(h, p.total ? 3 : 1)} rx={3} className={p.total ? "inc-barra" : "inc-barra-vazia"}>
                <title>{`${p.rotulo}: ${p.total}`}</title>
              </rect>
              {i % 2 === 0 && (
                <text x={i * L + L / 2} y={altura + 13} textAnchor="middle" className="inc-eixo">
                  {p.rotulo}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
