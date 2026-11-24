// Ícones de traço do quadro de tarefas (mesmo desenho dos ícones do menu: 24×24, traço 2, cor do texto).

import type { ReactNode } from "react";

const CAMINHOS: Record<string, ReactNode> = {
  mais: <path d="M12 5v14M5 12h14" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  mais_opcoes: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  quadro: (
    <>
      <rect x="3.5" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="16.5" y="4" width="4" height="7" rx="1.5" />
    </>
  ),
  lista: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  colunas: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  documento: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" />
    </>
  ),
  negocio: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  lixeira: <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />,
  seta: <path d="m9 6 6 6-6 6" />,
  reabrir: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5V9h4.5" />,
  texto: <path d="M5 7h14M5 12h14M5 17h9" />,
};

export type NomeIcone = keyof typeof CAMINHOS;

export default function Icone({ nome, tamanho = 16, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
    >
      {CAMINHOS[nome]}
    </svg>
  );
}

// Prioridade como barras de sinal: 1 (baixa), 2 (normal), 3 (alta, em laranja).
export function IconePrioridade({ prioridade, tamanho = 14 }: { prioridade: "baixa" | "normal" | "alta"; tamanho?: number }) {
  const nivel = prioridade === "alta" ? 3 : prioridade === "normal" ? 2 : 1;
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" aria-hidden focusable={false} className={`tar-prio-icone prio-${prioridade}`}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={11 - i * 3.5} width={3} height={3 + i * 3.5} rx={1} fill="currentColor" opacity={i < nivel ? 1 : 0.22} />
      ))}
    </svg>
  );
}

// Avatar redondo com a inicial e a cor fixa da pessoa.
export function Avatar({ nome, cor, tamanho = 22 }: { nome: string; cor: string; tamanho?: number }) {
  return (
    <span
      className="tar-avatar"
      aria-hidden
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.48), background: `color-mix(in srgb, ${cor} 18%, var(--painel))`, color: cor, borderColor: `color-mix(in srgb, ${cor} 55%, transparent)` }}
    >
      {nome.slice(0, 1).toUpperCase()}
    </span>
  );
}
