"use client";

// Sino do topo, no estilo do Jira: "Diretas" (menções, atribuições, comentários e atualizações nas suas tarefas,
// agrupadas em Hoje / Mais antigas, com bolinha de não lida) e "Aprovações" (o que os agentes pedem).
// "Mostrar apenas não lidas" filtra; clicar abre a tarefa e marca como lida.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enviar, obter } from "../lib/api";
import { tempoRelativo } from "../lib/docs";
import { nomeUsuario } from "../lib/exibicao";
import { corPessoa, type Tarefa, type TipoTarefa } from "../lib/tarefas";
import { Avatar } from "./IconesTarefa";
import { IconeTipo } from "./TarefaDetalhe";

export type Notificacao = {
  id: number;
  tipo: "mencao" | "atribuicao" | "comentario" | "atualizacao";
  autor: string;
  tarefa_id: number;
  tarefa_titulo: string;
  tarefa_tipo: TipoTarefa;
  tarefa_status: string;
  tarefa_feita: boolean;
  tarefa_chave: string;
  detalhe: string | null;
  lida: boolean;
  criado_em: string;
};
type Resposta = { itens: Notificacao[]; nao_lidas: number; atrasadas: Tarefa[] };
type AprovacaoResumo = { id: number; titulo: string; tipo_rotulo: string; pedido_por: string | null };

const INTERVALO_MS = 15000;

const ROTULO_CAMPO: Record<string, string> = {
  titulo: "o título", descricao: "a descrição", prioridade: "a prioridade", responsavel: "o responsável", prazo: "a data de entrega",
  tipo: "o tipo", etiquetas: "as etiquetas", pontos: "os pontos", epico_id: "o épico", sprint_id: "a sprint",
  documento_id: "o documento", negocio_id: "o negócio", status: "o status",
};

function frase(n: Notificacao): string {
  if (n.tipo === "mencao") return "mencionou você";
  if (n.tipo === "atribuicao") return "atribuiu uma tarefa a você";
  if (n.tipo === "comentario") return "comentou numa tarefa sua";
  if (n.detalhe?.startsWith("status:")) return `moveu para ${n.detalhe.slice(7)}`;
  const campos = (n.detalhe ?? "").split(",").filter(Boolean).map((c) => ROTULO_CAMPO[c] ?? c);
  return campos.length ? `mudou ${campos.length > 2 ? `${campos.slice(0, 2).join(", ")} e mais` : campos.join(" e ")}` : "atualizou uma tarefa";
}

const ehHoje = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Abre a tarefa: na página de Tarefas avisa por evento (sem recarregar); fora dela, navega. */
export function abrirTarefa(router: ReturnType<typeof useRouter>, id: number) {
  if (window.location.pathname === "/tarefas") {
    window.dispatchEvent(new CustomEvent("orion:abrir-tarefa", { detail: id }));
    window.history.replaceState(null, "", `/tarefas?tarefa=${id}`);
  } else router.push(`/tarefas?tarefa=${id}`);
}

export function useNotificacoes() {
  const [dados, setDados] = useState<Resposta>({ itens: [], nao_lidas: 0, atrasadas: [] });
  const buscar = useCallback(async () => {
    if (document.hidden) return;
    try {
      setDados(await obter<Resposta>("/notificacoes"));
    } catch {
      // rede/401: tenta de novo no próximo ciclo
    }
  }, []);
  useEffect(() => {
    buscar();
    const t = window.setInterval(buscar, INTERVALO_MS);
    const voltar = () => buscar();
    document.addEventListener("visibilitychange", voltar);
    window.addEventListener("orion:notificacoes", voltar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", voltar);
      window.removeEventListener("orion:notificacoes", voltar);
    };
  }, [buscar]);
  return { dados, setDados, buscar };
}

type Props = {
  dados: Resposta;
  setDados: (r: Resposta) => void;
  aprovacoes: AprovacaoResumo[];
  onFechar: () => void;
};

export default function PainelNotificacoes({ dados, setDados, aprovacoes, onFechar }: Props) {
  const router = useRouter();
  const [aba, setAba] = useState<"diretas" | "aprovacoes">("diretas");
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  const lista = soNaoLidas ? dados.itens.filter((n) => !n.lida) : dados.itens;
  const hoje = lista.filter((n) => ehHoje(n.criado_em));
  const antigas = lista.filter((n) => !ehHoje(n.criado_em));

  async function abrir(n: Notificacao) {
    if (!n.lida) {
      setDados({ ...dados, itens: dados.itens.map((x) => (x.id === n.id ? { ...x, lida: true } : x)), nao_lidas: Math.max(0, dados.nao_lidas - 1) });
      enviar(`/notificacoes/${n.id}/lida`, { lida: true }).catch(() => {});
    }
    onFechar();
    abrirTarefa(router, n.tarefa_id);
  }

  async function alternarLida(n: Notificacao) {
    setDados({ ...dados, itens: dados.itens.map((x) => (x.id === n.id ? { ...x, lida: !n.lida } : x)), nao_lidas: dados.nao_lidas + (n.lida ? 1 : -1) });
    enviar(`/notificacoes/${n.id}/lida`, { lida: !n.lida }).catch(() => {});
  }

  async function lerTodas() {
    setDados({ ...dados, itens: dados.itens.map((x) => ({ ...x, lida: true })), nao_lidas: 0 });
    enviar("/notificacoes/lidas", {}).catch(() => {});
  }

  function item(n: Notificacao) {
    return (
      <li key={n.id} className={`ntf-item${n.lida ? "" : " nova"}`}>
        <button type="button" className="ntf-abrir" onClick={() => abrir(n)}>
          <Avatar nome={n.autor} cor={corPessoa(n.autor)} tamanho={36} />
          <span className="ntf-texto">
            <span className="ntf-frase">
              <strong>
                {nomeUsuario(n.autor)} {frase(n)}
              </strong>{" "}
              <span className="ntf-quando">{tempoRelativo(n.criado_em)}</span>
            </span>
            <span className="ntf-tarefa">
              <IconeTipo tipo={n.tarefa_tipo ?? "tarefa"} tamanho={14} />
              {n.tarefa_titulo}
            </span>
            {n.detalhe && (n.tipo === "mencao" || n.tipo === "comentario") && <span className="ntf-trecho">“{n.detalhe}”</span>}
            <span className="ntf-meta">
              {n.tarefa_chave} • <span className={n.tarefa_feita ? "ntf-feito" : ""}>{n.tarefa_status.toUpperCase()}</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          className="ntf-ponto"
          title={n.lida ? "Marcar como não lida" : "Marcar como lida"}
          aria-label={n.lida ? "Marcar como não lida" : "Marcar como lida"}
          onClick={() => alternarLida(n)}
        />
      </li>
    );
  }

  return (
    <div className="ntf" role="dialog" aria-label="Notificações">
      <header className="ntf-topo">
        <h2>Notificações</h2>
        <label className="ntf-chave">
          Mostrar apenas não lidas
          <input type="checkbox" role="switch" checked={soNaoLidas} onChange={(e) => setSoNaoLidas(e.target.checked)} />
          <span aria-hidden />
        </label>
      </header>
      <div className="ntf-abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === "diretas"} className={aba === "diretas" ? "ativa" : ""} onClick={() => setAba("diretas")}>
          Diretas {dados.nao_lidas > 0 && <span className="ntf-num">{dados.nao_lidas}</span>}
        </button>
        <button type="button" role="tab" aria-selected={aba === "aprovacoes"} className={aba === "aprovacoes" ? "ativa" : ""} onClick={() => setAba("aprovacoes")}>
          Aprovações {aprovacoes.length > 0 && <span className="ntf-num">{aprovacoes.length}</span>}
        </button>
        {aba === "diretas" && dados.nao_lidas > 0 && (
          <button type="button" className="ntf-ler-todas" onClick={lerTodas}>
            Marcar todas como lidas
          </button>
        )}
      </div>

      <div className="ntf-corpo">
        {aba === "diretas" ? (
          <>
            {(hoje.length > 0 || dados.atrasadas.length > 0) && <h3 className="ntf-grupo">Hoje</h3>}
            <ul className="ntf-lista">
              {dados.atrasadas.length > 0 && !soNaoLidas && (
                <li className="ntf-item sistema">
                  <button
                    type="button"
                    className="ntf-abrir"
                    onClick={() => {
                      onFechar();
                      abrirTarefa(router, dados.atrasadas[0].id);
                    }}
                  >
                    <span className="ntf-sistema-icone" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </span>
                    <span className="ntf-texto">
                      <span className="ntf-frase">
                        <strong>
                          Você tem {dados.atrasadas.length} {dados.atrasadas.length === 1 ? "tarefa atrasada" : "tarefas atrasadas"}
                        </strong>
                      </span>
                      <span className="ntf-tarefa">
                        <IconeTipo tipo={(dados.atrasadas[0].tipo ?? "tarefa") as TipoTarefa} tamanho={14} />
                        {dados.atrasadas[0].titulo}
                        {dados.atrasadas.length > 1 && <span className="ntf-mais"> e mais {dados.atrasadas.length - 1}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              )}
              {hoje.map(item)}
            </ul>
            {antigas.length > 0 && (
              <>
                <h3 className="ntf-grupo">Mais antigas</h3>
                <ul className="ntf-lista">{antigas.map(item)}</ul>
              </>
            )}
            {lista.length === 0 && dados.atrasadas.length === 0 && (
              <p className="ntf-vazio">{soNaoLidas ? "Nada sem ler." : "Quando alguém marcar você, atribuir ou mexer numa tarefa sua, aparece aqui."}</p>
            )}
          </>
        ) : aprovacoes.length === 0 ? (
          <p className="ntf-vazio">Quando um agente pedir aprovação, aparece aqui.</p>
        ) : (
          <ul className="ntf-lista">
            {aprovacoes.slice(0, 8).map((a) => (
              <li key={a.id} className="ntf-item nova">
                <Link href="/aprovacoes" className="ntf-abrir" onClick={onFechar}>
                  <span className="ntf-sistema-icone aprov" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <span className="ntf-texto">
                    <span className="ntf-frase">
                      <strong>{a.titulo}</strong>
                    </span>
                    <span className="ntf-meta">
                      {a.tipo_rotulo}
                      {a.pedido_por ? ` · pedido por ${nomeUsuario(a.pedido_por)}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {aba === "aprovacoes" && (
        <Link href="/aprovacoes" className="ntf-rodape" onClick={onFechar}>
          Abrir aprovações
        </Link>
      )}
    </div>
  );
}
