"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { obter } from "./api";

// Polling incremental (Requirement 2.3, ~1,5 s).
// Guarda a lista acumulada e o maior id visto; a cada intervalo chama
// `path?desde=<maior>` e concatena apenas os itens novos.
// Pausa enquanto a aba está oculta (document.visibilityState).

export function usePoll<T extends { id: number }>(
  caminho: string,
  intervaloMs: number
) {
  const [itens, setItens] = useState<T[]>([]);
  const desdeRef = useRef(0);
  const buscandoRef = useRef(false);

  const buscar = useCallback(async () => {
    if (buscandoRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    buscandoRef.current = true;
    try {
      const separador = caminho.includes("?") ? "&" : "?";
      const novos = await obter<T[]>(
        `${caminho}${separador}desde=${desdeRef.current}`
      );
      if (Array.isArray(novos) && novos.length > 0) {
        const maior = novos.reduce(
          (max, item) => (item.id > max ? item.id : max),
          desdeRef.current
        );
        desdeRef.current = maior;
        setItens((atuais) => [...atuais, ...novos]);
      }
    } catch {
      // erros de rede ou 401 (tratado no wrapper) não devem quebrar o loop
    } finally {
      buscandoRef.current = false;
    }
  }, [caminho]);

  useEffect(() => {
    // reinicia o estado quando o caminho muda
    desdeRef.current = 0;
    setItens([]);

    buscar();
    const timer = setInterval(buscar, intervaloMs);

    const aoMudarVisibilidade = () => {
      if (!document.hidden) buscar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [buscar, intervaloMs]);

  return itens;
}
