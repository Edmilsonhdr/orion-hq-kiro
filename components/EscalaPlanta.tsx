"use client";

// Encolhe a planta do escritório (872×688) para caber na largura disponível, sem rolagem horizontal da
// página no celular. Em telas largas fica no tamanho original (escala 1, nunca amplia).

import { useEffect, useRef, useState, type ReactNode } from "react";

const LARGURA = 872;
const ALTURA = 688;

export default function EscalaPlanta({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, Math.max(0.3, el.clientWidth / LARGURA)));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", maxWidth: LARGURA, minWidth: 0, flex: "0 1 auto" }}>
      <div style={{ width: LARGURA * escala, height: ALTURA * escala, margin: "0 auto" }}>
        <div style={{ width: LARGURA, height: ALTURA, transform: `scale(${escala})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
