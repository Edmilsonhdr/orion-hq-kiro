"use client";

// Janela de diálogo sobre o <dialog> nativo: foco preso, Esc fecha e o fundo bloqueia a página.

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
  children: ReactNode;
};

export default function Modal({ titulo, aberto, onFechar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-titulo"
      onClose={onFechar}
      onClick={(e) => {
        // Clique no fundo (fora do conteúdo) fecha.
        if (e.target === ref.current) onFechar();
      }}
    >
      {aberto && (
        <div className="modal-conteudo">
          <div className="modal-topo">
            <h2 id="modal-titulo" className="modal-titulo">
              {titulo}
            </h2>
            <button type="button" className="botao" onClick={onFechar} aria-label="Fechar">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
