"use client";

// Tarefas: quadro Kanban por pessoa. Cada sócia tem o seu quadro (abas); "Todos" mostra o de todas.
// Arrastar o cartão muda a coluna (e a posição); o seletor do cartão faz o mesmo pelo teclado e no celular.
// Atualiza sozinho a cada poucos segundos para enxergar o que as outras mexeram.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Modal from "../../../components/Modal";
import TarefaForm, { type DadosTarefa } from "../../../components/TarefaForm";
import { atualizar, enviar, excluir, obter } from "../../../lib/api";
import { formatarDia, hojeISO } from "../../../lib/comercial";
import {
  ROTULO_STATUS,
  STATUS,
  moverLocal,
  porColuna,
  posicaoAntesDe,
  situacaoPrazo,
  type ResumoPessoa,
  type StatusTarefa,
  type Tarefa,
} from "../../../lib/tarefas";

const INTERVALO_MS = 15000;
const maiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function TarefasPage() {
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [eu, setEu] = useState("");
  const [vista, setVista] = useState<string>("");
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [resumo, setResumo] = useState<Record<string, ResumoPessoa>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [editando, setEditando] = useState<Tarefa | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<StatusTarefa | null>(null);
  const ocupado = useRef(false); // arrastando ou editando: não sobrescrever o estado local

  const carregar = useCallback(async () => {
    try {
      const [l, r] = await Promise.all([obter<Tarefa[]>("/tarefas"), obter<Record<string, ResumoPessoa>>("/tarefas/resumo")]);
      if (!ocupado.current) setTarefas(l);
      setResumo(r);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar as tarefas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    ocupado.current = arrastando !== null || editando !== null;
  }, [arrastando, editando]);

  useEffect(() => {
    obter<string[]>("/usuarios").then(setUsuarios).catch(() => {});
    obter<{ usuario: string }>("/me")
      .then((m) => {
        setEu(m.usuario);
        // ?pessoa=nome abre o quadro de outra pessoa; senão, o meu
        const pedida = new URLSearchParams(window.location.search).get("pessoa");
        setVista(pedida ?? m.usuario);
      })
      .catch(() => {});
    carregar();
    const timer = setInterval(() => {
      if (!document.hidden) carregar();
    }, INTERVALO_MS);
    return () => clearInterval(timer);
  }, [carregar]);

  const visiveis = useMemo(() => (vista === "todos" ? tarefas : tarefas.filter((t) => t.responsavel === vista)), [tarefas, vista]);
  const colunas = useMemo(() => porColuna(visiveis), [visiveis]);
  const hoje = hojeISO();

  async function mover(id: number, status: StatusTarefa, posicao?: number) {
    const antes = tarefas;
    setTarefas((l) => moverLocal(l, id, status, posicao));
    try {
      await enviar(`/tarefas/${id}/mover`, { status, posicao: posicao ?? null });
      await carregar();
    } catch (e) {
      setTarefas(antes);
      setErro(e instanceof Error ? e.message : "Não foi possível mover a tarefa.");
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    try {
      await enviar("/tarefas", { titulo, responsavel: vista === "todos" || !vista ? eu : vista });
      setNovoTitulo("");
      await carregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível criar a tarefa.");
    }
  }

  async function salvar(dados: DadosTarefa) {
    if (!editando) return;
    const { status, ...campos } = dados;
    await atualizar(`/tarefas/${editando.id}`, campos);
    if (status !== editando.status) await enviar(`/tarefas/${editando.id}/mover`, { status, posicao: null });
    setEditando(null);
    await carregar();
  }

  async function apagar() {
    if (!editando) return;
    await excluir(`/tarefas/${editando.id}`);
    setEditando(null);
    await carregar();
  }

  const abas = [...usuarios, "todos"];

  return (
    <div className="docs-pagina">
      <div className="com-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">Tarefas</h1>
          <p className="texto-secundario" style={{ margin: "6px 0 0" }}>
            O quadro de cada uma. Arraste os cartões entre as colunas conforme o andamento.
          </p>
        </div>
      </div>

      <div className="com-abas" role="tablist" aria-label="Quadro de quem">
        {abas.map((a) => {
          const r = a === "todos" ? null : resumo[a];
          return (
            <button key={a} role="tab" aria-selected={vista === a} className={`com-aba${vista === a ? " ativa" : ""}`} onClick={() => setVista(a)}>
              {a === "todos" ? "Todos" : maiuscula(a)}
              {a === eu && " (você)"}
              {r && r.abertas > 0 && <span className="mono tar-aba-contagem"> {r.abertas}</span>}
              {r && r.vencidas > 0 && (
                <span className="tar-aba-vencidas" title={`${r.vencidas} vencida(s)`}>
                  {r.vencidas}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}

      <div className="tar-quadro" role="group" aria-label="Quadro de tarefas" aria-busy={carregando}>
        {STATUS.map((status) => (
          <section
            key={status}
            className={`tar-coluna tar-${status}${sobre === status ? " tar-sobre" : ""}`}
            aria-label={`${ROTULO_STATUS[status]}: ${colunas[status].length} tarefas`}
            onDragOver={(e) => {
              if (arrastando === null) return;
              e.preventDefault();
              setSobre(status);
            }}
            onDragLeave={() => setSobre((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const id = arrastando;
              setArrastando(null);
              if (id !== null) mover(id, status);
            }}
          >
            <header className="funil-topo">
              <span className="funil-nome">{ROTULO_STATUS[status]}</span>
              <span className="mono texto-secundario">{colunas[status].length}</span>
            </header>

            {status === "a_fazer" && vista && (
              <form onSubmit={criar} className="tar-nova">
                <input
                  aria-label="Nova tarefa"
                  placeholder={`+ Nova tarefa${vista !== "todos" && vista !== eu ? ` para ${maiuscula(vista)}` : ""}`}
                  value={novoTitulo}
                  maxLength={200}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                />
              </form>
            )}

            <div className="tar-cartoes">
              {colunas[status].length === 0 && <p className="funil-vazio texto-secundario">Nada aqui</p>}
              {colunas[status].map((t) => {
                const prazo = situacaoPrazo(t, hoje);
                return (
                  <article
                    key={t.id}
                    className={`tar-cartao prio-${t.prioridade}${arrastando === t.id ? " arrastando" : ""}`}
                    draggable
                    onDragStart={() => setArrastando(t.id)}
                    onDragEnd={() => {
                      setArrastando(null);
                      setSobre(null);
                    }}
                    onDragOver={(e) => {
                      if (arrastando !== null && arrastando !== t.id) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSobre(null);
                      const id = arrastando;
                      setArrastando(null);
                      if (id !== null && id !== t.id) mover(id, status, posicaoAntesDe(tarefas, id, t.id));
                    }}
                  >
                    {/* span com papel de botão: <button> não inicia arrasto do cartão */}
                    <span
                      role="button"
                      tabIndex={0}
                      className="tar-titulo"
                      onClick={() => setEditando(t)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditando(t);
                        }
                      }}
                    >
                      {t.titulo}
                    </span>
                    <div className="tar-meta">
                      {t.prioridade === "alta" && <span className="tar-chip tar-chip-alta">Alta</span>}
                      {t.prioridade === "baixa" && <span className="tar-chip">Baixa</span>}
                      {t.prazo && (
                        <span className={`tar-chip tar-prazo-${prazo ?? "feito"}`}>
                          {prazo === "vencida" ? "Venceu " : prazo === "hoje" ? "Hoje · " : ""}
                          {formatarDia(t.prazo)}
                        </span>
                      )}
                      {vista === "todos" && <span className="tar-chip tar-chip-pessoa">{maiuscula(t.responsavel)}</span>}
                    </div>
                    <select
                      className="funil-mover"
                      aria-label={`Mover ${t.titulo} para outra coluna`}
                      value={t.status}
                      onChange={(e) => mover(t.id, e.target.value as StatusTarefa)}
                    >
                      {STATUS.map((s) => (
                        <option key={s} value={s}>
                          {ROTULO_STATUS[s]}
                        </option>
                      ))}
                    </select>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Modal titulo="Tarefa" aberto={editando !== null} onFechar={() => setEditando(null)}>
        {editando && (
          <TarefaForm key={editando.id} tarefa={editando} usuarios={usuarios} onSalvar={salvar} onExcluir={apagar} onCancelar={() => setEditando(null)} />
        )}
      </Modal>
    </div>
  );
}
