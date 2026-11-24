"use client";

// Lista de pessoas do HQ com o nome de exibição. Busca uma vez por página e avisa quem estiver usando
// (o nomeUsuario de lib/exibicao passa a mostrar o nome salvo).

import { useEffect, useState } from "react";
import { obter } from "./api";
import { definirNomes, type PessoaHQ } from "./exibicao";

let cache: PessoaHQ[] | null = null;
let pedido: Promise<PessoaHQ[]> | null = null;

export function carregarPessoas(forcar = false): Promise<PessoaHQ[]> {
  if (cache && !forcar) return Promise.resolve(cache);
  if (!pedido || forcar)
    pedido = obter<PessoaHQ[]>("/pessoas")
      .then((l) => {
        cache = l;
        definirNomes(l);
        return l;
      })
      .finally(() => {
        pedido = null;
      });
  return pedido;
}

/** Pessoas do HQ; re-renderiza quando os nomes mudam (ex.: alguém salvou o nome em Configurações). */
export function usePessoas(): PessoaHQ[] {
  const [lista, setLista] = useState<PessoaHQ[]>(cache ?? []);
  useEffect(() => {
    carregarPessoas().then(setLista).catch(() => {});
    const atualizar = () => cache && setLista([...cache]);
    window.addEventListener("orion:nomes", atualizar);
    return () => window.removeEventListener("orion:nomes", atualizar);
  }, []);
  return lista;
}
