"use client";

// Bolha de mensagem do chat do grupo (design.md).
// - Orquestrador ("Orquestrador") à esquerda, com a cor do agente `orq`.
// - Sócios (dimi/jullyana) à direita.
// O componente é puramente de apresentação; recebe a mensagem já pronta.

import type { ReactNode } from "react";
import { agentePorId } from "../lib/agents";

export type Mensagem = {
  id: number;
  autor: string;
  texto: string;
  run_id: string | null;
  criado_em: string;
};

// Autor "Orquestrador" (vindo do backend) é o único agente que escreve no chat.
const AUTOR_ORQ = "Orquestrador";

function horario(criadoEm: string): string {
  try {
    const data = new Date(criadoEm);
    return data.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const PADRAO_URL = /(https?:\/\/[^\s<>"]+)/g;
// Pontuação no fim de uma URL costuma ser do texto, não do link.
const PONTUACAO_FINAL = /[.,;:!?)\]]+$/;

// Quebra o texto em trechos, transformando URLs em links clicáveis. Tudo é
// renderizado como elementos React (sem HTML cru), então o texto é escapado.
function comLinks(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  let inicio = 0;
  for (const achado of texto.matchAll(PADRAO_URL)) {
    const bruto = achado[0];
    const posicao = achado.index ?? 0;
    const sobra = bruto.match(PONTUACAO_FINAL)?.[0] ?? "";
    const url = bruto.slice(0, bruto.length - sobra.length);
    if (posicao > inicio) partes.push(texto.slice(inicio, posicao));
    partes.push(
      <a key={posicao} href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    );
    if (sobra) partes.push(sobra);
    inicio = posicao + bruto.length;
  }
  if (inicio < texto.length) partes.push(texto.slice(inicio));
  return partes;
}

function iniciais(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return "?";
  return limpo.charAt(0).toUpperCase();
}

export default function ChatMessage({ mensagem }: { mensagem: Mensagem }) {
  const doOrquestrador = mensagem.autor === AUTOR_ORQ;
  const corOrq = agentePorId("orq")?.cor ?? "var(--destaque)";

  const nome = doOrquestrador ? "Orquestrador" : mensagem.autor;
  const corAcento = doOrquestrador ? corOrq : "var(--borda-forte)";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: doOrquestrador ? "flex-start" : "flex-end",
        gap: "10px",
      }}
    >
      {doOrquestrador && (
        <div
          aria-hidden="true"
          className="titulo-pixel"
          style={{
            flexShrink: 0,
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            background: "var(--painel)",
            border: `1px solid ${corOrq}`,
            color: corOrq,
            fontSize: "14px",
          }}
        >
          {iniciais(nome)}
        </div>
      )}

      <div
        className="painel"
        style={{
          maxWidth: "min(560px, 78%)",
          padding: "10px 14px",
          borderLeft: doOrquestrador ? `3px solid ${corAcento}` : undefined,
          borderRight: doOrquestrador ? undefined : `3px solid var(--destaque)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "4px",
          }}
        >
          <span
            className="titulo-pixel"
            style={{
              fontSize: "12px",
              color: doOrquestrador ? corOrq : "var(--texto-secundario)",
            }}
          >
            {nome}
          </span>
          <span
            className="mono texto-secundario"
            style={{ fontSize: "11px" }}
          >
            {horario(mensagem.criado_em)}
          </span>
        </div>
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {comLinks(mensagem.texto)}
        </div>
      </div>
    </div>
  );
}
