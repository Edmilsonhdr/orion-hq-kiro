"use client";

// Tarefas ligadas a um negócio ou a um documento: lista com a coluna e a responsável, concluir com um clique
// e criar uma nova já vinculada. O quadro completo fica em /tarefas.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { enviar, obter } from "../lib/api";
import { formatarDia, hojeISO } from "../lib/comercial";
import { situacaoPrazo, type ColunaTarefa, type Tarefa } from "../lib/tarefas";

const maiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function TarefasRelacionadas({ entidade, id }: { entidade: "negocio" | "documento"; id: number }) {
  const [lista, setLista] = useState<Tarefa[]>([]);
  const [colunas, setColunas] = useState<ColunaTarefa[]>([]);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const filtro = entidade === "negocio" ? `negocio_id=${id}` : `documento_id=${id}`;

  const carregar = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([obter<Tarefa[]>(`/tarefas?${filtro}`), obter<ColunaTarefa[]>("/tarefas/colunas")]);
      setLista(l);
      setColunas(c);
    } catch {
      // sem a lista a seção só fica vazia
    }
  }, [filtro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    try {
      await enviar("/tarefas", { titulo: novo.trim(), [entidade === "negocio" ? "negocio_id" : "documento_id"]: id });
      setNovo("");
      setErro(null);
      await carregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível criar a tarefa.");
    }
  }

  async function alternar(t: Tarefa) {
    const destino = t.coluna_concluida ? colunas[0] : colunas.find((c) => c.concluida);
    if (!destino) return;
    try {
      await enviar(`/tarefas/${t.id}/mover`, { status: destino.chave, posicao: null });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar.");
    }
  }

  const nomeColuna = (chave: string) => colunas.find((c) => c.chave === chave)?.nome ?? chave;
  const hoje = hojeISO();

  return (
    <section className="painel com-bloco" aria-label="Tarefas relacionadas">
      <h2 className="com-grupo-titulo">
        Tarefas <span className="mono texto-secundario">{lista.filter((t) => !t.coluna_concluida).length} abertas</span>
      </h2>
      {lista.length === 0 && (
        <p className="texto-secundario" style={{ margin: "0 0 8px" }}>
          Nenhuma tarefa ligada {entidade === "negocio" ? "a este negócio" : "a este documento"}.
        </p>
      )}
      <ul className="tar-rel-lista">
        {lista.map((t) => {
          const prazo = situacaoPrazo(t, hoje);
          return (
            <li key={t.id}>
              <input type="checkbox" aria-label={`Concluir ${t.titulo}`} checked={t.coluna_concluida} onChange={() => alternar(t)} />
              <span className={`tar-rel-titulo${t.coluna_concluida ? " feito" : ""}`}>
                <Link href={`/tarefas?pessoa=${encodeURIComponent(t.responsavel)}`}>{t.titulo}</Link>
                <span className="texto-secundario">
                  {" "}
                  · {nomeColuna(t.status)} · {maiuscula(t.responsavel)}
                </span>
                {t.prazo && <span className={`tar-chip tar-prazo-${prazo ?? "feito"}`}> {formatarDia(t.prazo)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      <form onSubmit={criar} className="com-piloto-novo">
        <input aria-label="Nova tarefa relacionada" placeholder="Nova tarefa para isto…" value={novo} maxLength={200} onChange={(e) => setNovo(e.target.value)} />
        <button type="submit" className="botao" disabled={!novo.trim()}>
          Adicionar
        </button>
      </form>
    </section>
  );
}
