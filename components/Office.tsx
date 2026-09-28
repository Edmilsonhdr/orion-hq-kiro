"use client";

// Escritório virtual (Requirements 8.1, 8.2, 8.3, 8.6).
// Área 872×688 com piso quadriculado, uma mesa por agente nas posições de
// lib/agents.ts (Orquestrador no centro) e linhas tracejadas da hierarquia
// (orq → cada especialista).
//
// O estado de cada mesa é DERIVADO das atividades (não de memória local), para
// funcionar mesmo para quem abre a tela no meio de um run (Requirement 8.6):
//   - ativo:  a última atividade do agente é de trabalho
//             (inicio|pensando|ferramenta|delegou) e tem menos de 30 s
//             (Requirement 8.2);
//   - espera: existe aprovação pendente → mesa da Agenda em âmbar
//             (Requirement 8.3);
//   - ocioso: nenhum dos casos acima.
//
// Este componente recebe as atividades e a flag de aprovação pendente por
// props; o polling incremental fica na página (app/(hq)/escritorio/page.tsx).
//
// Envelope animado (subtask 11.2, Requirement 8.4): a cada atividade nova de
// tipo `delegou`, um envelope aparece na mesa de origem (dados.de) e desliza
// até a mesa de destino (dados.para) em ~1,3 s (transição CSS de left/top na
// camada .escritorio-overlay). Novos `delegou` são detectados pelo maior id já
// processado, e vários em sequência são animados ao mesmo tempo. Com
// prefers-reduced-motion a transição é zerada no globals.css, então o envelope
// pula direto ao destino (Requirement 8.7).

import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTES, agentePorId, IdAgente } from "../lib/agents";
import Desk, { ALTURA_MESA, EstadoMesa, LARGURA_MESA } from "./Desk";

export const LARGURA_ESCRITORIO = 872;
export const ALTURA_ESCRITORIO = 688;

const ID_ORQUESTRADOR: IdAgente = "orq";

// Uma atividade mantém a mesa "ativa" enquanto for recente e for de trabalho.
const IDADE_ATIVA_MS = 30000;
const TIPOS_TRABALHO = new Set(["inicio", "pensando", "ferramenta", "delegou"]);

// Duração do voo do envelope (deve casar com a transição do .envelope no CSS).
const DURACAO_ENVELOPE_MS = 1300;
// Margem extra antes de remover o envelope do DOM, após a transição terminar.
const FOLGA_REMOCAO_MS = 350;

// Um envelope em voo: da posição de origem até a de destino.
type Envelope = {
  chave: string;
  de: { cx: number; cy: number };
  para: { cx: number; cy: number };
  cor: string;
  // false enquanto está na origem; vira true no próximo frame para disparar
  // a transição CSS de left/top até o destino.
  emVoo: boolean;
};

export type Atividade = {
  id: number;
  run_id: string | null;
  agente: string;
  tipo: string;
  detalhe: string | null;
  dados: Record<string, unknown> | null;
  tokens: number;
  criado_em: string;
};

type InfoMesa = {
  estado: EstadoMesa;
  detalhe: string | null;
};

// Centro de uma mesa na área do escritório (útil para a camada de envelope, 11.2).
export function centroMesa(x: number, y: number): { cx: number; cy: number } {
  return { cx: x + LARGURA_MESA / 2, cy: y + ALTURA_MESA / 2 };
}

function idadeMs(criadoEm: string): number {
  const t = new Date(criadoEm).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Date.now() - t;
}

// Deriva o estado de cada agente a partir da lista de atividades e da
// existência de aprovação pendente. Usa a última atividade de cada agente.
function derivarEstados(
  atividades: Atividade[],
  temAprovacaoPendente: boolean
): Record<string, InfoMesa> {
  const ultimaPorAgente = new Map<string, Atividade>();
  for (const a of atividades) {
    const anterior = ultimaPorAgente.get(a.agente);
    if (!anterior || a.id > anterior.id) {
      ultimaPorAgente.set(a.agente, a);
    }
  }

  const estados: Record<string, InfoMesa> = {};
  for (const agente of AGENTES) {
    const ultima = ultimaPorAgente.get(agente.id);
    const ativo =
      !!ultima &&
      TIPOS_TRABALHO.has(ultima.tipo) &&
      idadeMs(ultima.criado_em) < IDADE_ATIVA_MS;

    let estado: EstadoMesa = ativo ? "ativo" : "ocioso";
    // Espera tem prioridade sobre ocioso e recai sobre a Agenda (Requirement 8.3).
    if (agente.id === "agenda" && temAprovacaoPendente) {
      estado = "espera";
    }

    estados[agente.id] = {
      estado,
      detalhe: ativo ? (ultima?.detalhe ?? null) : null,
    };
  }
  return estados;
}

// Detecta atividades novas de tipo `delegou` (pelo maior id já processado) e
// devolve os envelopes que devem estar em voo. Cada `delegou` vira um envelope
// que começa na mesa `dados.de` e, no frame seguinte, recebe a posição da mesa
// `dados.para` para a transição CSS animar. O envelope é removido depois que a
// transição termina. Vários `delegou` em sequência geram vários envelopes.
function useEnvelopes(atividades: Atividade[]): Envelope[] {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  // Maior id de atividade já processado (evita reanimar ao reprocessar a lista).
  const ultimoIdRef = useRef(0);
  // Guarda os timers de remoção para limpar no unmount.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const novos = atividades
      .filter((a) => a.id > ultimoIdRef.current && a.tipo === "delegou")
      .sort((a, b) => a.id - b.id);

    if (atividades.length > 0) {
      const maior = atividades.reduce(
        (max, a) => (a.id > max ? a.id : max),
        ultimoIdRef.current
      );
      ultimoIdRef.current = maior;
    }

    if (novos.length === 0) return;

    const criados: Envelope[] = [];
    for (const a of novos) {
      const de = typeof a.dados?.de === "string" ? a.dados.de : null;
      const para = typeof a.dados?.para === "string" ? a.dados.para : null;
      const agDe = de ? agentePorId(de) : undefined;
      const agPara = para ? agentePorId(para) : undefined;
      // Sem origem/destino conhecidos não há como animar; ignora com segurança.
      if (!agDe || !agPara) continue;

      criados.push({
        chave: `env-${a.id}`,
        de: centroMesa(agDe.x, agDe.y),
        para: centroMesa(agPara.x, agPara.y),
        cor: agDe.cor,
        emVoo: false,
      });
    }

    if (criados.length === 0) return;

    // Monta os envelopes na origem.
    setEnvelopes((atuais) => [...atuais, ...criados]);

    // No próximo frame, marca como "em voo" para disparar a transição CSS.
    const raf = requestAnimationFrame(() => {
      setEnvelopes((atuais) =>
        atuais.map((e) =>
          criados.some((c) => c.chave === e.chave) ? { ...e, emVoo: true } : e
        )
      );
    });

    // Remove os envelopes depois que a transição termina.
    const chavesCriadas = new Set(criados.map((c) => c.chave));
    const timer = setTimeout(() => {
      setEnvelopes((atuais) => atuais.filter((e) => !chavesCriadas.has(e.chave)));
    }, DURACAO_ENVELOPE_MS + FOLGA_REMOCAO_MS);
    timersRef.current.push(timer);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [atividades]);

  // Limpa timers pendentes no unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  return envelopes;
}

export default function Office({
  atividades,
  temAprovacaoPendente = false,
  tokens = {},
}: {
  atividades: Atividade[];
  temAprovacaoPendente?: boolean;
  tokens?: Record<string, number>;
}) {
  const estados = useMemo(
    () => derivarEstados(atividades, temAprovacaoPendente),
    [atividades, temAprovacaoPendente]
  );

  const envelopes = useEnvelopes(atividades);

  const orq = agentePorId(ID_ORQUESTRADOR);
  const centroOrq = orq ? centroMesa(orq.x, orq.y) : null;

  // Especialistas ligados ao Orquestrador (todos menos o próprio orq).
  const especialistas = AGENTES.filter((a) => a.id !== ID_ORQUESTRADOR);

  return (
    <div
      className="piso"
      role="img"
      aria-label="Escritório virtual dos agentes"
      style={{
        position: "relative",
        width: `${LARGURA_ESCRITORIO}px`,
        height: `${ALTURA_ESCRITORIO}px`,
        maxWidth: "100%",
        border: "1px solid var(--borda)",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      {/* Linhas tracejadas da hierarquia (orq → especialistas) */}
      <svg
        width={LARGURA_ESCRITORIO}
        height={ALTURA_ESCRITORIO}
        viewBox={`0 0 ${LARGURA_ESCRITORIO} ${ALTURA_ESCRITORIO}`}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {centroOrq &&
          especialistas.map((esp) => {
            const c = centroMesa(esp.x, esp.y);
            return (
              <line
                key={esp.id}
                x1={centroOrq.cx}
                y1={centroOrq.cy}
                x2={c.cx}
                y2={c.cy}
                stroke="var(--borda-forte)"
                strokeWidth={2}
                strokeDasharray="6 6"
              />
            );
          })}
      </svg>

      {/* Mesas nas posições de lib/agents.ts */}
      {AGENTES.map((agente) => {
        const info = estados[agente.id];
        return (
          <div
            key={agente.id}
            style={{
              position: "absolute",
              left: `${agente.x}px`,
              top: `${agente.y}px`,
              zIndex: 2,
            }}
          >
            <Desk
              agente={agente}
              estado={info?.estado ?? "ocioso"}
              detalhe={info?.detalhe}
              tokens={tokens[agente.id] ?? 0}
            />
          </div>
        );
      })}

      {/* Camada de sobreposição com os envelopes animados (Requirement 8.4). */}
      <div
        className="escritorio-overlay"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}
      >
        {envelopes.map((env) => {
          const pos = env.emVoo ? env.para : env.de;
          return (
            <div
              key={env.chave}
              className="envelope"
              style={{
                left: `${pos.cx}px`,
                top: `${pos.cy}px`,
                color: env.cor,
                borderColor: env.cor,
                boxShadow: `0 0 10px ${env.cor}73`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
