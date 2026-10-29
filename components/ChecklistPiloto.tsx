"use client";

// Checklist do piloto de um negócio, com os dias desde que ele entrou na etapa Piloto.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { enviar, obter, atualizar, excluir } from "../lib/api";
import type { ItemPiloto } from "../lib/comercial";

export default function ChecklistPiloto({ negocioId, diasNoPiloto }: { negocioId: number; diasNoPiloto: number | null }) {
  const [itens, setItens] = useState<ItemPiloto[] | null>(null);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await obter<ItemPiloto[]>(`/comercial/negocios/${negocioId}/piloto`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o checklist.");
    }
  }, [negocioId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function alternar(item: ItemPiloto) {
    setItens((l) => l?.map((i) => (i.id === item.id ? { ...i, feito: !i.feito } : i)) ?? null);
    try {
      await atualizar(`/comercial/piloto/${item.id}`, { feito: !item.feito });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar o item.");
      await carregar();
    }
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    try {
      await enviar(`/comercial/negocios/${negocioId}/piloto`, { texto: novo.trim() });
      setNovo("");
      await carregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível adicionar.");
    }
  }

  async function remover(item: ItemPiloto) {
    try {
      await excluir(`/comercial/piloto/${item.id}`);
      await carregar();
    } catch {
      setErro("Não foi possível remover o item.");
    }
  }

  if (itens === null) return null;
  const feitos = itens.filter((i) => i.feito).length;
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;

  return (
    <section className="painel com-bloco" aria-label="Checklist do piloto">
      <h2 className="com-grupo-titulo">
        Checklist do piloto{" "}
        {diasNoPiloto !== null && (
          <span className="texto-secundario mono">
            · {diasNoPiloto === 0 ? "começou hoje" : `dia ${diasNoPiloto + 1}`}
          </span>
        )}
      </h2>
      <div className="com-piloto-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Andamento do piloto">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="texto-secundario mono" style={{ margin: "4px 0 8px" }}>
        {feitos} de {itens.length} feitos
      </p>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      <ul className="com-piloto-itens">
        {itens.map((i) => (
          <li key={i.id}>
            <label>
              <input type="checkbox" checked={i.feito} onChange={() => alternar(i)} />
              <span className={i.feito ? "feito" : undefined}>{i.texto}</span>
            </label>
            {i.feito && i.feito_por && <span className="texto-secundario com-piloto-quem">{i.feito_por}</span>}
            <button type="button" className="botao com-excluir" aria-label={`Remover ${i.texto}`} onClick={() => remover(i)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form className="com-piloto-novo" onSubmit={adicionar}>
        <input aria-label="Novo item do checklist" placeholder="Adicionar item…" value={novo} maxLength={200} onChange={(e) => setNovo(e.target.value)} />
        <button type="submit" className="botao" disabled={!novo.trim()}>
          Adicionar
        </button>
      </form>
    </section>
  );
}
