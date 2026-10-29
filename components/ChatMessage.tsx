"use client";

// Bolha de mensagem do chat do grupo (design.md).
// - Orquestrador ("Orquestrador") à esquerda, com a cor do agente `orq`.
// - Sócios (dimi/jullyana) à direita.
// O componente é puramente de apresentação; recebe a mensagem já pronta.

import type { ReactNode } from "react";
import type { Pessoa } from "../lib/agents";
import { useState } from "react";
import Link from "next/link";
import { enviar } from "../lib/api";
import type { Fonte } from "../lib/fontes";
import type { Documento } from "../lib/docs";
import Markdown from "./Markdown";
import { FiguraMini } from "./Personagem";

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

// `assinatura`: quem estava de plantão no horário da mensagem (as mensagens
// do Orquestrador são assinadas por essa pessoa; o banco guarda "Orquestrador").

function tituloDe(texto: string): string {
  const linha = texto.split("\n").find((l) => l.trim().length > 0) ?? "Resposta do chat";
  return linha.replace(/^[#>*\-\s]+/, "").slice(0, 80) || "Resposta do chat";
}

export default function ChatMessage({
  mensagem,
  assinatura,
  fontes = [],
}: {
  mensagem: Mensagem;
  assinatura?: Pessoa | null;
  // Fontes consultadas no run desta resposta (de `fontesDe`), com link quando há.
  fontes?: Fonte[];
}) {
  const [salvo, setSalvo] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarNoDocs() {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const doc = await enviar<Documento>("/documentos", {
        titulo: tituloDe(mensagem.texto),
        conteudo: mensagem.texto,
        pasta: "Do chat",
        pai_id: null,
        tags: ["chat"],
      });
      setSalvo(doc.id);
    } catch {
      setErro("Não foi possível salvar no Docs.");
    } finally {
      setSalvando(false);
    }
  }

  const doOrquestrador = mensagem.autor === AUTOR_ORQ;
  const corOrq = assinatura?.corChat ?? "var(--destaque)";

  const nome = doOrquestrador ? (assinatura?.nome ?? "Orquestrador") : mensagem.autor;
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
          style={{
            position: "relative",
            flexShrink: 0,
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            background: "var(--painel)",
            border: `1px solid ${corOrq}`,
            overflow: "hidden",
          }}
        >
          {assinatura && (
            <div style={{ position: "absolute", left: 7, top: 8, width: 20, height: 34 }}>
              <FiguraMini visual={assinatura.visual} />
            </div>
          )}
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
        {doOrquestrador ? (
          <div className="chat-markdown">
            <Markdown texto={mensagem.texto} />
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{comLinks(mensagem.texto)}</div>
        )}
        {doOrquestrador && (
          <div className="chat-rodape-msg">
            {fontes.length > 0 && (
              <span className="texto-secundario">
                consultou:{" "}
                {fontes.map((f, i) => (
                  <span key={f.rotulo}>
                    {i > 0 && ", "}
                    {f.href ? <Link href={f.href}>{f.rotulo}</Link> : f.rotulo}
                  </span>
                ))}
              </span>
            )}
            {salvo ? (
              <Link href={`/docs/${salvo}`}>Salvo no Docs — abrir</Link>
            ) : (
              <button type="button" className="chat-salvar" onClick={salvarNoDocs} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar no Docs"}
              </button>
            )}
            {erro && <span role="alert" className="doc-erro">{erro}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
