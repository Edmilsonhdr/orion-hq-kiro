"use client";

// Tela de aprovações (Requirements 9.1, 6.6).
// - Lista as aprovações pendentes (proposta legível + quem pediu + quando)
//   com botões Aprovar/Recusar, e o histórico das já decididas (9.1).
// - Trata o caso "já decidida": se os dois sócios decidirem ao mesmo tempo,
//   o backend responde { status: "ja_decidida" } com HTTP 200; a tela avisa
//   e recarrega a lista sem quebrar (6.6).
// - Polling leve com refetch completo (~3 s), pausando quando a aba não está
//   visível, no mesmo padrão do chat e do cabeçalho.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { obter, enviar, ErroApi } from "../../../lib/api";
import { agentePorId } from "../../../lib/agents";
import ApprovalCard, { Aprovacao } from "../../../components/ApprovalCard";
import { agentesDasAprovacoes, filtrarAprovacoes, filtrarPorAgente, type FiltroAprovacao } from "../../../lib/aprovacoes";

// Intervalo do polling da lista completa (~3 s: leve, não é tempo real).
const INTERVALO_APROV_MS = 3000;

export default function AprovacoesPage() {
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [decidindo, setDecidindo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroAprovacao>("todas");
  const [agente, setAgente] = useState("");
  const [lote, setLote] = useState(false);

  // Evita atualizar estado depois que o componente desmonta.
  const ativoRef = useRef(true);

  // Refetch completo: sem filtro traz pendentes + histórico já ordenados
  // (pendentes primeiro) pelo backend.
  const buscar = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const lista = await obter<Aprovacao[]>("/aprovacoes");
      if (ativoRef.current && Array.isArray(lista)) setAprovacoes(lista);
    } catch {
      // erros de rede/401 não devem quebrar o loop (401 redireciona no wrapper)
    }
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    buscar();
    const timer = setInterval(buscar, INTERVALO_APROV_MS);
    const aoMudarVisibilidade = () => {
      if (!document.hidden) buscar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      ativoRef.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [buscar]);

  const agentes = useMemo(() => agentesDasAprovacoes(aprovacoes), [aprovacoes]);
  const filtradas = useMemo(
    () => filtrarPorAgente(filtrarAprovacoes(aprovacoes, filtro), agente),
    [aprovacoes, filtro, agente],
  );
  const pendentes = useMemo(() => filtradas.filter((a) => a.status === "pendente"), [filtradas]);
  const historico = useMemo(() => filtradas.filter((a) => a.status !== "pendente"), [filtradas]);

  // Decide todas as pendentes visíveis, uma a uma (a mesma rota de cada cartão).
  async function decidirLote(aprovado: boolean) {
    if (lote || pendentes.length === 0) return;
    const verbo = aprovado ? "Aprovar" : "Recusar";
    if (!window.confirm(`${verbo} as ${pendentes.length} propostas pendentes listadas?`)) return;
    setLote(true);
    setAviso(null);
    let falhas = 0;
    for (const a of pendentes) {
      try {
        await enviar(`/aprovacoes/${a.id}`, { aprovado });
      } catch {
        falhas++;
      }
    }
    setLote(false);
    if (falhas > 0) setAviso(`${falhas} proposta(s) não puderam ser decididas agora.`);
    await buscar();
  }

  async function decidir(id: number, aprovado: boolean) {
    // Guarda o id em decisão para passar `ocupado` e evitar cliques duplos.
    if (decidindo !== null) return;
    setDecidindo(id);
    setAviso(null);
    try {
      const resposta = await enviar<{ status?: string }>(
        `/aprovacoes/${id}`,
        { aprovado }
      );
      // Caso "já decidida": outra pessoa decidiu ao mesmo tempo (6.6).
      if (resposta?.status === "ja_decidida") {
        setAviso("Essa aprovação já foi decidida por outra pessoa.");
      }
    } catch {
      // Em erro, apenas recarrega a lista abaixo para refletir o estado real.
    } finally {
      setDecidindo(null);
      // Em qualquer desfecho (sucesso, "já decidida" ou erro), recarrega a
      // lista: o item sai de pendentes e aparece no histórico quando decidido.
      await buscar();
    }
  }

  // Tenta de novo uma aprovação cuja ação falhou (status "erro").
  async function retomar(id: number) {
    if (decidindo !== null) return;
    setDecidindo(id);
    setAviso(null);
    try {
      const resposta = await enviar<{ status?: string }>(
        `/aprovacoes/${id}/retomar`
      );
      if (resposta?.status === "erro") {
        setAviso("Ainda não deu certo. Tente de novo em instantes.");
      }
    } catch (erro) {
      setAviso(
        erro instanceof ErroApi && erro.status === 409
          ? "Essa aprovação já foi retomada."
          : "Não foi possível tentar de novo agora."
      );
    } finally {
      setDecidindo(null);
      await buscar();
    }
  }

  return (
    <div className="docs-pagina pagina-estreita">
      <div className="com-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">Aprovações</h1>
          <p className="texto-secundario" style={{ margin: "6px 0 0" }}>
            Nada que os agentes propõem é aplicado antes de um sócio aprovar aqui.
          </p>
        </div>
      </div>
      <div className="aprov-filtros" role="group" aria-label="Filtrar por tipo">
        {(["todas", "documentos", "comercial", "reunioes"] as FiltroAprovacao[]).map((f) => (
          <button key={f} type="button" className={`aprov-filtro${filtro === f ? " ativo" : ""}`} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {{ todas: "Todas", documentos: "Documentos", comercial: "Comercial", reunioes: "Reuniões" }[f]}
          </button>
        ))}
        {agentes.length > 1 && (
          <select aria-label="Filtrar por agente" value={agente} onChange={(e) => setAgente(e.target.value)} className="aprov-filtro-agente">
            <option value="">Todos os agentes</option>
            {agentes.map((a) => (
              <option key={a} value={a}>
                {agentePorId(a)?.papel ?? a}
              </option>
            ))}
          </select>
        )}
        {pendentes.length > 1 && (
          <span className="aprov-lote">
            <button type="button" onClick={() => decidirLote(true)} disabled={lote}>
              Aprovar todas ({pendentes.length})
            </button>
            <button type="button" onClick={() => decidirLote(false)} disabled={lote}>
              Recusar todas
            </button>
          </span>
        )}
      </div>
      {/* Aviso de "já decidida" e afins (6.6). */}
      <div aria-live="polite">
        {aviso && (
          <p
            role="status"
            className="texto-secundario"
            style={{ margin: 0, color: "var(--espera)" }}
          >
            {aviso}
          </p>
        )}
      </div>

      <section
        aria-label="Aprovações pendentes"
        style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      >
        <h2 className="com-grupo-titulo" style={{ margin: 0 }}>
          Pendentes <span className="mono texto-secundario">{pendentes.length}</span>
        </h2>
        {pendentes.length === 0 ? (
          <div className="docs-vazio">
            <strong>Nenhuma aprovação pendente</strong>
            Quando um agente propor uma reunião, um documento ou uma mudança no Comercial, ela aparece aqui.
          </div>
        ) : (
          pendentes.map((a) => (
            <ApprovalCard
              key={a.id}
              aprovacao={a}
              onDecidir={decidir}
              ocupado={decidindo === a.id}
            />
          ))
        )}
      </section>

      <section
        aria-label="Histórico de aprovações"
        style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      >
        <h2 className="com-grupo-titulo" style={{ margin: 0 }}>
          Histórico <span className="mono texto-secundario">{historico.length}</span>
        </h2>
        {historico.length === 0 ? (
          <div className="docs-vazio">
            <strong>Nenhuma aprovação decidida ainda</strong>
            As decisões aprovadas, recusadas e obsoletas ficam registradas aqui.
          </div>
        ) : (
          historico.map((a) => (
            <ApprovalCard
              key={a.id}
              aprovacao={a}
              onRetomar={retomar}
              ocupado={decidindo === a.id}
            />
          ))
        )}
      </section>
    </div>
  );
}
