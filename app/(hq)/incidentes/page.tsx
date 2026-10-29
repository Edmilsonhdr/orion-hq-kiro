"use client";

// Tela de Incidentes do Vigia (Requirements 6.1–6.5).
// - Lista os incidentes com os `aberto` primeiro (o backend já ordena),
//   mostrando título, projeto, nível, ocorrências, usuários afetados, última
//   vez e status (6.2).
// - Ao abrir um incidente, carrega o detalhe (GET /api/incidentes/{id}) e
//   mostra o diagnóstico de forma legível (6.3).
// - Botões "Marcar como resolvido", "Ignorar", "Diagnosticar agora" (fila) e
//   "Propor correção · em breve" desabilitado ficam no IncidenteCard (6.4, 6.5).
// - Polling leve com refetch completo (~3 s), no mesmo padrão das aprovações.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { obter, enviar } from "../../../lib/api";
import IncidenteCard, {
  IncidenteDetalhe,
  IncidenteLista,
} from "../../../components/IncidenteCard";

// Intervalo do polling da lista (~3 s: leve, não é tempo real).
const INTERVALO_INCIDENTES_MS = 3000;

export default function IncidentesPage() {
  const [incidentes, setIncidentes] = useState<IncidenteLista[]>([]);
  // id do incidente expandido (só um por vez).
  const [abertoId, setAbertoId] = useState<number | null>(null);
  // Detalhe carregado sob demanda: undefined = carregando, null = sem detalhe.
  const [detalhe, setDetalhe] = useState<IncidenteDetalhe | null | undefined>(
    undefined
  );
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Evita atualizar estado depois que o componente desmonta.
  const ativoRef = useRef(true);

  // Refetch completo: sem filtro traz os abertos primeiro (backend ordena).
  const buscar = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const lista = await obter<IncidenteLista[]>("/incidentes");
      if (ativoRef.current && Array.isArray(lista)) setIncidentes(lista);
    } catch {
      // erros de rede/401 não devem quebrar o loop (401 redireciona no wrapper)
    }
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    buscar();
    const timer = setInterval(buscar, INTERVALO_INCIDENTES_MS);
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

  // Carrega o detalhe de um incidente (para mostrar o diagnóstico).
  const carregarDetalhe = useCallback(async (id: number) => {
    setDetalhe(undefined);
    try {
      const d = await obter<IncidenteDetalhe>(`/incidentes/${id}`);
      if (ativoRef.current) setDetalhe(d);
    } catch {
      if (ativoRef.current) setDetalhe(null);
    }
  }, []);

  function abrir(id: number) {
    if (abertoId === id) {
      setAbertoId(null);
      setDetalhe(undefined);
      return;
    }
    setAbertoId(id);
    carregarDetalhe(id);
  }

  async function mudarStatus(
    id: number,
    status: "resolvido" | "ignorado"
  ) {
    if (ocupadoId !== null) return;
    setOcupadoId(id);
    setAviso(null);
    try {
      await enviar(`/incidentes/${id}/status`, { status });
    } catch {
      setAviso("Não foi possível mudar o status agora.");
    } finally {
      setOcupadoId(null);
      await buscar();
    }
  }

  async function diagnosticar(id: number) {
    if (ocupadoId !== null) return;
    setOcupadoId(id);
    setAviso(null);
    try {
      const resposta = await enviar<{ status?: string }>(
        `/incidentes/${id}/diagnosticar`
      );
      // Acima do limite por hora, o backend devolve { status: "fila" } sem
      // diagnosticar (Requirement 4).
      if (resposta?.status === "fila") {
        setAviso(
          "Limite de diagnósticos por hora atingido. O incidente segue na fila."
        );
      } else if (resposta?.status === "erro") {
        setAviso("O diagnóstico falhou. Tente de novo em instantes.");
      }
    } catch {
      setAviso("Não foi possível diagnosticar agora.");
    } finally {
      setOcupadoId(null);
      await buscar();
      // Recarrega o detalhe se o incidente diagnosticado está aberto.
      if (abertoId === id) await carregarDetalhe(id);
    }
  }

  // Agrupa por projeto (a ordem por status do backend se mantém dentro de cada grupo).
  const ordenados = useMemo(
    () => incidentes.map((inc, i) => ({ inc, i })).sort((a, b) => a.inc.projeto.localeCompare(b.inc.projeto) || a.i - b.i).map((x) => x.inc),
    [incidentes]
  );
  const porProjeto = useMemo(() => {
    const mapa = new Map<string, { projeto: string; abertos: number; ocorrencias: number }>();
    for (const i of incidentes) {
      const g = mapa.get(i.projeto) ?? { projeto: i.projeto, abertos: 0, ocorrencias: 0 };
      g.ocorrencias += i.ocorrencias;
      if (i.status === "aberto") g.abertos += 1;
      mapa.set(i.projeto, g);
    }
    return [...mapa.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);
  }, [incidentes]);
  const maiorOcorrencias = Math.max(1, ...porProjeto.map((g) => g.ocorrencias));

  return (
    <div className="docs-pagina pagina-estreita">
      <div className="com-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">Incidentes</h1>
          <p className="texto-secundario" style={{ margin: "6px 0 0" }}>
            Erros e instabilidades do app que o Vigia detectou, com diagnóstico quando você pedir.
          </p>
        </div>
      </div>

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

      {incidentes.length === 0 ? (
        <div className="docs-vazio">
          <strong>Nenhum incidente registrado</strong>
          Quando o app do Orion apresentar um erro novo, o Vigia registra aqui.
        </div>
      ) : (
        <section
          aria-label="Lista de incidentes"
          style={{ display: "flex", flexDirection: "column", gap: "10px" }}
        >
          <div className="inc-resumo" role="group" aria-label="Incidentes por projeto">
            {porProjeto.map((g) => (
              <div key={g.projeto} className="painel inc-resumo-item">
                <div className="inc-resumo-nome">{g.projeto}</div>
                <div className="inc-resumo-barra" aria-hidden="true">
                  <span style={{ width: `${(g.ocorrencias / maiorOcorrencias) * 100}%` }} />
                </div>
                <div className="mono texto-secundario">
                  {g.abertos} abertos · {g.ocorrencias} ocorrências
                </div>
              </div>
            ))}
          </div>
          {ordenados.map((inc, i) => (
            <Fragment key={inc.id}>
              {(i === 0 || ordenados[i - 1].projeto !== inc.projeto) && (
                <h2 className="com-grupo-titulo inc-grupo">{inc.projeto}</h2>
              )}
            <IncidenteCard
              key={inc.id}
              incidente={inc}
              aberto={abertoId === inc.id}
              detalhe={abertoId === inc.id ? detalhe : undefined}
              ocupado={ocupadoId === inc.id}
              onAbrir={abrir}
              onStatus={mudarStatus}
              onDiagnosticar={diagnosticar}
            />
            </Fragment>
          ))}
        </section>
      )}
    </div>
  );
}
