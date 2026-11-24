"use client";

// Texto com imagens no meio, como no Jira: a imagem colada (Ctrl+V) ou arrastada para o campo vira anexo da
// tarefa e entra no texto como ![nome](/api/anexos/ID), no lugar do cursor. Ao mostrar, essas marcas viram a imagem.

import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type TextareaHTMLAttributes } from "react";
import { corPessoa } from "../lib/tarefas";
import { nomeUsuario } from "../lib/exibicao";
import { enviarArquivo } from "./Anexos";
import { Avatar } from "./IconesTarefa";

// ![nome](/api/anexos/12) ou, com largura escolhida, ![nome|480](/api/anexos/12)
const MARCA = /!\[([^\]|]*)(?:\|(\d+))?\]\((\/api\/anexos\/(\d+))\)/g;
const MAX = 8 * 1024 * 1024;
const LARGURA_MIN = 80;

/** Texto sem as marcas de imagem (para prévias de uma linha, como no cartão). */
export const semImagens = (texto: string) => texto.replace(MARCA, "").replace(/\n{2,}/g, "\n").trim();

/** Troca a largura da n-ésima imagem do texto (null volta ao tamanho natural). */
export function mudarLargura(texto: string, n: number, largura: number | null): string {
  let i = -1;
  return texto.replace(MARCA, (tudo, alt: string, _l, src: string) => {
    i += 1;
    if (i !== n) return tudo;
    return `![${alt}${largura ? `|${Math.round(largura)}` : ""}](${src})`;
  });
}

/** IDs dos anexos de imagem citados no texto, na ordem. */
export const imagensDoTexto = (texto: string) => [...texto.matchAll(MARCA)].map((m) => Number(m[4]));

type Parte = string | { alt: string; src: string; id: number; largura: number | null; n: number };

/** Imagem no texto: clicar amplia; puxar o canto direito muda a largura (salva ao soltar). */
function ImagemNoTexto({ p, onAmpliar, onLargura }: { p: Exclude<Parte, string>; onAmpliar?: (id: number) => void; onLargura?: (n: number, largura: number | null) => void }) {
  const caixa = useRef<HTMLSpanElement>(null);
  const [largura, setLargura] = useState<number | null>(p.largura);
  const arrasto = useRef<{ x: number; inicio: number; max: number } | null>(null);
  const mexeu = useRef(false);
  const atual = arrasto.current ? largura : p.largura;

  function comecar(e: React.PointerEvent) {
    if (!onLargura || !caixa.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const max = caixa.current.parentElement?.clientWidth ?? 2000;
    arrasto.current = { x: e.clientX, inicio: caixa.current.getBoundingClientRect().width, max };
    mexeu.current = false;
    setLargura(arrasto.current.inicio);
  }
  function mover(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a) return;
    mexeu.current = true;
    setLargura(Math.max(LARGURA_MIN, Math.min(a.max, a.inicio + e.clientX - a.x)));
  }
  function soltar(e: React.PointerEvent) {
    if (!arrasto.current) return;
    e.stopPropagation();
    arrasto.current = null;
    if (mexeu.current && largura) onLargura?.(p.n, largura);
    else setLargura(p.largura);
  }

  return (
    <span ref={caixa} className={`txr-imagem${arrasto.current ? " redimensionando" : ""}`} style={atual ? { width: atual } : undefined}>
      <button type="button" className="txr-imagem-abrir" onClick={(e) => (e.stopPropagation(), onAmpliar ? onAmpliar(p.id) : window.open(p.src, "_blank"))} title="Ampliar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt={p.alt} loading="lazy" draggable={false} />
      </button>
      {onLargura && (
        <>
          <span
            className="txr-alca"
            role="separator"
            aria-label="Puxe para mudar o tamanho da imagem"
            title="Puxe para mudar o tamanho (duplo clique volta ao original)"
            onPointerDown={comecar}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onLargura(p.n, null);
            }}
          />
          {arrasto.current && largura && <span className="txr-medida">{Math.round(largura)} px</span>}
        </>
      )}
    </span>
  );
}

/** Mostra o texto quebrando linhas e trocando as marcas de imagem pela imagem. */
export function TextoRico({ texto, onAmpliar, onMudar }: { texto: string; onAmpliar?: (id: number) => void; onMudar?: (novo: string) => void }) {
  const partes: Parte[] = [];
  let ultimo = 0;
  let n = 0;
  for (const m of texto.matchAll(MARCA)) {
    if (m.index! > ultimo) partes.push(texto.slice(ultimo, m.index));
    partes.push({ alt: m[1], largura: m[2] ? Number(m[2]) : null, src: m[3], id: Number(m[4]), n: n++ });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return (
    <>
      {partes.map((p, i) =>
        typeof p === "string" ? (
          <span key={i} className="txr-texto">
            {p.split(/((?<![A-Za-z0-9_])@[A-Za-z][A-Za-z0-9_]{1,30})/).map((pedaco, j) =>
              j % 2 === 1 ? (
                <span key={j} className="txr-mencao" title={pedaco}>
                  <Avatar nome={pedaco.slice(1)} cor={corPessoa(pedaco.slice(1).toLowerCase())} tamanho={18} />
                  {nomeUsuario(pedaco.slice(1))}
                </span>
              ) : (
                pedaco
              ),
            )}
          </span>
        ) : (
          <ImagemNoTexto key={`${i}-${p.largura}`} p={p} onAmpliar={onAmpliar} onLargura={onMudar ? (k, l) => onMudar(mudarLargura(texto, k, l)) : undefined} />
        ),
      )}
    </>
  );
}

type CampoProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValor: (v: string) => void;
  entidade: "tarefa" | "documento" | "negocio";
  entidadeId: number;
  /** Avisado depois de cada imagem enviada (para a lista de anexos recarregar). */
  onAnexou?: () => void;
  /** Pessoas que dá para marcar com @ (abre a lista ao digitar @). */
  pessoas?: string[];
};

const nomeBonito = (u: string) => (u ? u[0].toUpperCase() + u.slice(1) : u);

/** Textarea que aceita imagem colada ou arrastada: envia como anexo e insere a marca no cursor. */
export function CampoComImagens({ value, onValor, entidade, entidadeId, onAnexou, pessoas = [], className, onKeyDown, ...resto }: CampoProps) {
  const [mencao, setMencao] = useState<{ inicio: number; termo: string } | null>(null);
  // Posição do cursor para aplicar logo depois que o novo texto for desenhado (antes da próxima tecla).
  const cursorPendente = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && cursorPendente.current !== null) {
      el.focus();
      el.setSelectionRange(cursorPendente.current, cursorPendente.current);
      cursorPendente.current = null;
    }
  }, [value]);
  const [ativa, setAtiva] = useState(0);
  const candidatas = mencao ? pessoas.filter((p) => p.toLowerCase().startsWith(mencao.termo.toLowerCase())).slice(0, 6) : [];

  function verMencao(el: HTMLTextAreaElement) {
    const antes = el.value.slice(0, el.selectionStart);
    const m = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{0,30})$/.exec(antes);
    if (m && pessoas.length) {
      setMencao({ inicio: antes.length - m[2].length - 1, termo: m[2] });
      setAtiva(0);
    } else setMencao(null);
  }

  function marcar(pessoa: string) {
    const el = ref.current;
    if (!el || !mencao) return;
    const fim = el.selectionStart;
    const novo = `${value.slice(0, mencao.inicio)}@${pessoa} ${value.slice(fim)}`;
    cursorPendente.current = mencao.inicio + pessoa.length + 2;
    onValor(novo);
    setMencao(null);
  }
  const ref = useRef<HTMLTextAreaElement>(null);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const valorRef = useRef(value);
  valorRef.current = value;

  async function inserir(arquivos: File[]) {
    const imagens = arquivos.filter((f) => f.type.startsWith("image/"));
    if (imagens.length === 0) return false;
    const el = ref.current;
    let pos = el ? el.selectionStart : valorRef.current.length;
    setErro(null);
    setEnviando((n) => n + imagens.length);
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    for (const [i, f] of imagens.entries()) {
      try {
        if (f.size > MAX) throw new Error(`“${f.name}” passa de 8 MB.`);
        const nome = f.name && f.name !== "image.png" ? f.name : `print-${carimbo}${i ? `-${i + 1}` : ""}.${f.type.split("/")[1] || "png"}`;
        const anexo = await enviarArquivo(entidade, entidadeId, new File([f], nome, { type: f.type }));
        const atual = valorRef.current;
        const antes = atual.slice(0, pos);
        const marca = `${antes && !antes.endsWith("\n") ? "\n" : ""}![${nome}](/api/anexos/${anexo.id})\n`;
        const novo = antes + marca + atual.slice(pos);
        pos += marca.length;
        valorRef.current = novo;
        onValor(novo);
        onAnexou?.();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    requestAnimationFrame(() => el?.setSelectionRange(pos, pos));
    return true;
  }

  function aoColar(e: ClipboardEvent<HTMLTextAreaElement>) {
    const arquivos = [...e.clipboardData.files];
    if (!arquivos.some((f) => f.type.startsWith("image/"))) return;
    e.preventDefault();
    inserir(arquivos);
  }

  function aoSoltar(e: DragEvent<HTMLTextAreaElement>) {
    const arquivos = [...e.dataTransfer.files];
    if (!arquivos.some((f) => f.type.startsWith("image/"))) return;
    e.preventDefault();
    e.stopPropagation();
    inserir(arquivos);
  }

  return (
    <div className="txr-campo">
      <textarea
        ref={ref}
        className={className}
        value={value}
        onChange={(e) => {
          onValor(e.target.value);
          verMencao(e.target);
        }}
        onClick={(e) => verMencao(e.currentTarget)}
        onBlur={() => setTimeout(() => setMencao(null), 120)}
        onPaste={aoColar}
        onDrop={aoSoltar}
        onKeyDown={(e) => {
          if (candidatas.length > 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setAtiva((i) => (i + (e.key === "ArrowDown" ? 1 : candidatas.length - 1)) % candidatas.length);
              return;
            }
            if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
              e.preventDefault();
              marcar(candidatas[ativa] ?? candidatas[0]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setMencao(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        {...resto}
      />
      {candidatas.length > 0 && (
        <ul className="txr-pessoas" role="listbox" aria-label="Marcar pessoa">
          {candidatas.map((p, i) => (
            <li
              key={p}
              role="option"
              aria-selected={i === ativa}
              className={i === ativa ? "ativa" : ""}
              onMouseEnter={() => setAtiva(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                marcar(p);
              }}
            >
              <span className="txr-pessoa-avatar" aria-hidden>
                {p[0]?.toUpperCase()}
              </span>
              <span>{nomeBonito(p)}</span>
              <small>@{p}</small>
            </li>
          ))}
        </ul>
      )}
      {(enviando > 0 || erro) && (
        <span className={`txr-aviso${erro ? " erro" : ""}`} role={erro ? "alert" : "status"}>
          {erro ?? `Enviando imagem${enviando > 1 ? "ns" : ""}…`}
        </span>
      )}
    </div>
  );
}
