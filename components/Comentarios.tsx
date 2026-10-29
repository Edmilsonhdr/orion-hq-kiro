"use client";

// Comentários de um documento, com menção @usuario (realçada pelo Markdown e avisada no Início).

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ErroApi, enviar, excluir, obter } from "../lib/api";
import { tempoRelativo } from "../lib/docs";
import Markdown from "./Markdown";

type Comentario = { id: number; autor: string; texto: string; criado_em: string };

export default function Comentarios({ documentoId }: { documentoId: number }) {
  const [lista, setLista] = useState<Comentario[]>([]);
  const [eu, setEu] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await obter<Comentario[]>(`/documentos/${documentoId}/comentarios`));
    } catch {
      // comentários são opcionais: a página segue sem eles
    }
  }, [documentoId]);

  useEffect(() => {
    carregar();
    obter<{ usuario: string }>("/me").then((m) => setEu(m.usuario)).catch(() => {});
  }, [carregar]);

  async function publicar(e: FormEvent) {
    e.preventDefault();
    if (enviando || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await enviar(`/documentos/${documentoId}/comentarios`, { texto });
      setTexto("");
      await carregar();
    } catch (err) {
      setErro(err instanceof ErroApi || err instanceof Error ? err.message : "Não foi possível comentar.");
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(id: number) {
    if (!window.confirm("Apagar este comentário?")) return;
    try {
      await excluir(`/documentos/comentarios/${id}`);
      await carregar();
    } catch {
      setErro("Não foi possível apagar.");
    }
  }

  return (
    <section className="painel doc-comentarios" aria-label="Comentários">
      <h2 className="com-grupo-titulo" style={{ marginTop: 0 }}>
        Comentários <span className="mono texto-secundario">{lista.length}</span>
      </h2>
      <ul>
        {lista.map((c) => (
          <li key={c.id}>
            <div className="doc-comentario-topo">
              <strong>{c.autor}</strong>
              <span className="texto-secundario">{tempoRelativo(c.criado_em)}</span>
              {c.autor === eu && (
                <button type="button" className="chat-salvar" onClick={() => apagar(c.id)}>
                  apagar
                </button>
              )}
            </div>
            <Markdown texto={c.texto} />
          </li>
        ))}
      </ul>
      <form onSubmit={publicar} className="doc-comentario-form">
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva um comentário. Use @dimi ou @jullyana para avisar alguém."
          aria-label="Novo comentário"
        />
        {erro && (
          <p role="alert" className="doc-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao-destaque" disabled={enviando || !texto.trim()}>
          {enviando ? "Enviando…" : "Comentar"}
        </button>
      </form>
    </section>
  );
}
