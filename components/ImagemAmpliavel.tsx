"use client";

// Imagem do documento que abre em tela cheia, por cima da página, com zoom.
// Sobre o <dialog> nativo (como o Modal): Esc fecha e clicar no fundo fecha.
// Zoom: botões − / + / Ajustar, teclas + − 0, Ctrl + roda do mouse e duplo clique (alterna 100% e 200%).

import { useCallback, useEffect, useRef, useState } from "react";

const MIN = 1;
const MAX = 5;
const PASSO = 0.5;

function limitar(z: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));
}

export default function ImagemAmpliavel({ src, alt, legenda }: { src: string; alt: string; legenda?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [aberto, setAberto] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Largura da imagem ajustada à tela (zoom 1); o zoom multiplica esse valor.
  const [larguraBase, setLarguraBase] = useState<number | null>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  const fechar = useCallback(() => {
    setAberto(false);
    setZoom(1);
    setLarguraBase(null);
  }, []);

  const medir = useCallback(() => {
    if (zoom === 1 && imgRef.current) setLarguraBase(imgRef.current.clientWidth);
  }, [zoom]);

  const mudarZoom = useCallback(
    (novo: number) => {
      if (larguraBase === null && imgRef.current) setLarguraBase(imgRef.current.clientWidth);
      setZoom(limitar(novo));
    },
    [larguraBase],
  );

  // Ctrl + roda do mouse dá zoom na imagem (e não na página). Sem Ctrl, a roda só rola a imagem ampliada.
  // Listener nativo porque o onWheel do React é passivo e não deixa cancelar o zoom do navegador.
  const areaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = areaRef.current;
    if (!aberto || !area) return;
    const rodar = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      mudarZoom(zoom + (e.deltaY < 0 ? PASSO : -PASSO));
    };
    area.addEventListener("wheel", rodar, { passive: false });
    return () => area.removeEventListener("wheel", rodar);
  }, [aberto, zoom, mudarZoom]);

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "+" || e.key === "=") mudarZoom(zoom + PASSO);
    else if (e.key === "-") mudarZoom(zoom - PASSO);
    else if (e.key === "0") mudarZoom(1);
  }

  const ampliada = zoom > 1 && larguraBase !== null;

  return (
    <>
      <button type="button" className="doc-figura-botao" onClick={() => setAberto(true)} aria-label={`Ampliar imagem: ${alt}`}>
        <img src={src} alt={alt} loading="lazy" />
      </button>
      <dialog
        ref={ref}
        className="visor-imagem"
        aria-label={legenda || alt}
        onClose={fechar}
        onKeyDown={teclas}
        onClick={(e) => {
          // Clique no fundo (fora da imagem e da barra) fecha.
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("visor-imagem-area")) fechar();
        }}
      >
        {aberto && (
          <div className="visor-imagem-conteudo">
            <div className="visor-imagem-barra">
              <span className="visor-imagem-legenda">{legenda || alt}</span>
              <div className="visor-imagem-acoes">
                <button type="button" className="botao" onClick={() => mudarZoom(zoom - PASSO)} disabled={zoom <= MIN} aria-label="Diminuir zoom">
                  −
                </button>
                <span className="mono visor-imagem-zoom" aria-live="polite">
                  {Math.round(zoom * 100)}%
                </span>
                <button type="button" className="botao" onClick={() => mudarZoom(zoom + PASSO)} disabled={zoom >= MAX} aria-label="Aumentar zoom">
                  +
                </button>
                <button type="button" className="botao" onClick={() => mudarZoom(1)} disabled={zoom === 1}>
                  Ajustar
                </button>
                <a className="botao" href={src} target="_blank" rel="noopener noreferrer">
                  Abrir original
                </a>
                <button type="button" className="botao" onClick={fechar} aria-label="Fechar">
                  ✕
                </button>
              </div>
            </div>
            <div ref={areaRef} className="visor-imagem-area" data-ampliada={ampliada}>
              <img
                ref={imgRef}
                src={src}
                alt={alt}
                onLoad={medir}
                onDoubleClick={() => mudarZoom(zoom > 1 ? 1 : 2)}
                style={ampliada ? { width: larguraBase * zoom, maxWidth: "none", maxHeight: "none" } : undefined}
              />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
