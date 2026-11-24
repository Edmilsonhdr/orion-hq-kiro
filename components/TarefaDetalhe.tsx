"use client";

// Tarefa aberta, no formato do Jira: uma janela grande com duas colunas.
// Esquerda: épico e chave no topo, título, descrição, subtarefas (com progresso), tarefas vinculadas e a atividade
// (comentários e histórico). Direita: status em destaque e a caixa "Informações" (tipo, prioridade, responsável,
// relator, prazo, pontos, sprint, épico, etiquetas, negócio e documento).
// Cada campo salva sozinho ao mudar (sem botão "Salvar"); Esc fecha.

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { atualizar, enviar, excluir, obter } from "../lib/api";
import { tempoRelativo } from "../lib/docs";
import {
  COR_TIPO_TAREFA,
  corPessoa,
  fraseHistorico,
  PRIORIDADES,
  progresso,
  ROTULO_PRIORIDADE,
  ROTULO_TIPO_TAREFA,
  rotuloPrazo,
  situacaoPrazo,
  TIPOS_TAREFA,
  TIPOS_VINCULO,
  type ColunaTarefa,
  type DetalheTarefa,
  type Sprint,
  type Tarefa,
  type TipoTarefa,
} from "../lib/tarefas";
import Anexos from "./Anexos";
import { nomeUsuario } from "../lib/exibicao";
import Escolha from "./Escolha";
import CampoData from "./CampoData";
import EditorTarefa from "./EditorTarefa";
import { TextoRico } from "./TextoComImagens";
import { usePessoas } from "../lib/pessoas";
import VisualizadorImagens from "./VisualizadorImagens";
import type { Anexo } from "../lib/comercial";
import Icone, { Avatar, IconePrioridade } from "./IconesTarefa";
import type { OpcaoDocumento, OpcaoNegocio } from "./TarefaPainel";

type Props = {
  tarefaId: number;
  hoje: string;
  usuarios: string[];
  eu: string;
  negocios: OpcaoNegocio[];
  documentos: OpcaoDocumento[];
  epicos: Tarefa[];
  sprints: Sprint[];
  todas: Tarefa[];
  onMudou: () => void;
  onAbrir: (id: number) => void;
  onFechar: () => void;
};

const maiuscula = (s: string) => nomeUsuario(s);
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Ícone quadrado do tipo, com a cor do tipo (como no Jira).
export function IconeTipo({ tipo, tamanho = 16 }: { tipo: TipoTarefa; tamanho?: number }) {
  const caminho: Record<TipoTarefa, string> = {
    tarefa: "m7 12.5 3 3 7-7",
    bug: "M12 8a3 3 0 0 0-3 3v3a3 3 0 0 0 6 0v-3a3 3 0 0 0-3-3zM9 11H7M17 11h-2M9 15H7M17 15h-2",
    melhoria: "M12 17V7M7.5 11.5 12 7l4.5 4.5",
    historia: "M8 6h8v12l-4-3-4 3z",
    epico: "M13 5 8 13h4l-1 6 5-8h-4z",
  };
  return (
    <span className="td-tipo-icone" style={{ width: tamanho, height: tamanho, background: COR_TIPO_TAREFA[tipo] }} title={ROTULO_TIPO_TAREFA[tipo]} aria-hidden>
      <svg width={tamanho - 4} height={tamanho - 4} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={caminho[tipo]} />
      </svg>
    </span>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="td-info-linha">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function TarefaDetalhe({ tarefaId, hoje, usuarios, eu, negocios, documentos, epicos, sprints, todas, onMudou, onAbrir, onFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [d, setD] = useState<DetalheTarefa | null>(null);
  const [colunas, setColunas] = useState<ColunaTarefa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [editandoDescricao, setEditandoDescricao] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [novaSub, setNovaSub] = useState("");
  const [abrirSub, setAbrirSub] = useState(false);
  const [abrirVinculo, setAbrirVinculo] = useState(false);
  const [vinculo, setVinculo] = useState<{ tipo: string; destino: string }>({ tipo: "relacionada", destino: "" });
  const [comentario, setComentario] = useState("");
  const [aba, setAba] = useState<"comentarios" | "historico">("comentarios");
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [versaoAnexos, setVersaoAnexos] = useState(0);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [imagens, setImagens] = useState<Anexo[]>([]);
  const pessoas = usePessoas();
  const [editandoComentario, setEditandoComentario] = useState<{ id: number; texto: string } | null>(null);

  async function salvarComentario() {
    const e = editandoComentario;
    if (!e || !e.texto.trim()) return;
    setEditandoComentario(null);
    await acao(() => atualizar(`/tarefas/comentarios/${e.id}`, { texto: e.texto }));
  }
  useEffect(() => {
    obter<Anexo[]>(`/anexos?entidade=tarefa&id=${tarefaId}`)
      .then((l) => setImagens(l.filter((a) => a.tipo.startsWith("image/"))))
      .catch(() => {});
  }, [tarefaId, versaoAnexos]);
  const anexou = () => {
    setVersaoAnexos((v) => v + 1);
    onMudou();
  };

  const carregar = useCallback(async () => {
    try {
      const t = await obter<DetalheTarefa>(`/tarefas/${tarefaId}`);
      setD(t);
      setTitulo(t.titulo);
      setDescricao(t.descricao ?? "");
      setColunas(await obter<ColunaTarefa[]>(`/tarefas/colunas?dono=${encodeURIComponent(t.responsavel)}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a tarefa.");
    }
  }, [tarefaId]);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    setEditandoDescricao(false);
    setAbrirSub(false);
    setAbrirVinculo(false);
    carregar();
  }, [carregar]);

  async function acao(fn: () => Promise<unknown>) {
    try {
      await fn();
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  const salvar = (campos: Record<string, unknown>) => acao(() => atualizar(`/tarefas/${tarefaId}`, campos));

  if (!d) {
    return (
      <dialog ref={ref} className="td-janela" onCancel={(e) => (e.preventDefault(), onFechar())} onClick={(e) => e.target === ref.current && onFechar()}>
        <div className="td-carregando">{erro ?? "Carregando…"}</div>
      </dialog>
    );
  }

  const tipo = (d.tipo ?? "tarefa") as TipoTarefa;
  const situacao = situacaoPrazo(d, hoje);
  const feitas = d.subtarefas.filter((s) => s.coluna_concluida).length;
  const grupos = d.vinculos.reduce<Record<string, typeof d.vinculos>>((acc, v) => ((acc[v.rotulo] ??= []).push(v), acc), {});
  const candidatos = todas.filter((t) => t.id !== d.id && !d.vinculos.some((v) => v.tarefa_id === t.id));
  const sprintsAbertas = sprints.filter((s) => s.estado !== "encerrada");
  const colunaAtual = colunas.find((c) => c.chave === d.status);

  function salvarTitulo() {
    const t = titulo.trim();
    if (!t) return setTitulo(d!.titulo);
    if (t !== d!.titulo) salvar({ titulo: t });
  }

  function adicionarEtiqueta(e: FormEvent) {
    e.preventDefault();
    const nome = novaEtiqueta.trim();
    if (!nome) return;
    setNovaEtiqueta("");
    salvar({ etiquetas: [...(d!.etiquetas ?? []), nome] });
  }

  async function criarSubtarefa(e: FormEvent) {
    e.preventDefault();
    const t = novaSub.trim();
    if (!t) return;
    setNovaSub("");
    await acao(() => enviar("/tarefas", { titulo: t, pai_id: d!.id, responsavel: d!.responsavel }));
  }

  async function criarVinculo(e: FormEvent) {
    e.preventDefault();
    const id = Number(vinculo.destino.replace(/^ORI-/i, "").split(" ")[0]);
    if (!id) return setErro("Escolha a tarefa pela chave (ex.: ORI-12).");
    await acao(() => enviar(`/tarefas/${d!.id}/vinculos`, { destino_id: id, tipo: vinculo.tipo }));
    setVinculo({ tipo: vinculo.tipo, destino: "" });
    setAbrirVinculo(false);
  }

  async function comentar(e: FormEvent) {
    e.preventDefault();
    await enviarComentario();
  }

  function salvarDescricao() {
    setEditandoDescricao(false);
    if (descricao !== (d!.descricao ?? "")) salvar({ descricao });
  }

  async function enviarComentario() {
    const texto = comentario.trim();
    if (!texto) return;
    await acao(() => enviar(`/tarefas/${d!.id}/comentarios`, { texto }));
    setComentario("");
  }

  async function apagar() {
    if (!window.confirm(`Excluir ${d!.chave}? Não dá para desfazer.`)) return;
    try {
      await excluir(`/tarefas/${d!.id}`);
      onMudou();
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  function copiarLink() {
    navigator.clipboard?.writeText(`${window.location.origin}/tarefas?tarefa=${d!.id}`).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <dialog
      ref={ref}
      className="td-janela"
      aria-labelledby="td-titulo"
      onCancel={(e) => {
        e.preventDefault();
        if (ampliada !== null) return setAmpliada(null);
        if (editandoComentario) return setEditandoComentario(null);
        if (editandoDescricao) return setEditandoDescricao(false);
        onFechar();
      }}
      onClick={(e) => e.target === ref.current && onFechar()}
    >
      <header className="td-topo">
        <nav className="td-trilha" aria-label="Onde está a tarefa">
          {tipo !== "epico" && !d.pai_id && (
            <Escolha
              className="td-epico-trilha"
              rotulo="Épico"
              valor={d.epico_id ? String(d.epico_id) : ""}
              vazio="Adicionar épico"
              onEscolher={(v) => salvar({ epico_id: v ? Number(v) : null })}
              opcoes={[{ valor: "", rotulo: "Sem épico" }, ...epicos.map((ep) => ({ valor: String(ep.id), rotulo: ep.titulo, icone: <IconeTipo tipo="epico" />, dica: ep.chave }))]}
              gatilho={
                <>
                  <span className="td-epico-ponto" aria-hidden />
                  {epicos.find((ep) => ep.id === d.epico_id)?.titulo ?? d.epico_titulo ?? "Adicionar épico"}
                </>
              }
            />
          )}
          {d.pai_id && (
            <button type="button" className="td-trilha-item" onClick={() => onAbrir(d.pai_id!)}>
              ORI-{d.pai_id} {d.pai_titulo}
            </button>
          )}
          <span className="td-trilha-sep">/</span>
          <span className="td-trilha-item atual">
            <IconeTipo tipo={tipo} />
            {d.chave}
          </span>
        </nav>
        <div className="td-topo-acoes">
          <button type="button" className="td-icone" onClick={copiarLink} title="Copiar link">
            {copiado ? <Icone nome="check" /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>}
          </button>
          <button type="button" className="td-icone perigo" onClick={apagar} title="Excluir tarefa">
            <Icone nome="lixeira" />
          </button>
          <button type="button" className="td-icone" onClick={onFechar} title="Fechar (Esc)" aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
      </header>

      {erro && (
        <p role="alert" className="td-erro">
          {erro}
        </p>
      )}

      <div className="td-corpo">
        <main className="td-principal">
          <textarea
            id="td-titulo"
            className="td-titulo"
            value={titulo}
            rows={1}
            maxLength={200}
            aria-label="Título"
            onChange={(e) => setTitulo(e.target.value.replace(/\n/g, " "))}
            onBlur={salvarTitulo}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />

          <div className="td-atalhos">
            {tipo !== "epico" && !d.pai_id && (
              <button type="button" className="td-atalho" onClick={() => setAbrirSub(true)}>
                <Icone nome="mais" /> Subtarefa
              </button>
            )}
            <button type="button" className="td-atalho" onClick={() => setAbrirVinculo(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
              Vincular tarefa
            </button>
          </div>

          <section className="td-secao">
            <h3>Descrição</h3>
            {editandoDescricao ? (
              <div className="td-descricao-edicao">
                <EditorTarefa
                  autoFocus
                  rotulo="Descrição"
                  value={descricao}
                  onValor={setDescricao}
                  entidade="tarefa"
                  entidadeId={d.id}
                  onAnexou={anexou}
                  pessoas={pessoas}
                  placeholder="Contexto, links, critérios de pronto… Cole prints aqui (Ctrl+V) e marque pessoas com @."
                  onEnviar={salvarDescricao}
                  onEsc={() => {
                    setDescricao(d.descricao ?? "");
                    setEditandoDescricao(false);
                  }}
                />
                <div className="td-linha-botoes">
                  <button
                    type="button"
                    className="botao botao-destaque"
                    onClick={salvarDescricao}
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    className="botao"
                    onClick={() => {
                      setDescricao(d.descricao ?? "");
                      setEditandoDescricao(false);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className={`td-descricao${d.descricao ? "" : " vazia"}`}
                onClick={() => setEditandoDescricao(true)}
                onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setEditandoDescricao(true)}
              >
                {d.descricao ? <TextoRico texto={d.descricao} onAmpliar={setAmpliada} onMudar={(novo) => salvar({ descricao: novo })} /> : "Adicionar descrição (dá para colar imagens)"}
              </div>
            )}
          </section>

          <div className="td-anexos">
            <Anexos entidade="tarefa" id={d.id} colarNaPagina grade versao={versaoAnexos} onMudou={anexou} onAbrirImagem={setAmpliada} />
          </div>

          {tipo === "epico" && (
            <section className="td-secao">
              <h3>
                Tarefas do épico <span className="td-contagem">{d.filhas?.length ?? 0}</span>
              </h3>
              <ul className="td-lista">
                {(d.filhas ?? []).map((f) => (
                  <li key={f.id}>
                    <button type="button" className="td-item" onClick={() => onAbrir(f.id)}>
                      <IconeTipo tipo={(f.tipo ?? "tarefa") as TipoTarefa} />
                      <span className={`td-item-chave${f.coluna_concluida ? " feita" : ""}`}>{f.chave}</span>
                      <span className="td-item-titulo">{f.titulo}</span>
                      <Avatar nome={f.responsavel} cor={corPessoa(f.responsavel)} tamanho={20} />
                    </button>
                  </li>
                ))}
                {(d.filhas ?? []).length === 0 && <li className="td-vazio">Escolha este épico no topo de uma tarefa para ela aparecer aqui.</li>}
              </ul>
            </section>
          )}

          {(d.subtarefas.length > 0 || abrirSub) && (
            <section className="td-secao">
              <h3>
                Subtarefas <span className="td-contagem">{d.subtarefas.length}</span>
                {d.subtarefas.length > 0 && (
                  <span className="td-progresso" aria-label={`${feitas} de ${d.subtarefas.length} feitas`}>
                    <span style={{ width: `${progresso(feitas, d.subtarefas.length)}%` }} />
                  </span>
                )}
                {d.subtarefas.length > 0 && <span className="td-progresso-texto">{progresso(feitas, d.subtarefas.length)}% feito</span>}
              </h3>
              <ul className="td-lista">
                {d.subtarefas.map((s) => (
                  <li key={s.id} className="td-sub">
                    <button
                      type="button"
                      className={`tar-concluir${s.coluna_concluida ? " feito" : ""}`}
                      aria-label={s.coluna_concluida ? `Reabrir ${s.titulo}` : `Concluir ${s.titulo}`}
                      onClick={() => acao(() => enviar(`/tarefas/${s.id}/concluir`, { feita: !s.coluna_concluida }))}
                    >
                      <Icone nome="check" tamanho={12} />
                    </button>
                    <button type="button" className="td-item" onClick={() => onAbrir(s.id)}>
                      <span className={`td-item-chave${s.coluna_concluida ? " feita" : ""}`}>{s.chave}</span>
                      <span className={`td-item-titulo${s.coluna_concluida ? " feita" : ""}`}>{s.titulo}</span>
                      <Avatar nome={s.responsavel} cor={corPessoa(s.responsavel)} tamanho={20} />
                    </button>
                  </li>
                ))}
              </ul>
              {abrirSub && (
                <form className="td-adicionar" onSubmit={criarSubtarefa}>
                  <input autoFocus value={novaSub} maxLength={200} onChange={(e) => setNovaSub(e.target.value)} placeholder="O que precisa ser feito?" aria-label="Nova subtarefa" />
                  <button type="submit" className="botao botao-destaque" disabled={!novaSub.trim()}>
                    Criar
                  </button>
                  <button type="button" className="botao" onClick={() => setAbrirSub(false)}>
                    Cancelar
                  </button>
                </form>
              )}
            </section>
          )}

          {(d.vinculos.length > 0 || abrirVinculo) && (
            <section className="td-secao">
              <h3>
                Tarefas vinculadas
                <button type="button" className="td-icone pequeno" onClick={() => setAbrirVinculo(true)} title="Vincular tarefa" aria-label="Vincular tarefa">
                  <Icone nome="mais" />
                </button>
              </h3>
              {Object.entries(grupos).map(([rotulo, lista]) => (
                <div key={rotulo} className="td-vinculo-grupo">
                  <span className="td-vinculo-rotulo">{rotulo}</span>
                  <ul className="td-lista">
                    {lista.map((v) => (
                      <li key={v.id} className="td-vinculo">
                        <button type="button" className="td-item" onClick={() => onAbrir(v.tarefa_id)}>
                          <IconeTipo tipo={v.tarefa_tipo} />
                          <span className={`td-item-chave${v.feita ? " feita" : ""}`}>{v.chave}</span>
                          <span className="td-item-titulo">{v.titulo}</span>
                          <span className={`td-status-mini${v.feita ? " feito" : ""}`}>{v.feita ? "Feito" : "Aberta"}</span>
                          <Avatar nome={v.responsavel} cor={corPessoa(v.responsavel)} tamanho={20} />
                        </button>
                        <button type="button" className="td-icone pequeno" title="Tirar vínculo" aria-label={`Tirar vínculo com ${v.chave}`} onClick={() => acao(() => excluir(`/tarefas/vinculos/${v.id}`))}>
                          <Icone nome="fechar" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {abrirVinculo && (
                <form className="td-adicionar" onSubmit={criarVinculo}>
                  <Escolha
                    className="esc-borda"
                    rotulo="Tipo de vínculo"
                    valor={vinculo.tipo}
                    buscaDesde={99}
                    onEscolher={(v) => setVinculo({ ...vinculo, tipo: v })}
                    opcoes={TIPOS_VINCULO.map(([valor, rotulo]) => ({ valor, rotulo }))}
                  />
                  <input
                    autoFocus
                    list="td-candidatos"
                    value={vinculo.destino}
                    onChange={(e) => setVinculo({ ...vinculo, destino: e.target.value })}
                    placeholder="Busque pela chave ou título"
                    aria-label="Tarefa a vincular"
                  />
                  <datalist id="td-candidatos">
                    {candidatos.map((t) => (
                      <option key={t.id} value={`ORI-${t.id} ${t.titulo}`} />
                    ))}
                  </datalist>
                  <button type="submit" className="botao botao-destaque" disabled={!vinculo.destino.trim()}>
                    Vincular
                  </button>
                  <button type="button" className="botao" onClick={() => setAbrirVinculo(false)}>
                    Cancelar
                  </button>
                </form>
              )}
            </section>
          )}

          <section className="td-secao">
            <h3>Atividade</h3>
            <div className="td-abas" role="tablist">
              <button type="button" role="tab" aria-selected={aba === "comentarios"} className={aba === "comentarios" ? "ativa" : ""} onClick={() => setAba("comentarios")}>
                Comentários {d.comentarios.length > 0 && <span className="td-contagem">{d.comentarios.length}</span>}
              </button>
              <button type="button" role="tab" aria-selected={aba === "historico"} className={aba === "historico" ? "ativa" : ""} onClick={() => setAba("historico")}>
                Histórico
              </button>
            </div>
            {aba === "comentarios" ? (
              <>
                <form className="td-comentar" onSubmit={comentar}>
                  <Avatar nome={eu || "?"} cor={corPessoa(eu || "?")} tamanho={30} />
                  <div className="td-comentar-caixa">
                    <EditorTarefa
                      compacto={!comentario}
                      rotulo="Novo comentário"
                      value={comentario}
                      onValor={setComentario}
                      entidade="tarefa"
                      entidadeId={d.id}
                      onAnexou={anexou}
                      pessoas={pessoas}
                      onEnviar={() => enviarComentario()}
                      placeholder="Adicionar um comentário… (cole prints com Ctrl+V, marque com @)"
                    />
                    {comentario.trim() && (
                      <div className="td-linha-botoes">
                        <button type="submit" className="botao botao-destaque">
                          Comentar
                        </button>
                        <span className="td-dica">Ctrl + Enter</span>
                      </div>
                    )}
                  </div>
                </form>
                <ul className="td-comentarios">
                  {[...d.comentarios].reverse().map((c) => (
                    <li key={c.id}>
                      <Avatar nome={c.autor} cor={corPessoa(c.autor)} tamanho={30} />
                      <div>
                        <p className="td-comentario-topo">
                          <strong>{nomeUsuario(c.autor)}</strong> <span title={dataHora(c.criado_em)}>{tempoRelativo(c.criado_em)}</span>
                          {c.autor === eu && editandoComentario?.id !== c.id && (
                            <>
                              <button type="button" className="td-link" onClick={() => setEditandoComentario({ id: c.id, texto: c.texto })}>
                                Editar
                              </button>
                              <button type="button" className="td-link" onClick={() => window.confirm("Apagar o comentário?") && acao(() => excluir(`/tarefas/comentarios/${c.id}`))}>
                                Apagar
                              </button>
                            </>
                          )}
                        </p>
                        {editandoComentario?.id === c.id ? (
                          <div className="td-comentario-edicao">
                            <EditorTarefa
                              autoFocus
                              rotulo="Editar comentário"
                              value={editandoComentario.texto}
                              onValor={(texto) => setEditandoComentario({ id: c.id, texto })}
                              entidade="tarefa"
                              entidadeId={d.id}
                              onAnexou={anexou}
                              pessoas={pessoas}
                              onEnviar={salvarComentario}
                              onEsc={() => setEditandoComentario(null)}
                            />
                            <div className="td-linha-botoes">
                              <button type="button" className="botao botao-destaque" disabled={!editandoComentario.texto.trim()} onClick={salvarComentario}>
                                Salvar
                              </button>
                              <button type="button" className="botao" onClick={() => setEditandoComentario(null)}>
                                Cancelar
                              </button>
                              <span className="td-dica">Ctrl + Enter salva · Esc cancela</span>
                            </div>
                          </div>
                        ) : (
                        <div className="td-comentario-texto">
                          <TextoRico
                            texto={c.texto}
                            onAmpliar={setAmpliada}
                            onMudar={c.autor === eu ? (novo) => acao(() => atualizar(`/tarefas/comentarios/${c.id}`, { texto: novo })) : undefined}
                          />
                        </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="td-historico">
                {d.historico.map((h) => (
                  <li key={h.id}>
                    <Avatar nome={h.autor} cor={corPessoa(h.autor)} tamanho={24} />
                    <p>
                      <strong>{nomeUsuario(h.autor)}</strong> {fraseHistorico(h)}
                      <span title={dataHora(h.criado_em)}> · {tempoRelativo(h.criado_em)}</span>
                    </p>
                  </li>
                ))}
                {d.historico.length === 0 && <li className="td-vazio">Sem mudanças registradas ainda.</li>}
              </ul>
            )}
          </section>
        </main>

        <aside className="td-lateral">
          <div className="td-status-linha">
            <Escolha
              className={`td-status${colunaAtual?.concluida ? " feito" : ""}`}
              rotulo="Status"
              valor={d.status}
              onEscolher={(v) => acao(() => enviar(`/tarefas/${d.id}/mover`, { status: v, posicao: null }))}
              opcoes={colunas.map((c, i) => ({ valor: c.chave, rotulo: c.nome, icone: <span className={`tar-ponto tar-cor-${c.concluida ? "feita" : i % 6}`} aria-hidden /> }))}
            />
            {!colunaAtual?.concluida && colunas.some((c) => c.concluida) && (
              <button type="button" className="botao td-concluir" onClick={() => acao(() => enviar(`/tarefas/${d.id}/concluir`, { feita: true }))}>
                <Icone nome="check" /> Concluir
              </button>
            )}
            {(d.bloqueios_abertos ?? 0) > 0 && <span className="td-bloqueio">Bloqueada por {d.bloqueios_abertos}</span>}
          </div>

          <section className="td-info">
            <h3>Informações</h3>
            <dl>
              <Linha rotulo="Tipo">
                <span className="td-campo">
                  <Escolha
                    rotulo="Tipo"
                    valor={tipo}
                    onEscolher={(v) => salvar({ tipo: v })}
                    opcoes={TIPOS_TAREFA.filter((t) => t !== "epico" || !d.pai_id).map((t) => ({ valor: t, rotulo: ROTULO_TIPO_TAREFA[t], icone: <IconeTipo tipo={t} /> }))}
                  />
                </span>
              </Linha>
              <Linha rotulo="Prioridade">
                <span className="td-campo">
                  <Escolha
                    rotulo="Prioridade"
                    valor={d.prioridade}
                    onEscolher={(v) => salvar({ prioridade: v })}
                    opcoes={[...PRIORIDADES].reverse().map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p], icone: <IconePrioridade prioridade={p} tamanho={15} /> }))}
                  />
                </span>
              </Linha>
              <Linha rotulo="Responsável">
                <span className="td-campo">
                  <Escolha
                    rotulo="Responsável"
                    valor={d.responsavel}
                    onEscolher={(v) => salvar({ responsavel: v })}
                    opcoes={usuarios.map((u) => ({ valor: u, rotulo: maiuscula(u), icone: <Avatar nome={u} cor={corPessoa(u)} tamanho={22} />, dica: u === eu ? "você" : undefined }))}
                  />
                </span>
                {d.responsavel !== eu && eu && (
                  <button type="button" className="td-link" onClick={() => salvar({ responsavel: eu })}>
                    Atribuir a mim
                  </button>
                )}
              </Linha>
              <Linha rotulo="Relator">
                <span className="td-campo com-icone fixo">
                  <Avatar nome={d.criado_por} cor={corPessoa(d.criado_por)} tamanho={22} />
                  {maiuscula(d.criado_por)}
                </span>
              </Linha>
              <Linha rotulo="Data de entrega">
                <span className="td-campo">
                  <CampoData valor={d.prazo} onEscolher={(v) => salvar({ prazo: v })} rotulo="Data de entrega" vazio="Sem data" />
                </span>
                {d.prazo && <span className={`td-prazo prazo-${situacao ?? "ok"}`}>{rotuloPrazo(d.prazo, hoje)}</span>}
              </Linha>
              <Linha rotulo="Pontos">
                <span className="td-campo">
                  <Escolha
                    rotulo="Pontos"
                    valor={d.pontos != null ? String(d.pontos) : ""}
                    vazio="Sem estimativa"
                    onEscolher={(v) => salvar({ pontos: v === "" ? null : Number(v) })}
                    buscaDesde={99}
                    opcoes={[{ valor: "", rotulo: "Sem estimativa" }, ...[1, 2, 3, 5, 8, 13, 21].map((p) => ({ valor: String(p), rotulo: `${p} ${p === 1 ? "ponto" : "pontos"}`, icone: <span className="esc-pontos">{p}</span> }))]}
                  />
                </span>
              </Linha>
              {tipo !== "epico" && (
                <Linha rotulo="Sprint">
                  <span className="td-campo">
                    <Escolha
                      rotulo="Sprint"
                      valor={d.sprint_id ? String(d.sprint_id) : ""}
                      vazio="Backlog"
                      disabled={!!d.pai_id}
                      onEscolher={(v) => salvar({ sprint_id: v ? Number(v) : null })}
                      opcoes={[
                        { valor: "", rotulo: "Backlog" },
                        ...(d.sprint_id && d.sprint_estado === "encerrada" ? [{ valor: String(d.sprint_id), rotulo: d.sprint_nome ?? "Sprint", dica: "encerrada" }] : []),
                        ...sprintsAbertas.map((sp) => ({ valor: String(sp.id), rotulo: sp.nome, dica: sp.estado === "ativa" ? "ativa" : "planejada" })),
                      ]}
                    />
                  </span>
                </Linha>
              )}
              <Linha rotulo="Etiquetas">
                <div className="td-etiquetas">
                  {(d.etiquetas ?? []).map((e) => (
                    <span key={e} className="td-etiqueta">
                      {e}
                      <button type="button" aria-label={`Tirar a etiqueta ${e}`} onClick={() => salvar({ etiquetas: (d.etiquetas ?? []).filter((x) => x !== e) })}>
                        ×
                      </button>
                    </span>
                  ))}
                  <form onSubmit={adicionarEtiqueta}>
                    <input value={novaEtiqueta} onChange={(e) => setNovaEtiqueta(e.target.value)} placeholder="+ Etiqueta" maxLength={30} aria-label="Nova etiqueta" />
                  </form>
                </div>
              </Linha>
              <Linha rotulo="Negócio">
                <span className="td-campo">
                  <Escolha
                    rotulo="Negócio do Comercial"
                    valor={d.negocio_id ? String(d.negocio_id) : ""}
                    onEscolher={(v) => salvar({ negocio_id: v ? Number(v) : null })}
                    opcoes={[{ valor: "", rotulo: "Nenhum" }, ...negocios.map((n) => ({ valor: String(n.id), rotulo: n.organizacao_nome, dica: n.titulo, icone: <Icone nome="negocio" tamanho={15} /> }))]}
                  />
                </span>
                {d.negocio_id && (
                  <Link className="td-link" href={`/comercial/negocios/${d.negocio_id}`}>
                    Abrir
                  </Link>
                )}
              </Linha>
              <Linha rotulo="Documento">
                <span className="td-campo">
                  <Escolha
                    rotulo="Documento do Docs"
                    valor={d.documento_id ? String(d.documento_id) : ""}
                    onEscolher={(v) => salvar({ documento_id: v ? Number(v) : null })}
                    opcoes={[{ valor: "", rotulo: "Nenhum" }, ...documentos.map((doc) => ({ valor: String(doc.id), rotulo: doc.titulo, icone: <Icone nome="documento" tamanho={15} /> }))]}
                  />
                </span>
                {d.documento_id && (
                  <Link className="td-link" href={`/docs/${d.documento_id}`}>
                    Abrir
                  </Link>
                )}
              </Linha>
            </dl>
          </section>

          <p className="td-datas">
            Criada {dataHora(d.criado_em)}
            <br />
            Atualizada {tempoRelativo(d.atualizado_em)}
            {d.concluida_em && (
              <>
                <br />
                Concluída {dataHora(d.concluida_em)}
              </>
            )}
          </p>
        </aside>
      </div>
      {ampliada !== null && <VisualizadorImagens lista={imagens} inicial={ampliada} onFechar={() => setAmpliada(null)} />}
    </dialog>
  );
}
