"use client";

// Escritório virtual com rotina (Requirements 8 e 12).
// Faz o polling incremental das atividades, e polling leve das aprovações
// pendentes, dos incidentes abertos (luz da guarita) e dos tokens do dia. O
// Office deriva a cena inteira (plantão, copa, noite) do relógio e dessas
// atividades via lib/rotina.ts.

import { useEffect, useMemo, useState } from "react";
import { obter } from "../../../lib/api";
import { usePollComEstado } from "../../../lib/usePoll";
import { deslocarDatas, useRelogio } from "../../../lib/useRelogio";
import { agentePorId, pessoaDoAgente } from "../../../lib/agents";
import { plantaoEm } from "../../../lib/rotina";
import Office, { Atividade } from "../../../components/Office";
import LogLateral from "../../../components/LogLateral";

const INTERVALO_ATIV_MS = 1500;
const INTERVALO_APROV_MS = 3000;
const INTERVALO_TOKENS_MS = 5000;
const INTERVALO_INCIDENTES_MS = 5000;

type Aprovacao = { id: number; status: string };

// Polling leve de um endpoint pequeno, pausado com a aba oculta.
function usePollLeve<T>(caminho: string, intervaloMs: number, inicial: T): T {
  const [valor, setValor] = useState<T>(inicial);
  useEffect(() => {
    let ativo = true;
    async function buscar() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const resposta = await obter<T>(caminho);
        if (ativo && resposta !== undefined && resposta !== null) setValor(resposta);
      } catch {
        // erros de rede/401 (tratado no wrapper) não devem quebrar o loop
      }
    }
    buscar();
    const timer = setInterval(buscar, intervaloMs);
    const aoMudarVisibilidade = () => {
      if (!document.hidden) buscar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [caminho, intervaloMs]);
  return valor;
}

export default function EscritorioPage() {
  const { itens, carregado } = usePollComEstado<Atividade>("/atividades", INTERVALO_ATIV_MS);
  const { agora, deslocamentoMs } = useRelogio();
  const atividades = useMemo(() => deslocarDatas(itens, deslocamentoMs), [itens, deslocamentoMs]);
  const pendentes = usePollLeve<Aprovacao[]>("/aprovacoes?status=pendente", INTERVALO_APROV_MS, []);
  const tokens = usePollLeve<Record<string, number>>("/atividades/tokens", INTERVALO_TOKENS_MS, {});
  const incidentes = usePollLeve<{ abertos: number }>("/incidentes/resumo", INTERVALO_INCIDENTES_MS, {
    abertos: 0,
  });

  const orq = agentePorId("orq")!;
  const plantao = agora === null ? null : pessoaDoAgente(orq, plantaoEm(agora, atividades).pessoa);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "16px" }}>
      <div className="texto-secundario" style={{ fontSize: "13px" }} aria-live="polite">
        Escritório dos agentes
        {plantao && (
          <>
            {" · de plantão: "}
            <span style={{ color: plantao.corChat, fontWeight: 600 }}>{plantao.nome}</span>
          </>
        )}
        {" · N2 especialistas · N3 tarefas rápidas"}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        {agora === null ? (
          <div className="esc-planta esc-madeira" aria-label="Carregando o escritório" />
        ) : (
          <Office
            atividades={atividades}
            agora={agora}
            pronto={carregado}
            temAprovacaoPendente={Array.isArray(pendentes) && pendentes.length > 0}
            incidenteAberto={(incidentes?.abertos ?? 0) > 0}
            tokens={tokens}
          />
        )}
        <LogLateral atividades={atividades} tokens={tokens} />
      </div>
    </div>
  );
}
