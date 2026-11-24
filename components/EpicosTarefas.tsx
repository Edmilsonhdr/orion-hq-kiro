"use client";

// Épicos: cada um com o progresso das tarefas ligadas a ele (quantas e quantos pontos estão feitos).
// Clicar abre o épico; "Criar épico" cria um novo direto aqui.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { enviar, obter } from "../lib/api";
import { corPessoa, progresso, rotuloPrazo, type Epico } from "../lib/tarefas";
import { Avatar } from "./IconesTarefa";
import { IconeTipo } from "./TarefaDetalhe";

type Props = { eu: string; hoje: string; versao: number; onAbrir: (id: number) => void; onMudou: () => void };

export default function EpicosTarefas({ eu, hoje, versao, onAbrir, onMudou }: Props) {
  const [epicos, setEpicos] = useState<Epico[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEpicos(await obter<Epico[]>("/tarefas/epicos"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os épicos.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    const t = titulo.trim();
    if (!t) return;
    try {
      const novo = await enviar<Epico>("/tarefas", { titulo: t, tipo: "epico", responsavel: eu });
      setTitulo("");
      await carregar();
      onMudou();
      onAbrir(novo.id);
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível criar o épico.");
    }
  }

  return (
    <div className="ep">
      <form className="ep-criar" onSubmit={criar}>
        <IconeTipo tipo="epico" />
        <input value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} placeholder="Nome do novo épico (ex.: Lançamento nas lojas)" aria-label="Nome do novo épico" />
        <button type="submit" className="botao botao-destaque" disabled={!titulo.trim()}>
          Criar épico
        </button>
      </form>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      {epicos !== null && epicos.length === 0 && (
        <div className="ep-vazio">
          <strong>Nenhum épico ainda</strong>
          Épicos juntam tarefas de uma mesma entrega grande (ex.: “Lançamento nas lojas”) e mostram o quanto falta.
        </div>
      )}
      <div className="ep-grade">
        {(epicos ?? []).map((ep) => {
          const pct = progresso(ep.tarefas_feitas, ep.tarefas_total);
          return (
            <button key={ep.id} type="button" className={`ep-cartao${ep.coluna_concluida ? " feito" : ""}`} onClick={() => onAbrir(ep.id)}>
              <span className="ep-topo">
                <IconeTipo tipo="epico" />
                <span className="ep-chave">{ep.chave}</span>
                {ep.coluna_concluida && <span className="ep-feito">Concluído</span>}
                <Avatar nome={ep.responsavel} cor={corPessoa(ep.responsavel)} tamanho={22} />
              </span>
              <span className="ep-titulo">{ep.titulo}</span>
              <span className="ep-barra" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="ep-numeros">
                <strong>{pct}%</strong> · {ep.tarefas_feitas} de {ep.tarefas_total} tarefas
                {ep.pontos_total > 0 && ` · ${ep.pontos_feitos}/${ep.pontos_total} pontos`}
                {ep.prazo && ` · entrega ${rotuloPrazo(ep.prazo, hoje).toLowerCase()}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
