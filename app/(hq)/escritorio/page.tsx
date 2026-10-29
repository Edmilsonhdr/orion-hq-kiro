"use client";

// Escritório virtual com rotina (Requirements 8 e 12).
// Faz o polling incremental das atividades, e polling leve das aprovações
// pendentes, dos incidentes abertos (luz da guarita) e dos tokens do dia. O
// Office deriva a cena inteira (plantão, copa, noite) do relógio e dessas
// atividades via lib/rotina.ts.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EscalaPlanta from "../../../components/EscalaPlanta";
import { obter } from "../../../lib/api";
import { usePollComEstado } from "../../../lib/usePoll";
import { deslocarDatas, useRelogio } from "../../../lib/useRelogio";
import { AGENTES, agentePorId, pessoaDoAgente } from "../../../lib/agents";
import { plantaoEm } from "../../../lib/rotina";
import Office, { Atividade } from "../../../components/Office";
import PainelAgente from "../../../components/PainelAgente";
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

const formatarNumero = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export default function EscritorioPage() {
  const [filtro, setFiltro] = useState<string | null>(null);
  const [claro, setClaro] = useState(false);
  const [calor, setCalor] = useState(false);
  // Replay: instante simulado (ms) ou null para ao vivo.
  const [replayMs, setReplayMs] = useState<number | null>(null);
  const [tocando, setTocando] = useState(false);
  useEffect(() => {
    try {
      setClaro(window.localStorage.getItem("hq:planta-clara") === "1");
    } catch {
      // sem armazenamento: tema escuro
    }
  }, []);
  function alternarTema() {
    const novo = !claro;
    setClaro(novo);
    try {
      window.localStorage.setItem("hq:planta-clara", novo ? "1" : "0");
    } catch {
      // só uma conveniência
    }
  }
  const { itens, carregado } = usePollComEstado<Atividade>("/atividades", INTERVALO_ATIV_MS);
  const { agora, deslocamentoMs } = useRelogio();
  const atividades = useMemo(() => deslocarDatas(itens, deslocamentoMs), [itens, deslocamentoMs]);
  const online = usePollLeve<string[]>("/presenca", 15000, []);
  const pendentes = usePollLeve<Aprovacao[]>("/aprovacoes?status=pendente", INTERVALO_APROV_MS, []);
  const tokens = usePollLeve<Record<string, number>>("/atividades/tokens", INTERVALO_TOKENS_MS, {});
  const incidentes = usePollLeve<{ abertos: number }>("/incidentes/resumo", INTERVALO_INCIDENTES_MS, {
    abertos: 0,
  });

  const orq = agentePorId("orq")!;
  const plantao = agora === null ? null : pessoaDoAgente(orq, plantaoEm(agora, atividades).pessoa);

  const inicioReplay = useMemo(
    () => (atividades.length ? Math.min(...atividades.map((a) => new Date(a.criado_em).getTime())) : null),
    [atividades]
  );
  const agoraEf = replayMs ?? agora;
  const atividadesEf = useMemo(
    () => (replayMs === null ? atividades : atividades.filter((a) => new Date(a.criado_em).getTime() <= replayMs)),
    [atividades, replayMs]
  );

  // Replay: avança 1 min de cena a cada 100 ms e volta ao vivo no fim.
  useEffect(() => {
    if (!tocando || replayMs === null) return;
    const timer = setInterval(() => {
      setReplayMs((atual) => {
        if (atual === null) return null;
        const proximo = atual + 60_000;
        if (agora !== null && proximo >= agora) {
          setTocando(false);
          return null;
        }
        return proximo;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [tocando, replayMs === null, agora]);

  function iniciarReplay() {
    if (inicioReplay === null || agora === null) return;
    setReplayMs(inicioReplay);
    setTocando(true);
  }
  function voltarAoVivo() {
    setReplayMs(null);
    setTocando(false);
  }

  const ultima = useMemo(() => {
    if (agora === null || atividades.length === 0 || replayMs !== null) return null;
    const maisRecente = Math.max(...atividades.map((a) => new Date(a.criado_em).getTime()));
    const seg = Math.max(0, Math.round((agora - maisRecente) / 1000));
    if (seg < 60) return "agora há pouco";
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
    return `há ${Math.floor(seg / 86400)} d`;
  }, [atividades, agora, replayMs]);
  const totalTokens = Object.values(tokens ?? {}).reduce((s, n) => s + n, 0);
  const noReplay = replayMs !== null;
  const qtdPendentes = !noReplay && Array.isArray(pendentes) ? pendentes.length : 0;
  const qtdIncidentes = noReplay ? 0 : (incidentes?.abertos ?? 0);

  return (
    <div className="docs-pagina esc-pagina">
      <div className="com-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">Escritório</h1>
          <p className="texto-secundario" style={{ margin: "6px 0 0" }} aria-live="polite">
            <span className="esc-ao-vivo" aria-hidden="true" /> Os agentes trabalhando{ultima && ` · última atividade ${ultima}`}
            {online.length > 0 && (
              <span className="esc-online" title="Quem está com o HQ aberto agora">
                {online.map((u) => (
                  <span key={u}>
                    <span className="esc-online-ponto" aria-hidden="true" />
                    {u}
                  </span>
                ))}
              </span>
            )}
            {plantao && (
              <>
                {" · de plantão: "}
                <span style={{ color: plantao.corChat, fontWeight: 600 }}>{plantao.nome}</span>
              </>
            )}
          </p>
        </div>
        <ul className="esc-legenda" aria-label="Legenda dos agentes">
          {AGENTES.map((ag) => (
            <li key={ag.id}>
              <button
                type="button"
                className={`esc-legenda-botao${filtro === ag.id ? " ativo" : ""}`}
                aria-pressed={filtro === ag.id}
                title={filtro === ag.id ? "Mostrar todos" : `Filtrar atividades: ${ag.papel}`}
                onClick={() => setFiltro(filtro === ag.id ? null : ag.id)}
              >
                <span className="esc-legenda-ponto" style={{ background: ag.cor }} aria-hidden="true" />
                {ag.papel} <span className="mono texto-secundario">{ag.nivel}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="esc-controles">
          <button type="button" className="esc-tema" onClick={() => setCalor(!calor)} aria-pressed={calor}>
            Mapa de calor
          </button>
          <button type="button" className="esc-tema" onClick={noReplay ? voltarAoVivo : iniciarReplay} aria-pressed={noReplay} disabled={inicioReplay === null && !noReplay}>
            {noReplay ? "Voltar ao vivo" : "Replay do dia"}
          </button>
          <button type="button" className="esc-tema" onClick={alternarTema} aria-pressed={claro}>
            {claro ? "Tema escuro" : "Tema claro"}
          </button>
        </div>
      </div>

      {noReplay && inicioReplay !== null && agora !== null && (
        <div className="painel esc-replay" role="group" aria-label="Replay do dia">
          <button type="button" onClick={() => setTocando(!tocando)} aria-label={tocando ? "Pausar" : "Reproduzir"}>
            {tocando ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            aria-label="Momento do replay"
            min={inicioReplay}
            max={agora}
            step={60_000}
            value={Math.min(replayMs ?? inicioReplay, agora)}
            onChange={(e) => {
              setTocando(false);
              setReplayMs(Number(e.target.value));
            }}
          />
          <span className="mono">{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(replayMs ?? inicioReplay))}</span>
        </div>
      )}

      <div className="com-indicadores esc-indicadores">
        <div className="painel com-indicador">
          <div className="com-indicador-valor mono">{formatarNumero(totalTokens)}</div>
          <div className="texto-secundario">Tokens hoje</div>
        </div>
        <Link href="/aprovacoes" className={`painel com-indicador esc-link${qtdPendentes > 0 ? " alerta" : ""}`}>
          <div className="com-indicador-valor mono">{qtdPendentes}</div>
          <div className="texto-secundario">Aprovações pendentes</div>
        </Link>
        <Link href="/incidentes" className={`painel com-indicador esc-link${qtdIncidentes > 0 ? " alerta" : ""}`}>
          <div className="com-indicador-valor mono">{qtdIncidentes}</div>
          <div className="texto-secundario">Incidentes abertos</div>
        </Link>
      </div>

      <div className="esc-grade">
        <div className={`esc-moldura${claro ? " esc-claro" : ""}`}>
        <EscalaPlanta>
        {agora === null ? (
          <div className="esc-planta esc-madeira" aria-label="Carregando o escritório" />
        ) : (
          <Office
            atividades={atividadesEf}
            agora={agoraEf ?? agora}
            pronto={carregado}
            temAprovacaoPendente={qtdPendentes > 0}
            incidenteAberto={qtdIncidentes > 0}
            tokens={tokens}
            selecionado={filtro}
            onSelecionar={(id) => setFiltro(filtro === id ? null : id)}
            qtdPendentes={qtdPendentes}
            qtdIncidentes={qtdIncidentes}
            calor={calor}
          />
        )}
        </EscalaPlanta>
        </div>
        <LogLateral
          atividades={atividadesEf}
          tokens={tokens}
          filtro={filtro}
          onLimpar={() => setFiltro(null)}
          topo={
            filtro && (
              <PainelAgente
                id={filtro}
                atividades={atividadesEf}
                tokens={tokens?.[filtro] ?? 0}
                agora={agoraEf}
                onFechar={() => setFiltro(null)}
              />
            )
          }
        />
      </div>
    </div>
  );
}
