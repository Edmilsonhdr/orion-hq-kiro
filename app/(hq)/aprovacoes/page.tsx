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
import { obter, enviar } from "../../../lib/api";
import ApprovalCard, { Aprovacao } from "../../../components/ApprovalCard";

// Intervalo do polling da lista completa (~3 s: leve, não é tempo real).
const INTERVALO_APROV_MS = 3000;

export default function AprovacoesPage() {
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [decidindo, setDecidindo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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

  const pendentes = useMemo(
    () => aprovacoes.filter((a) => a.status === "pendente"),
    [aprovacoes]
  );
  const historico = useMemo(
    () => aprovacoes.filter((a) => a.status !== "pendente"),
    [aprovacoes]
  );

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

  return (
    <div
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "16px",
      }}
    >
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
        <h2 className="titulo-pixel" style={{ fontSize: "14px", margin: 0 }}>
          Pendentes
        </h2>
        {pendentes.length === 0 ? (
          <p className="texto-secundario" style={{ margin: 0 }}>
            Nenhuma aprovação pendente.
          </p>
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
        <h2 className="titulo-pixel" style={{ fontSize: "14px", margin: 0 }}>
          Histórico
        </h2>
        {historico.length === 0 ? (
          <p className="texto-secundario" style={{ margin: 0 }}>
            Nenhuma aprovação decidida ainda.
          </p>
        ) : (
          historico.map((a) => <ApprovalCard key={a.id} aprovacao={a} />)
        )}
      </section>
    </div>
  );
}
