"use client";

import { useEffect, useState } from "react";
import { inicioDoDia } from "./rotina";

// Relógio do escritório (tick de 1 s). Em desenvolvimento, `?relogio=HH:MM`
// simula a hora de São Paulo: o relógio anda a partir dela e o deslocamento
// deve ser aplicado também às datas das atividades (deslocarDatas), para que
// o que acabou de acontecer continue "agora" na hora simulada.
export function useRelogio(): { agora: number | null; deslocamentoMs: number } {
  const [deslocamentoMs, setDeslocamentoMs] = useState(0);
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    let desloc = 0;
    if (process.env.NODE_ENV !== "production") {
      const alvo = new URLSearchParams(window.location.search).get("relogio");
      const m = alvo?.match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        const agoraReal = Date.now();
        const simulado = inicioDoDia(agoraReal) + (Number(m[1]) * 60 + Number(m[2])) * 60_000;
        desloc = simulado - agoraReal;
      }
    }
    setDeslocamentoMs(desloc);
    setAgora(Date.now() + desloc);
    const timer = setInterval(() => setAgora(Date.now() + desloc), 1000);
    return () => clearInterval(timer);
  }, []);

  return { agora, deslocamentoMs };
}

export function deslocarDatas<T extends { criado_em: string }>(itens: T[], deslocamentoMs: number): T[] {
  if (!deslocamentoMs) return itens;
  return itens.map((item) => {
    const t = Date.parse(item.criado_em);
    return Number.isNaN(t) ? item : { ...item, criado_em: new Date(t + deslocamentoMs).toISOString() };
  });
}
