"use client";

// "Citado em": as páginas que apontam para este documento com [[Título]].

import { useEffect, useState } from "react";
import Link from "next/link";
import { obter } from "../lib/api";

type Citacao = { id: number; titulo: string; pasta: string | null };

export default function CitadoEm({ documentoId }: { documentoId: number }) {
  const [lista, setLista] = useState<Citacao[]>([]);

  useEffect(() => {
    let ativo = true;
    obter<Citacao[]>(`/documentos/${documentoId}/citacoes`)
      .then((l) => ativo && setLista(Array.isArray(l) ? l : []))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [documentoId]);

  if (lista.length === 0) return null;
  return (
    <section className="painel com-bloco" aria-label="Citado em">
      <h2 className="com-grupo-titulo">Citado em</h2>
      <ul className="uso-execucoes">
        {lista.map((c) => (
          <li key={c.id}>
            <Link href={`/docs/${c.id}`}>{c.titulo}</Link>
            {c.pasta && <span className="texto-secundario">{c.pasta}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
