"use client";

// Quadro do funil: uma coluna por etapa. Mover o cartão por arrastar e soltar OU pelo seletor do
// próprio cartão (teclado e celular). A decisão (inclusive pedir o motivo da perda) fica na página.

import { useState } from "react";
import Link from "next/link";
import {
  ETAPAS,
  ETAPAS_ABERTAS,
  ROTULO_ETAPA,
  formatarDia,
  formatarReais,
  hojeISO,
  situacaoPasso,
  type Etapa,
  type Negocio,
} from "../lib/comercial";

type Props = {
  negocios: Negocio[];
  onMover: (negocio: Negocio, etapa: Etapa) => void;
};

export default function Funil({ negocios, onMover }: Props) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const hoje = hojeISO();

  const coluna = (etapa: Etapa) => {
    const cartoes = negocios.filter((n) => n.etapa === etapa);
        const total = cartoes.reduce((s, n) => s + (n.valor_mensal ?? 0), 0);
        return (
          <section
            key={etapa}
            className={`funil-coluna funil-${etapa}${sobre === etapa ? " funil-sobre" : ""}`}
            aria-label={`${ROTULO_ETAPA[etapa]}: ${cartoes.length} negócios`}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(etapa);
            }}
            onDragLeave={() => setSobre((atual) => (atual === etapa ? null : atual))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const alvo = negocios.find((n) => n.id === arrastando);
              setArrastando(null);
              if (alvo && alvo.etapa !== etapa) onMover(alvo, etapa);
            }}
          >
            <header className="funil-topo">
              <span className="funil-nome">{ROTULO_ETAPA[etapa]}</span>
              <span className="mono texto-secundario">{cartoes.length}</span>
            </header>
            <div className="funil-total mono texto-secundario">{total ? formatarReais(total) : " "}</div>
            <div className="funil-cartoes">
              {cartoes.length === 0 && <p className="funil-vazio texto-secundario">Nenhum negócio</p>}
              {cartoes.map((n) => {
                const situacao = situacaoPasso(n.proximo_passo_em, hoje);
                return (
                  <article
                    key={n.id}
                    className={`funil-cartao${arrastando === n.id ? " arrastando" : ""}`}
                    draggable
                    onDragStart={() => setArrastando(n.id)}
                    onDragEnd={() => {
                      setArrastando(null);
                      setSobre(null);
                    }}
                  >
                    <Link href={`/comercial/negocios/${n.id}`} className="funil-titulo">
                      {n.titulo}
                    </Link>
                    <div className="funil-org texto-secundario">{n.organizacao_nome}</div>
                    {n.valor_mensal !== null && <div className="mono funil-valor">{formatarReais(n.valor_mensal)}/mês</div>}
                    {n.proximo_passo && (
                      <div className={`funil-passo passo-${situacao}`}>
                        {n.proximo_passo}
                        {n.proximo_passo_em && <span className="mono"> · {formatarDia(n.proximo_passo_em)}</span>}
                      </div>
                    )}
                    <select
                      className="funil-mover"
                      aria-label={`Mover ${n.titulo} para outra etapa`}
                      value={n.etapa}
                      onChange={(e) => onMover(n, e.target.value as Etapa)}
                    >
                      {ETAPAS.map((e) => (
                        <option key={e} value={e}>
                          {ROTULO_ETAPA[e]}
                        </option>
                      ))}
                    </select>
                  </article>
                );
              })}
            </div>
          </section>
        );
  };

  // As etapas abertas dividem a largura (sem rolagem lateral); ganho e perdido ficam numa linha abaixo.
  const fechadas = ETAPAS.filter((e) => !(ETAPAS_ABERTAS as readonly string[]).includes(e));
  return (
    <div className="funil-quadro" role="group" aria-label="Funil de vendas">
      <div className="funil">{ETAPAS_ABERTAS.map((e) => coluna(e))}</div>
      <div className="funil funil-fechados">{fechadas.map((e) => coluna(e))}</div>
    </div>
  );
}
