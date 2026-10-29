"use client";

// Formulário de uma tarefa (editar, trocar de responsável, prazo, prioridade, excluir).

import { useState, type FormEvent } from "react";
import { PRIORIDADES, ROTULO_PRIORIDADE, type ColunaTarefa, type Prioridade, type Tarefa } from "../lib/tarefas";

export type DadosTarefa = {
  titulo: string;
  descricao: string | null;
  responsavel: string;
  prioridade: Prioridade;
  prazo: string | null;
  status: string;
  documento_id: number | null;
  negocio_id: number | null;
};

export type OpcaoNegocio = { id: number; titulo: string; organizacao_nome: string };
export type OpcaoDocumento = { id: number; titulo: string };

type Props = {
  tarefa: Tarefa;
  usuarios: string[];
  colunas: ColunaTarefa[];
  negocios: OpcaoNegocio[];
  documentos: OpcaoDocumento[];
  onSalvar: (dados: DadosTarefa) => Promise<void>;
  onExcluir: () => Promise<void>;
  onCancelar: () => void;
};

const maiuscula = (s: string) => s[0]?.toUpperCase() + s.slice(1);

export default function TarefaForm({ tarefa, usuarios, colunas, negocios, documentos, onSalvar, onExcluir, onCancelar }: Props) {
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [descricao, setDescricao] = useState(tarefa.descricao ?? "");
  const [responsavel, setResponsavel] = useState(tarefa.responsavel);
  const [prioridade, setPrioridade] = useState<Prioridade>(tarefa.prioridade);
  const [prazo, setPrazo] = useState(tarefa.prazo?.slice(0, 10) ?? "");
  const [status, setStatus] = useState<string>(tarefa.status);
  const [negocioId, setNegocioId] = useState<string>(tarefa.negocio_id ? String(tarefa.negocio_id) : "");
  const [documentoId, setDocumentoId] = useState<string>(tarefa.documento_id ? String(tarefa.documento_id) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ titulo: titulo.trim(), descricao: descricao.trim() || null, responsavel, prioridade, prazo: prazo || null, status,
        negocio_id: negocioId ? Number(negocioId) : null, documento_id: documentoId ? Number(documentoId) : null });
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm("Excluir esta tarefa?")) return;
    try {
      await onExcluir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  return (
    <form className="com-form" onSubmit={enviar}>
      <div className="com-campo">
        <label htmlFor="tf-titulo">Título</label>
        <input id="tf-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required autoFocus />
      </div>
      <div className="com-campo">
        <label htmlFor="tf-descricao">Detalhes</label>
        <textarea id="tf-descricao" rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={5000} />
      </div>
      <div className="com-linha">
        <div className="com-campo">
          <label htmlFor="tf-resp">Responsável</label>
          <select id="tf-resp" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            {usuarios.map((u) => (
              <option key={u} value={u}>
                {maiuscula(u)}
              </option>
            ))}
          </select>
        </div>
        <div className="com-campo">
          <label htmlFor="tf-status">Status</label>
          <select id="tf-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {colunas.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="com-linha">
        <div className="com-campo">
          <label htmlFor="tf-prio">Prioridade</label>
          <select id="tf-prio" value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PRIORIDADE[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="com-campo">
          <label htmlFor="tf-prazo">Prazo</label>
          <input id="tf-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </div>
      </div>
      <div className="com-linha">
        <div className="com-campo">
          <label htmlFor="tf-negocio">Negócio (Comercial)</label>
          <select id="tf-negocio" value={negocioId} onChange={(e) => setNegocioId(e.target.value)}>
            <option value="">Nenhum</option>
            {negocios.map((n) => (
              <option key={n.id} value={n.id}>
                {n.organizacao_nome} · {n.titulo}
              </option>
            ))}
          </select>
        </div>
        <div className="com-campo">
          <label htmlFor="tf-doc">Documento (Docs)</label>
          <select id="tf-doc" value={documentoId} onChange={(e) => setDocumentoId(e.target.value)}>
            <option value="">Nenhum</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      <p className="texto-secundario" style={{ margin: 0, fontSize: 13 }}>
        Criada por {maiuscula(tarefa.criado_por)}.
      </p>
      <div className="com-acoes">
        <button type="button" className="botao com-excluir" onClick={excluir}>
          Excluir
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="botao" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="botao botao-destaque" disabled={salvando || !titulo.trim()}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
