"use client";

// Painel lateral de uma tarefa: criar ou editar. Abre por cima do quadro (dialog nativo: foco preso, Esc fecha).
// Título grande no topo, propriedades em linhas (status, responsável, prioridade, prazo, vínculos) e os detalhes.
// Ctrl/⌘ + Enter salva.

import { nomeUsuario } from "../lib/exibicao";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { formatarDia } from "../lib/comercial";
import { corPessoa, PRIORIDADES, ROTULO_PRIORIDADE, ROTULO_TIPO_TAREFA, rotuloPrazo, situacaoPrazo, TIPOS_TAREFA, type ColunaTarefa, type Prioridade, type Sprint, type Tarefa, type TipoTarefa } from "../lib/tarefas";
import Icone, { Avatar, IconePrioridade } from "./IconesTarefa";

export type DadosTarefa = {
  titulo: string;
  descricao: string | null;
  responsavel: string;
  prioridade: Prioridade;
  prazo: string | null;
  status: string;
  documento_id: number | null;
  negocio_id: number | null;
  tipo?: TipoTarefa;
  epico_id?: number | null;
  sprint_id?: number | null;
  pontos?: number | null;
  etiquetas?: string[];
};

export type OpcaoNegocio = { id: number; titulo: string; organizacao_nome: string };
export type OpcaoDocumento = { id: number; titulo: string };

type Props = {
  /** null = tarefa nova */
  tarefa: Tarefa | null;
  /** Valores iniciais de uma tarefa nova (responsável e coluna). */
  padrao: { responsavel: string; status: string };
  hoje: string;
  usuarios: string[];
  colunas: ColunaTarefa[];
  negocios: OpcaoNegocio[];
  documentos: OpcaoDocumento[];
  onSalvar: (dados: DadosTarefa) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
  epicos?: Tarefa[];
  sprints?: Sprint[];
  sprintPadrao?: number | null;
};

const maiuscula = (s: string) => nomeUsuario(s);
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function TarefaPainel({ tarefa, padrao, hoje, usuarios, colunas, negocios, documentos, onSalvar, onExcluir, onFechar, epicos = [], sprints = [], sprintPadrao = null }: Props) {
  const [tipo, setTipo] = useState<TipoTarefa>(tarefa?.tipo ?? "tarefa");
  const [epicoId, setEpicoId] = useState(tarefa?.epico_id ? String(tarefa.epico_id) : "");
  const [sprintId, setSprintId] = useState(tarefa?.sprint_id ? String(tarefa.sprint_id) : sprintPadrao ? String(sprintPadrao) : "");
  const [pontos, setPontos] = useState(tarefa?.pontos != null ? String(tarefa.pontos) : "");
  const [etiquetas, setEtiquetas] = useState((tarefa?.etiquetas ?? []).join(", "));
  const ref = useRef<HTMLDialogElement>(null);
  const tituloRef = useRef<HTMLTextAreaElement>(null);
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");
  const [responsavel, setResponsavel] = useState(tarefa?.responsavel ?? padrao.responsavel);
  const [prioridade, setPrioridade] = useState<Prioridade>(tarefa?.prioridade ?? "normal");
  const [prazo, setPrazo] = useState(tarefa?.prazo?.slice(0, 10) ?? "");
  const [status, setStatus] = useState(tarefa?.status ?? padrao.status);
  const [negocioId, setNegocioId] = useState(tarefa?.negocio_id ? String(tarefa.negocio_id) : "");
  const [documentoId, setDocumentoId] = useState(tarefa?.documento_id ? String(tarefa.documento_id) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // showModal() põe o foco no primeiro botão (fechar); numa tarefa nova o foco vai para o título.
    if (!tarefa) tituloRef.current?.focus();
  }, [tarefa]);

  const alterado =
    !tarefa ||
    titulo !== tarefa.titulo ||
    descricao !== (tarefa.descricao ?? "") ||
    responsavel !== tarefa.responsavel ||
    prioridade !== tarefa.prioridade ||
    prazo !== (tarefa.prazo?.slice(0, 10) ?? "") ||
    status !== tarefa.status ||
    negocioId !== (tarefa.negocio_id ? String(tarefa.negocio_id) : "") ||
    documentoId !== (tarefa.documento_id ? String(tarefa.documento_id) : "");

  function fechar() {
    if (tarefa && alterado && titulo.trim() && !window.confirm("Descartar as alterações?")) return;
    onFechar();
  }

  async function salvar(e?: FormEvent) {
    e?.preventDefault();
    if (salvando || !titulo.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        responsavel,
        prioridade,
        prazo: prazo || null,
        status,
        negocio_id: negocioId ? Number(negocioId) : null,
        documento_id: documentoId ? Number(documentoId) : null,
        tipo,
        epico_id: tipo !== "epico" && epicoId ? Number(epicoId) : null,
        sprint_id: tipo !== "epico" && sprintId ? Number(sprintId) : null,
        pontos: pontos ? Number(pontos) : null,
        etiquetas: etiquetas.split(",").map((x) => x.trim()).filter(Boolean),
      });
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!onExcluir || !window.confirm("Excluir esta tarefa? Não dá para desfazer.")) return;
    try {
      await onExcluir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  function atalhos(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      salvar();
    }
  }

  const situacao = prazo ? situacaoPrazo({ prazo, coluna_concluida: colunas.find((c) => c.chave === status)?.concluida ?? false }, hoje) : null;
  const coluna = colunas.find((c) => c.chave === status);
  const negocio = negocios.find((n) => String(n.id) === negocioId);

  return (
    <dialog
      ref={ref}
      className="tar-gaveta"
      aria-labelledby="tp-cabecalho"
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) fechar();
      }}
    >
      <form className="tar-gaveta-corpo" onSubmit={salvar} onKeyDown={atalhos}>
        <header className="tar-gaveta-topo">
          <span id="tp-cabecalho" className="tar-gaveta-rotulo">
            {tarefa ? `Tarefa #${tarefa.id}` : "Nova tarefa"}
            {coluna && <span className={`tar-status-pilula${coluna.concluida ? " feita" : ""}`}>{coluna.nome}</span>}
          </span>
          <button type="button" className="tar-icone-botao" onClick={fechar} aria-label="Fechar" title="Fechar (Esc)">
            <Icone nome="fechar" />
          </button>
        </header>

        <div className="tar-gaveta-rolagem">
          <textarea
            ref={tituloRef}
            className="tar-gaveta-titulo"
            aria-label="Título"
            placeholder="O que precisa ser feito?"
            value={titulo}
            rows={1}
            maxLength={200}
            onChange={(e) => setTitulo(e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) e.preventDefault();
            }}
            required
          />

          <dl className="tar-props">
            <div className="tar-prop">
              <dt>
                <Icone nome="lista" tamanho={15} /> Tipo
              </dt>
              <dd>
                <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTarefa)}>
                  {TIPOS_TAREFA.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_TAREFA[t]}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            {tipo !== "epico" && epicos.length > 0 && (
              <div className="tar-prop">
                <dt>
                  <Icone nome="quadro" tamanho={15} /> Épico
                </dt>
                <dd>
                  <select aria-label="Épico" value={epicoId} onChange={(e) => setEpicoId(e.target.value)}>
                    <option value="">Nenhum</option>
                    {epicos.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.titulo}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            )}
            {tipo !== "epico" && (
              <div className="tar-prop">
                <dt>
                  <Icone nome="calendario" tamanho={15} /> Sprint
                </dt>
                <dd>
                  <select aria-label="Sprint" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
                    <option value="">Backlog</option>
                    {sprints
                      .filter((s) => s.estado !== "encerrada")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                          {s.estado === "ativa" ? " (ativa)" : ""}
                        </option>
                      ))}
                  </select>
                </dd>
              </div>
            )}
            <div className="tar-prop">
              <dt>
                <Icone nome="texto" tamanho={15} /> Pontos
              </dt>
              <dd>
                <select aria-label="Pontos" value={pontos} onChange={(e) => setPontos(e.target.value)}>
                  <option value="">Sem estimativa</option>
                  {[1, 2, 3, 5, 8, 13, 21].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div className="tar-prop">
              <dt>
                <Icone nome="texto" tamanho={15} /> Etiquetas
              </dt>
              <dd>
                <input aria-label="Etiquetas" value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="separadas por vírgula" />
              </dd>
            </div>
            <div className="tar-prop">
              <dt>
                <Icone nome="quadro" tamanho={15} /> Status
              </dt>
              <dd>
                <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {colunas.map((c) => (
                    <option key={c.chave} value={c.chave}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div className="tar-prop">
              <dt>
                <Avatar nome={responsavel} cor={corPessoa(responsavel)} tamanho={16} /> Responsável
              </dt>
              <dd>
                <select aria-label="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                  {usuarios.map((u) => (
                    <option key={u} value={u}>
                      {maiuscula(u)}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div className="tar-prop">
              <dt>
                <IconePrioridade prioridade={prioridade} tamanho={15} /> Prioridade
              </dt>
              <dd>
                <div className="tar-segmentos" role="radiogroup" aria-label="Prioridade">
                  {PRIORIDADES.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={prioridade === p} className={`tar-segmento prio-${p}${prioridade === p ? " ativo" : ""}`} onClick={() => setPrioridade(p)}>
                      {ROTULO_PRIORIDADE[p]}
                    </button>
                  ))}
                </div>
              </dd>
            </div>
            <div className="tar-prop">
              <dt>
                <Icone nome="calendario" tamanho={15} /> Prazo
              </dt>
              <dd className="tar-prop-prazo">
                <input aria-label="Prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
                {prazo && <span className={`tar-prazo-texto prazo-${situacao ?? "ok"}`}>{situacao === "vencida" ? `Venceu · ${rotuloPrazo(prazo, hoje)}` : rotuloPrazo(prazo, hoje)}</span>}
                {prazo && (
                  <button type="button" className="tar-link-botao" onClick={() => setPrazo("")}>
                    Tirar
                  </button>
                )}
              </dd>
            </div>
            <div className="tar-prop">
              <dt>
                <Icone nome="negocio" tamanho={15} /> Negócio
              </dt>
              <dd>
                <select aria-label="Negócio do Comercial" value={negocioId} onChange={(e) => setNegocioId(e.target.value)}>
                  <option value="">Nenhum</option>
                  {negocios.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.organizacao_nome} · {n.titulo}
                    </option>
                  ))}
                </select>
                {negocio && (
                  <a className="tar-link-botao" href={`/comercial/negocios/${negocio.id}`}>
                    Abrir
                  </a>
                )}
              </dd>
            </div>
            <div className="tar-prop">
              <dt>
                <Icone nome="documento" tamanho={15} /> Documento
              </dt>
              <dd>
                <select aria-label="Documento do Docs" value={documentoId} onChange={(e) => setDocumentoId(e.target.value)}>
                  <option value="">Nenhum</option>
                  {documentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.titulo}
                    </option>
                  ))}
                </select>
                {documentoId && (
                  <a className="tar-link-botao" href={`/docs/${documentoId}`}>
                    Abrir
                  </a>
                )}
              </dd>
            </div>
          </dl>

          <label className="tar-gaveta-secao" htmlFor="tp-descricao">
            <Icone nome="texto" tamanho={15} /> Detalhes
          </label>
          <textarea
            id="tp-descricao"
            className="tar-gaveta-descricao"
            placeholder="Contexto, links, próximos passos…"
            rows={7}
            value={descricao}
            maxLength={5000}
            onChange={(e) => setDescricao(e.target.value)}
          />

          {tarefa && (
            <p className="tar-gaveta-historico">
              Criada por {maiuscula(tarefa.criado_por)} em {dataHora(tarefa.criado_em)}
              {tarefa.atualizado_em && tarefa.atualizado_em !== tarefa.criado_em && <> · atualizada em {dataHora(tarefa.atualizado_em)}</>}
              {tarefa.concluida_em && <> · concluída em {formatarDia(tarefa.concluida_em.slice(0, 10))}</>}
            </p>
          )}

          {erro && (
            <p role="alert" className="com-erro">
              {erro}
            </p>
          )}
        </div>

        <footer className="tar-gaveta-rodape">
          {tarefa && onExcluir && (
            <button type="button" className="tar-icone-botao perigo" onClick={excluir} aria-label="Excluir tarefa" title="Excluir tarefa">
              <Icone nome="lixeira" />
            </button>
          )}
          <span className="tar-atalho-dica">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd> salva
          </span>
          <button type="button" className="botao" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-destaque" disabled={salvando || !titulo.trim() || !alterado}>
            {salvando ? "Salvando…" : tarefa ? "Salvar" : "Criar tarefa"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
