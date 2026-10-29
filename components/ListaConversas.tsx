"use client";

// Lista de conversas do chat: "Geral" (sempre existe) + as criadas pelos sócios. Criar, renomear e
// arquivar são feitos aqui; a página só recebe qual conversa está aberta.

import { useCallback, useEffect, useState } from "react";
import { enviar, atualizar, obter } from "../lib/api";
import { tempoRelativo } from "../lib/docs";

export type Conversa = { id: number; titulo: string; ultima_em: string; mensagens: number };

export default function ListaConversas({
  atual,
  onEscolher,
}: {
  atual: number | null;
  onEscolher: (id: number | null) => void;
}) {
  const [lista, setLista] = useState<Conversa[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const l = await obter<Conversa[]>("/conversas");
      if (Array.isArray(l)) setLista(l);
    } catch {
      // erros de rede não quebram o loop
    }
  }, []);

  useEffect(() => {
    carregar();
    const timer = setInterval(carregar, 4000);
    return () => clearInterval(timer);
  }, [carregar]);

  // Se a conversa aberta foi arquivada em outra tela, volta para a Geral.
  useEffect(() => {
    if (atual !== null && lista.length > 0 && !lista.some((c) => c.id === atual)) onEscolher(null);
  }, [lista, atual, onEscolher]);

  async function nova() {
    setErro(null);
    try {
      const c = await enviar<Conversa>("/conversas", {});
      await carregar();
      onEscolher(c.id);
    } catch {
      setErro("Não foi possível criar a conversa.");
    }
  }

  async function renomear(c: Conversa) {
    const titulo = window.prompt("Novo título da conversa:", c.titulo);
    if (!titulo || titulo.trim() === c.titulo) return;
    try {
      await atualizar(`/conversas/${c.id}`, { titulo });
      await carregar();
    } catch {
      setErro("Não foi possível renomear.");
    }
  }

  async function arquivar(c: Conversa) {
    if (!window.confirm(`Arquivar “${c.titulo}”? As mensagens continuam guardadas, mas a conversa sai da lista.`)) return;
    try {
      await enviar(`/conversas/${c.id}/arquivar`);
      if (atual === c.id) onEscolher(null);
      await carregar();
    } catch {
      setErro("Não foi possível arquivar.");
    }
  }

  return (
    <nav className="chat-conversas" aria-label="Conversas">
      <button type="button" className="botao-destaque chat-nova" onClick={nova}>
        + Nova conversa
      </button>
      {erro && (
        <p role="alert" className="doc-erro">
          {erro}
        </p>
      )}
      <ul>
        <li>
          <button
            type="button"
            className={`chat-conversa${atual === null ? " ativa" : ""}`}
            aria-current={atual === null ? "true" : undefined}
            onClick={() => onEscolher(null)}
          >
            <span className="chat-conversa-titulo">Geral</span>
            <span className="chat-conversa-sub texto-secundario">avisos e resumos dos agentes</span>
          </button>
        </li>
        {lista.map((c) => (
          <li key={c.id} className="chat-conversa-linha">
            <button
              type="button"
              className={`chat-conversa${atual === c.id ? " ativa" : ""}`}
              aria-current={atual === c.id ? "true" : undefined}
              onClick={() => onEscolher(c.id)}
            >
              <span className="chat-conversa-titulo">{c.titulo}</span>
              <span className="chat-conversa-sub texto-secundario">
                {c.mensagens} msgs · {tempoRelativo(c.ultima_em)}
              </span>
            </button>
            <span className="chat-conversa-acoes">
              <button type="button" aria-label={`Renomear ${c.titulo}`} title="Renomear" onClick={() => renomear(c)}>
                ✎
              </button>
              <button type="button" aria-label={`Arquivar ${c.titulo}`} title="Arquivar" onClick={() => arquivar(c)}>
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
