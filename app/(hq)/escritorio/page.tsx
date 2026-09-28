"use client";

// Escritório virtual (Requirements 8.1, 8.2, 8.3, 8.6).
// Faz o polling incremental das atividades (usePoll) e um polling leve das
// aprovações pendentes, e passa tudo para o Office, que deriva o estado de
// cada mesa (ativo/ocioso/espera) a partir das atividades — funcionando mesmo
// para quem abre a tela no meio de um run.
//
// NOTA (subtask 11.2): log lateral, tokens do dia e o envelope animado a cada
// `delegou` entram depois; aqui já ficam o polling e a estrutura da tela.

import { useEffect, useState } from "react";
import { obter } from "../../../lib/api";
import { usePoll } from "../../../lib/usePoll";
import Office, { Atividade } from "../../../components/Office";
import LogLateral from "../../../components/LogLateral";

const INTERVALO_ATIV_MS = 1500;
const INTERVALO_APROV_MS = 3000;
// Polling leve dos tokens do dia (Requirement 8.5): não muda a cada frame.
const INTERVALO_TOKENS_MS = 5000;

type Aprovacao = { id: number; status: string };

export default function EscritorioPage() {
  const atividades = usePoll<Atividade>("/atividades", INTERVALO_ATIV_MS);
  const [temPendente, setTemPendente] = useState(false);
  const [tokens, setTokens] = useState<Record<string, number>>({});

  useEffect(() => {
    let ativo = true;

    async function buscarPendentes() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const lista = await obter<Aprovacao[]>("/aprovacoes?status=pendente");
        if (ativo) setTemPendente(Array.isArray(lista) && lista.length > 0);
      } catch {
        // erros de rede/401 (tratado no wrapper) não devem quebrar o loop
      }
    }

    buscarPendentes();
    const timer = setInterval(buscarPendentes, INTERVALO_APROV_MS);
    const aoMudarVisibilidade = () => {
      if (!document.hidden) buscarPendentes();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  // Polling leve dos tokens gastos hoje (por agente). O endpoint devolve
  // {agente: tokens} e é barato; atualizamos a cada 5 s.
  useEffect(() => {
    let ativo = true;

    async function buscarTokens() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const mapa = await obter<Record<string, number>>("/atividades/tokens");
        if (ativo && mapa && typeof mapa === "object") setTokens(mapa);
      } catch {
        // erros de rede/401 (tratado no wrapper) não devem quebrar o loop
      }
    }

    buscarTokens();
    const timer = setInterval(buscarTokens, INTERVALO_TOKENS_MS);
    const aoMudarVisibilidade = () => {
      if (!document.hidden) buscarTokens();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: "16px",
        padding: "16px",
      }}
    >
      <Office atividades={atividades} temAprovacaoPendente={temPendente} tokens={tokens} />
      <LogLateral atividades={atividades} tokens={tokens} />
    </div>
  );
}
