"use client";

// Backlog no estilo Jira: a sprint ativa e as planejadas em cima, o backlog embaixo. Arraste as linhas para mudar a
// ordem ou levar a tarefa de uma sprint para outra (ou de volta ao backlog). Cada sprint mostra tarefas, pontos e o
// progresso; dá para criar, iniciar, encerrar, editar e excluir sprints.

import { useMemo, useState, type FormEvent } from "react";
import { atualizar, enviar, excluir } from "../lib/api";
import { corPessoa, progresso, ROTULO_PRIORIDADE, type Sprint, type Tarefa, type TipoTarefa } from "../lib/tarefas";
import Icone, { Avatar, IconePrioridade } from "./IconesTarefa";
import { IconeTipo } from "./TarefaDetalhe";

type Props = {
  tarefas: Tarefa[];
  sprints: Sprint[];
  eu: string;
  onAbrir: (id: number) => void;
  onMudou: () => void;
};

const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function diasRestantes(fim: string | null, hoje: string): string | null {
  if (!fim) return null;
  const n = Math.round((Date.parse(`${fim.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  if (n < 0) return `passou ${-n} dia${n === -1 ? "" : "s"} do fim`;
  if (n === 0) return "termina hoje";
  return `${n} dia${n === 1 ? "" : "s"} restante${n === 1 ? "" : "s"}`;
}

export default function BacklogTarefas({ tarefas, sprints, eu, onAbrir, onMudou }: Props) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null); // "sprint:id" ou "backlog", e a linha antes da qual soltar
  const [antesDe, setAntesDe] = useState<number | null>(null);
  const [novo, setNovo] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<Sprint | null>(null);
  const [encerrando, setEncerrando] = useState<Sprint | null>(null);
  const [destino, setDestino] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const abertas = sprints.filter((s) => s.estado !== "encerrada");
  const grupos = useMemo(() => {
    const ordenar = (l: Tarefa[]) => [...l].sort((a, b) => ((a as Tarefa & { ordem_backlog?: number }).ordem_backlog ?? 0) - ((b as Tarefa & { ordem_backlog?: number }).ordem_backlog ?? 0) || a.id - b.id);
    return {
      porSprint: Object.fromEntries(abertas.map((s) => [s.id, ordenar(tarefas.filter((t) => t.sprint_id === s.id))])),
      backlog: ordenar(tarefas.filter((t) => !t.sprint_id || !abertas.some((s) => s.id === t.sprint_id)).filter((t) => !t.coluna_concluida)),
    };
  }, [tarefas, abertas]);

  async function acao(fn: () => Promise<unknown>) {
    try {
      setErro(null);
      await fn();
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  }

  function soltar(sprintId: number | null, lista: Tarefa[]) {
    const id = arrastando;
    setArrastando(null);
    setAlvo(null);
    if (id === null) return;
    const semEla = lista.filter((t) => t.id !== id);
    const pos = antesDe !== null ? semEla.findIndex((t) => t.id === antesDe) : -1;
    setAntesDe(null);
    acao(() => enviar(`/tarefas/${id}/backlog`, { sprint_id: sprintId, posicao: pos < 0 ? null : pos }));
  }

  async function criarTarefa(e: FormEvent, chave: string, sprintId: number | null) {
    e.preventDefault();
    const titulo = (novo[chave] ?? "").trim();
    if (!titulo) return;
    setNovo((n) => ({ ...n, [chave]: "" }));
    await acao(async () => {
      const nova = await enviar<Tarefa>("/tarefas", { titulo, responsavel: eu, sprint_id: sprintId });
      onAbrir(nova.id);
    });
  }

  function linha(t: Tarefa, lista: Tarefa[], sprintId: number | null) {
    const tipo = (t.tipo ?? "tarefa") as TipoTarefa;
    return (
      <li
        key={t.id}
        className={`bl-linha${arrastando === t.id ? " arrastando" : ""}${antesDe === t.id ? " bl-alvo" : ""}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          setArrastando(t.id);
        }}
        onDragEnd={() => {
          setArrastando(null);
          setAlvo(null);
          setAntesDe(null);
        }}
        onDragOver={(e) => {
          if (arrastando === null || arrastando === t.id) return;
          e.preventDefault();
          setAntesDe(t.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          soltar(sprintId, lista);
        }}
        onClick={() => onAbrir(t.id)}
      >
        <IconeTipo tipo={tipo} />
        <span className={`bl-chave${t.coluna_concluida ? " feita" : ""}`}>{t.chave ?? `ORI-${t.id}`}</span>
        <span className="bl-titulo">{t.titulo}</span>
        {t.epico_titulo && <span className="bl-epico">{t.epico_titulo}</span>}
        {(t.etiquetas ?? []).slice(0, 2).map((e) => (
          <span key={e} className="bl-etiqueta">
            {e}
          </span>
        ))}
        <span className={`bl-status${t.coluna_concluida ? " feito" : ""}`}>{t.coluna_concluida ? "Feito" : t.status.replace(/_/g, " ")}</span>
        <span title={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade].toLowerCase()}`}>
          <IconePrioridade prioridade={t.prioridade} />
        </span>
        <span className="bl-pontos" title="Pontos">
          {t.pontos ?? "–"}
        </span>
        <Avatar nome={t.responsavel} cor={corPessoa(t.responsavel)} tamanho={22} />
      </li>
    );
  }

  function bloco(chave: string, sprint: Sprint | null, lista: Tarefa[]) {
    const sprintId = sprint?.id ?? null;
    const pontos = lista.reduce((s, t) => s + (t.pontos ?? 0), 0);
    return (
      <section
        key={chave}
        className={`bl-bloco${alvo === chave ? " bl-sobre" : ""}${sprint?.estado === "ativa" ? " ativa" : ""}`}
        onDragOver={(e) => {
          if (arrastando === null) return;
          e.preventDefault();
          setAlvo(chave);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === chave ? null : a));
        }}
        onDrop={(e) => {
          e.preventDefault();
          soltar(sprintId, lista);
        }}
      >
        <header className="bl-topo">
          <div className="bl-topo-texto">
            <h2>
              {sprint ? sprint.nome : "Backlog"}
              {sprint?.estado === "ativa" && <span className="bl-ativa">Ativa</span>}
            </h2>
            <p>
              {lista.length} tarefa{lista.length === 1 ? "" : "s"} · {pontos} ponto{pontos === 1 ? "" : "s"}
              {sprint && (sprint.inicio || sprint.fim) && ` · ${dataCurta(sprint.inicio)} – ${dataCurta(sprint.fim)}`}
              {sprint?.estado === "ativa" && diasRestantes(sprint.fim, hoje) && ` · ${diasRestantes(sprint.fim, hoje)}`}
            </p>
            {sprint?.objetivo && <p className="bl-objetivo">Objetivo: {sprint.objetivo}</p>}
          </div>
          {sprint && sprint.tarefas_total > 0 && (
            <div className="bl-prog" title={`${sprint.tarefas_feitas} de ${sprint.tarefas_total} feitas`}>
              <span style={{ width: `${progresso(sprint.tarefas_feitas, sprint.tarefas_total)}%` }} />
            </div>
          )}
          <div className="bl-acoes">
            {sprint?.estado === "planejada" && (
              <button
                type="button"
                className="botao"
                disabled={sprints.some((s) => s.estado === "ativa")}
                title={sprints.some((s) => s.estado === "ativa") ? "Encerre a sprint ativa antes" : "Iniciar a sprint"}
                onClick={() => acao(() => enviar(`/tarefas/sprints/${sprint.id}/iniciar`, {}))}
              >
                Iniciar sprint
              </button>
            )}
            {sprint?.estado === "ativa" && (
              <button
                type="button"
                className="botao botao-destaque"
                onClick={() => {
                  setDestino("");
                  setEncerrando(sprint);
                }}
              >
                Encerrar sprint
              </button>
            )}
            {sprint && (
              <button type="button" className="botao" onClick={() => setEditando(sprint)}>
                Editar
              </button>
            )}
            {sprint?.estado === "planejada" && (
              <button
                type="button"
                className="td-icone perigo"
                title="Excluir sprint (as tarefas voltam ao backlog)"
                onClick={() => window.confirm(`Excluir ${sprint.nome}? As tarefas voltam ao backlog.`) && acao(() => excluir(`/tarefas/sprints/${sprint.id}`))}
              >
                <Icone nome="lixeira" />
              </button>
            )}
            {!sprint && (
              <button type="button" className="botao" onClick={() => acao(() => enviar("/tarefas/sprints", {}))}>
                Criar sprint
              </button>
            )}
          </div>
        </header>
        <ul className="bl-lista">
          {lista.map((t) => linha(t, lista, sprintId))}
          {lista.length === 0 && (
            <li className="bl-vazio">{sprint ? "Arraste tarefas do backlog para planejar esta sprint." : "O backlog está vazio."}</li>
          )}
        </ul>
        <form className="bl-criar" onSubmit={(e) => criarTarefa(e, chave, sprintId)}>
          <Icone nome="mais" tamanho={14} />
          <input value={novo[chave] ?? ""} maxLength={200} onChange={(e) => setNovo((n) => ({ ...n, [chave]: e.target.value }))} placeholder="Criar tarefa" aria-label={`Criar tarefa em ${sprint?.nome ?? "Backlog"}`} />
        </form>
      </section>
    );
  }

  return (
    <div className="bl">
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      {abertas.map((s) => bloco(`sprint:${s.id}`, s, grupos.porSprint[s.id] ?? []))}
      {bloco("backlog", null, grupos.backlog)}

      {editando && (
        <div className="bl-modal" role="dialog" aria-label={`Editar ${editando.nome}`}>
          <form
            className="bl-modal-caixa"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const s = editando;
              setEditando(null);
              acao(() => atualizar(`/tarefas/sprints/${s.id}`, { nome: f.get("nome"), objetivo: f.get("objetivo"), inicio: f.get("inicio") || null, fim: f.get("fim") || null }));
            }}
          >
            <h2>Editar sprint</h2>
            <label>
              Nome
              <input name="nome" defaultValue={editando.nome} maxLength={60} required />
            </label>
            <label>
              Objetivo da sprint
              <textarea name="objetivo" defaultValue={editando.objetivo ?? ""} rows={2} />
            </label>
            <div className="bl-modal-datas">
              <label>
                Início
                <input name="inicio" type="date" defaultValue={editando.inicio?.slice(0, 10) ?? ""} />
              </label>
              <label>
                Fim
                <input name="fim" type="date" defaultValue={editando.fim?.slice(0, 10) ?? ""} />
              </label>
            </div>
            <div className="bl-modal-botoes">
              <button type="button" className="botao" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button type="submit" className="botao botao-destaque">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {encerrando && (
        <div className="bl-modal" role="dialog" aria-label={`Encerrar ${encerrando.nome}`}>
          <form
            className="bl-modal-caixa"
            onSubmit={(e) => {
              e.preventDefault();
              const s = encerrando;
              setEncerrando(null);
              acao(() => enviar(`/tarefas/sprints/${s.id}/encerrar`, { mover_para: destino ? Number(destino) : null }));
            }}
          >
            <h2>Encerrar {encerrando.nome}</h2>
            <p>
              {encerrando.tarefas_feitas} de {encerrando.tarefas_total} tarefas feitas ({encerrando.pontos_feitos} de {encerrando.pontos_total} pontos).
            </p>
            {encerrando.tarefas_total - encerrando.tarefas_feitas > 0 && (
              <label>
                As {encerrando.tarefas_total - encerrando.tarefas_feitas} tarefas abertas vão para
                <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                  <option value="">o Backlog</option>
                  {abertas
                    .filter((s) => s.id !== encerrando.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="bl-modal-botoes">
              <button type="button" className="botao" onClick={() => setEncerrando(null)}>
                Cancelar
              </button>
              <button type="submit" className="botao botao-destaque">
                Encerrar sprint
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
