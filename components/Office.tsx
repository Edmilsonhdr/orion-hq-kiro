"use client";

// Escritório virtual com rotina (docs/mockup-escritorio.dc.html).
//
// Planta 872×688: Engenharia, Sala do Chefe e Agenda em cima; corredor de
// madeira com a guarita do Rui na ponta esquerda; Negócios, Copa e Baia dos
// Workers embaixo.
//
// Quem está de plantão, quem está na copa, quem foi pra casa e quem está
// trabalhando é DERIVADO por lib/rotina.ts do relógio e das atividades do
// banco: duas telas mostram a mesma cena. Aqui só ficam a apresentação e as
// animações de transição (caminhadas pelo corredor e o envelope de cada
// delegação), que não mudam o estado final.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AGENTES, SALA_COPA, agentePorId, pessoaDoAgente, type Agente, type Sala } from "../lib/agents";
import {
  chavePessoa,
  derivarCena,
  destinoEnvelope,
  fraseOciosa,
  type Cena,
  type EntradaCena,
} from "../lib/rotina";
import {
  ALTURA_PLANTA,
  EM_PE_COPA,
  LARGURA_PLANTA,
  LUGARES_COPA,
  caminho,
  rotaEnvelope,
  type Ponto,
  type Posicao,
} from "../lib/planta";
import Desk, { type EstadoMesa } from "./Desk";
import Guarita from "./Guarita";
import { Decoracao, Portas } from "./Decoracao";
import { FiguraMini } from "./Personagem";

export const LARGURA_ESCRITORIO = LARGURA_PLANTA;
export const ALTURA_ESCRITORIO = ALTURA_PLANTA;

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

const PASSO_MS = 460;
const PASSO_RAPIDO_MS = 230;
const SEGMENTO_ENVELOPE_MS = 500;
const COR_ESPERA = "#F2A541";

function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => setReduzido(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);
  return reduzido;
}

// Deslocamentos em andamento: cada um percorre `pontos`, um por `passo` ms
// (a transição CSS de left/top faz o meio do caminho).
type Trilha = { pontos: Ponto[]; idx: number; passo: number; cor?: string };

function useTrilhas() {
  const [trilhas, setTrilhas] = useState<Record<string, Trilha>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});

  const iniciar = useCallback(
    (chave: string, pontos: Ponto[], passo: number, opcoes: { atraso?: number; parado?: number; cor?: string } = {}) => {
      const { atraso = 0, parado = 40, cor } = opcoes;
      for (const t of timers.current[chave] ?? []) clearTimeout(t);
      setTrilhas((atuais) => ({ ...atuais, [chave]: { pontos, idx: 0, passo, cor } }));
      const novos: ReturnType<typeof setTimeout>[] = [];
      for (let i = 1; i < pontos.length; i++) {
        novos.push(
          setTimeout(() => {
            setTrilhas((atuais) => (atuais[chave] ? { ...atuais, [chave]: { ...atuais[chave], idx: i } } : atuais));
          }, atraso + 60 + (i - 1) * passo)
        );
      }
      novos.push(
        setTimeout(() => {
          setTrilhas((atuais) => {
            const resto = { ...atuais };
            delete resto[chave];
            return resto;
          });
        }, atraso + 60 + (pontos.length - 1) * passo + parado)
      );
      timers.current[chave] = novos;
    },
    []
  );

  useEffect(() => {
    const todos = timers.current;
    return () => {
      for (const lista of Object.values(todos)) for (const t of lista) clearTimeout(t);
    };
  }, []);

  return [trilhas, iniciar] as const;
}

function pessoaPorChave(chave: string) {
  const [id, indice] = chave.split(":");
  const agente = agentePorId(id);
  return agente ? { agente, pessoa: pessoaDoAgente(agente, Number(indice ?? 0)) } : null;
}

function posicaoDe(chave: string, cena: Cena): Posicao {
  const local = cena.pessoas[chave];
  if (local === "mesa") return `mesa:${chave.split(":")[0]}`;
  if (local === "copa") {
    const ocupante = cena.copa.find((o) => o.chave === chave);
    return `copa:${ocupante ? ocupante.lugar : "pe"}`;
  }
  return local;
}

function Sala_({ sala, children, rotulo }: { sala: Sala; children?: ReactNode; rotulo?: boolean }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={sala === SALA_COPA ? "esc-ladrilho" : "esc-carpete"}
        style={{
          position: "absolute",
          left: sala.x,
          top: sala.y,
          width: 280,
          height: 280,
          backgroundColor: sala.piso,
          border: `6px solid ${sala.parede}`,
          borderRadius: 4,
          boxShadow: sala.vidro ? "inset 0 0 0 2px rgba(127,176,255,.25)" : undefined,
        }}
      />
      {rotulo !== false && (
        <div className="esc-rotulo" aria-hidden="true" style={{ left: sala.x + 14, top: sala.y + 14, zIndex: 6 }}>
          {sala.rotulo}
        </div>
      )}
      {children}
    </>
  );
}

export default function Office({
  atividades,
  agora,
  pronto,
  temAprovacaoPendente = false,
  incidenteAberto = false,
  tokens = {},
}: {
  atividades: Atividade[];
  agora: number;
  // As atividades iniciais já chegaram (antes disso não há caminhadas).
  pronto: boolean;
  temAprovacaoPendente?: boolean;
  incidenteAberto?: boolean;
  tokens?: Record<string, number>;
}) {
  const reduzido = useMovimentoReduzido();
  const entrada: EntradaCena = useMemo(
    () => ({ agora, atividades, aprovacaoPendente: temAprovacaoPendente, incidenteAberto }),
    [agora, atividades, temAprovacaoPendente, incidenteAberto]
  );
  const cena = useMemo(() => derivarCena(entrada), [entrada]);
  const entradaRef = useRef(entrada);
  entradaRef.current = entrada;

  const [andando, iniciarCaminhada] = useTrilhas();
  const [envelopes, iniciarEnvelope] = useTrilhas();

  // Caminhadas: quando a posição derivada de alguém muda, ele anda da posição
  // anterior até a nova pelo corredor. Quem é chamado na copa volta correndo
  // depois que o envelope chega.
  const posicoes = useMemo(() => {
    const mapa: Record<string, Posicao> = {};
    for (const chave of Object.keys(cena.pessoas)) mapa[chave] = posicaoDe(chave, cena);
    return mapa;
  }, [cena]);
  const assinaturaPosicoes = JSON.stringify(posicoes);
  const anteriores = useRef<Record<string, Posicao> | null>(null);
  const cenaRef = useRef(cena);
  cenaRef.current = cena;

  useEffect(() => {
    if (!pronto) return;
    const antes = anteriores.current;
    anteriores.current = posicoes;
    if (!antes || reduzido) return;
    for (const chave of Object.keys(posicoes)) {
      const de = antes[chave];
      const para = posicoes[chave];
      if (!de || de === para) continue;
      const estado = cenaRef.current.agentes[chave];
      const chamadoNaCopa = !!estado?.chamado && de.startsWith("copa:") && para.startsWith("mesa:");
      const pontos = caminho(de, para);
      iniciarCaminhada(chave, pontos, chamadoNaCopa ? PASSO_RAPIDO_MS : PASSO_MS, {
        atraso: chamadoNaCopa ? 4 * SEGMENTO_ENVELOPE_MS : 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaPosicoes, pronto, reduzido, iniciarCaminhada]);

  // Envelope a cada `delegou` novo (não reanima o histórico ao abrir a tela).
  const ultimoIdVisto = useRef<number | null>(null);
  useEffect(() => {
    if (!pronto) return;
    const maior = atividades.reduce((m, a) => Math.max(m, a.id), 0);
    const desde = ultimoIdVisto.current;
    ultimoIdVisto.current = Math.max(maior, desde ?? 0);
    if (desde === null) return;
    for (const a of atividades) {
      if (a.id <= desde || a.tipo !== "delegou") continue;
      const destino = destinoEnvelope(a, entradaRef.current);
      if (!destino) continue;
      const de = typeof a.dados?.de === "string" ? a.dados.de : a.agente;
      const pontos = rotaEnvelope(de, destino.para, destino.lugarCopa);
      const cor = agentePorId(de)?.cor ?? "#4C8DFF";
      if (reduzido) {
        iniciarEnvelope(`env-${a.id}`, [pontos[pontos.length - 1]], 0, { parado: 1200, cor });
      } else {
        iniciarEnvelope(`env-${a.id}`, pontos, SEGMENTO_ENVELOPE_MS, { cor });
      }
    }
  }, [atividades, pronto, reduzido, iniciarEnvelope]);

  const orq = agentePorId("orq")!;
  const vigia = agentePorId("vigia")!;
  const rui = pessoaDoAgente(vigia);
  const ruiPresente = cena.pessoas.vigia === "guarita" && !andando.vigia;
  const ruiEstado = cena.agentes.vigia;

  const ocupantesCopa = cena.copa.filter((o) => !andando[o.chave]);
  const nomesCopa = ocupantesCopa.map((o) => pessoaPorChave(o.chave)?.pessoa.nome).filter(Boolean);
  const pessoaPlantao = pessoaDoAgente(orq, cena.plantao.pessoa);

  return (
    <section
      className="esc-planta esc-madeira"
      aria-label={`Planta do escritório. De plantão: ${pessoaPlantao.nome}.${cena.noite ? " Fim do expediente." : ""}`}
    >
      {AGENTES.filter((a) => a.sala).map((agente, i) => (
        <SalaDeAgente
          key={agente.id}
          agente={agente}
          indice={i}
          cena={cena}
          andando={andando}
          tokens={tokens[agente.id] ?? 0}
        />
      ))}

      <Sala_ sala={SALA_COPA}>
        <div
          role="group"
          aria-label={
            nomesCopa.length > 0 ? `Copa: ${nomesCopa.join(", ")} tomando café` : "Copa: vazia"
          }
          style={{ position: "absolute", left: SALA_COPA.x, top: SALA_COPA.y, width: 280, height: 280 }}
        />
      </Sala_>
      <Portas />
      <Decoracao />

      {cena.noite && <div className="esc-sombra-noite" style={{ left: SALA_COPA.x, top: SALA_COPA.y }} />}
      <div
        style={{
          position: "absolute",
          left: SALA_COPA.x + 14,
          top: SALA_COPA.y + 252,
          fontSize: 11,
          color: "#A3B0CC",
          zIndex: 6,
        }}
      >
        {nomesCopa.length === 0 ? "Sem agentes aqui, só café." : `${nomesCopa.length} na copa ☕`}
      </div>

      {ocupantesCopa.map((o) => {
        const quem = pessoaPorChave(o.chave);
        if (!quem) return null;
        const p = o.lugar === "pe" ? EM_PE_COPA : LUGARES_COPA[o.lugar];
        return (
          <div
            key={o.chave}
            aria-hidden="true"
            style={{ position: "absolute", left: p.x - 10, top: p.y - 24, width: 20, height: 34, zIndex: 7 }}
          >
            <FiguraMini visual={quem.pessoa.visual} nome={quem.pessoa.nome} emPe={o.lugar === "pe"} xicara />
          </div>
        );
      })}
      {cena.papo && (
        <div
          className="esc-vivo"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 418,
            top: 486,
            padding: "2px 8px",
            background: "#E8EEF9",
            color: "#0B1020",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 12,
            zIndex: 7,
          }}
        >
          …
        </div>
      )}

      <Guarita
        agente={vigia}
        pessoa={rui}
        presente={ruiPresente}
        alerta={incidenteAberto}
        ativo={ruiEstado.ativo && ruiPresente}
        noite={cena.noite}
        descricao={
          !ruiPresente
            ? cena.pessoas.vigia === "copa"
              ? "na copa ☕"
              : "andando pelo escritório"
            : ruiEstado.ativo
              ? ruiEstado.detalhe ?? "trabalhando"
              : incidenteAberto
                ? "incidente aberto"
                : fraseOciosa(vigia.frasesOciosas, agora, 5)
        }
      />
      {ruiPresente && ruiEstado.ativo && ruiEstado.detalhe && (
        <div className="esc-balao" style={{ left: 124, top: 300, maxWidth: 250, height: 26, lineHeight: "26px", zIndex: 9 }}>
          {ruiEstado.detalhe}
        </div>
      )}

      {Object.entries(andando).map(([chave, t]) => {
        const quem = pessoaPorChave(chave);
        if (!quem) return null;
        const p = t.pontos[t.idx];
        return (
          <div
            key={chave}
            className="esc-andando"
            aria-hidden="true"
            style={{
              left: p.x - 9,
              top: p.y - 30,
              transition: t.idx > 0 ? `left ${t.passo}ms linear, top ${t.passo}ms linear` : "none",
            }}
          >
            <FiguraMini visual={quem.pessoa.visual} nome={quem.pessoa.nome} andando />
          </div>
        );
      })}

      {Object.entries(envelopes).map(([chave, t]) => {
        const p = t.pontos[t.idx];
        const cor = t.cor ?? "#4C8DFF";
        return (
          <div
            key={chave}
            className="esc-envelope"
            aria-hidden="true"
            style={{
              left: p.x - 12,
              top: p.y - 9,
              borderColor: cor,
              boxShadow: `3px 3px 0 ${cor}88`,
              transition: t.idx > 0 ? `left ${t.passo}ms linear, top ${t.passo}ms linear` : "none",
            }}
          >
            <div style={{ width: 12, height: 2, background: cor, margin: "5px auto 0" }} />
          </div>
        );
      })}
    </section>
  );
}

function SalaDeAgente({
  agente,
  indice,
  cena,
  andando,
  tokens,
}: {
  agente: Agente;
  indice: number;
  cena: Cena;
  andando: Record<string, Trilha>;
  tokens: number;
}) {
  const sala = agente.sala!;
  const ehOrq = agente.id === "orq";
  const indicePessoa = ehOrq ? cena.plantao.pessoa : 0;
  const pessoa = pessoaDoAgente(agente, indicePessoa);
  const chave = chavePessoa(agente.id, indicePessoa);
  const local = cena.pessoas[chave];
  const caminhando = !!andando[chave];
  const sentado = local === "mesa" && !caminhando;
  const est = cena.agentes[agente.id];

  const estado: EstadoMesa = est.espera ? "espera" : est.ativo && sentado ? "ativo" : "ocioso";
  let linha: string;
  if (estado === "espera") linha = "aguardando aprovação";
  else if (estado === "ativo") linha = est.detalhe ?? "trabalhando";
  else if (caminhando) linha = ehOrq ? "troca de turno" : local === "mesa" ? "voltando pra mesa" : "andando pelo escritório";
  else if (local === "copa") linha = "na copa ☕";
  else if (local === "casa") linha = "foi pra casa";
  else if (ehOrq && cena.plantao.adiado) linha = "troca de turno depois deste run";
  else linha = fraseOciosa(agente.frasesOciosas, cena.agora, indice);

  const balao = estado === "espera" ? "aguardando aprovação" : estado === "ativo" ? est.detalhe ?? "trabalhando" : null;
  const escuro = cena.noite && !ehOrq && !sentado;
  const corPonto = estado === "espera" ? COR_ESPERA : estado === "ativo" ? agente.cor : "#6B7A99";

  return (
    <Sala_ sala={sala}>
      <div
        role="group"
        aria-label={`${pessoa.nome}, ${agente.papel}: ${linha}`}
        className={estado === "espera" ? "esc-espera" : undefined}
        style={{
          position: "absolute",
          left: sala.x,
          top: sala.y,
          width: 280,
          height: 280,
          border: `3px solid ${estado === "espera" ? COR_ESPERA : estado === "ativo" ? agente.cor : "transparent"}`,
          borderRadius: 4,
          boxShadow:
            estado === "espera"
              ? "0 0 0 4px rgba(242,165,65,.25), inset 0 0 40px rgba(242,165,65,.12)"
              : estado === "ativo"
                ? `inset 0 0 40px ${agente.cor}33`
                : "none",
          transition: "border-color .3s, box-shadow .3s",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      <div style={{ position: "absolute", left: sala.x + 50, top: sala.y + 40, width: 180, height: 160, zIndex: 2 }}>
        <Desk agente={agente} pessoa={pessoa} estado={estado} balao={balao} sentado={sentado} cracha={!escuro} />
      </div>
      {cena.noite && ehOrq && (
        <div aria-hidden="true">
          <div
            style={{
              position: "absolute",
              left: sala.x + 50,
              top: sala.y + 90,
              width: 180,
              height: 120,
              borderRadius: "50%",
              background: "radial-gradient(closest-side, rgba(255,214,120,.28), rgba(255,214,120,0))",
              pointerEvents: "none",
              zIndex: 3,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: sala.x + 206,
              top: sala.y + 138,
              width: 12,
              height: 14,
              background: "#F2D65E",
              borderRadius: "6px 6px 2px 2px",
              boxShadow: "0 0 12px #F2D65E",
              zIndex: 3,
            }}
          />
        </div>
      )}
      {escuro && <div className="esc-sombra-noite" style={{ left: sala.x, top: sala.y }} />}
      <div className="esc-rodape" style={{ left: sala.x + 14, top: sala.y + 240 }}>
        <div
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: "50%", background: corPonto, flexShrink: 0 }}
        />
        <div
          style={{
            flexGrow: 1,
            fontSize: 12,
            color: "#C9D4EA",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {linha}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "#A3B0CC", flexShrink: 0 }}>
          {tokens.toLocaleString("pt-BR")} tk
        </div>
      </div>
    </Sala_>
  );
}
