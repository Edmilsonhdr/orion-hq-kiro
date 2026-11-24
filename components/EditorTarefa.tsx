"use client";

// Editor visual da descrição e dos comentários da tarefa, como no Jira: a imagem colada (Ctrl+V) ou arrastada
// aparece na hora, dentro do texto, e muda de tamanho puxando o canto; @ abre a lista de pessoas e a menção vira
// um chip com o nome. O texto entra e sai no formato salvo (lib/textoTarefa), então nada muda no back.

import { useEffect, useMemo, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { nomeUsuario, type PessoaHQ } from "../lib/exibicao";
import { docParaTexto, textoParaDoc, type NoEditor } from "../lib/textoTarefa";
import { enviarArquivo } from "./Anexos";

const MAX = 8 * 1024 * 1024;
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// --- imagem com alça de tamanho ---

function ImagemView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState<number | null>(null);
  const arrasto = useRef<{ x: number; inicio: number; max: number } | null>(null);
  const atual = largura ?? (node.attrs.largura as number | null);

  function comecar(e: React.PointerEvent) {
    if (!caixa.current || !editor.isEditable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const max = caixa.current.parentElement?.clientWidth ?? 2000;
    arrasto.current = { x: e.clientX, inicio: caixa.current.getBoundingClientRect().width, max };
    setLargura(arrasto.current.inicio);
  }
  function mover(e: React.PointerEvent) {
    const a = arrasto.current;
    if (a) setLargura(Math.max(80, Math.min(a.max, a.inicio + e.clientX - a.x)));
  }
  function soltar() {
    if (!arrasto.current) return;
    arrasto.current = null;
    if (largura) updateAttributes({ largura: Math.round(largura) });
    setLargura(null);
  }

  return (
    <NodeViewWrapper className="edt-imagem-linha" data-drag-handle>
      <div ref={caixa} className={`txr-imagem edt-imagem${selected ? " selecionada" : ""}${arrasto.current ? " redimensionando" : ""}`} style={atual ? { width: atual } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={node.attrs.src as string} alt={node.attrs.alt as string} draggable={false} />
        <span
          className="txr-alca"
          role="separator"
          aria-label="Puxe para mudar o tamanho da imagem"
          title="Puxe para mudar o tamanho (duplo clique volta ao original)"
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onDoubleClick={() => updateAttributes({ largura: null })}
        />
        {arrasto.current && largura && <span className="txr-medida">{Math.round(largura)} px</span>}
      </div>
    </NodeViewWrapper>
  );
}

const Imagem = Node.create({
  name: "imagem",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: "imagem" }, largura: { default: null } };
  },
  parseHTML() {
    return [{ tag: "img[src^='/api/anexos/']", getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("src"), alt: (el as HTMLElement).getAttribute("alt") }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImagemView);
  },
});

// --- menção como chip ---

const Mencao = Node.create({
  name: "mencao",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-mencao]", getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-mencao") }) }];
  },
  renderHTML({ node }) {
    const nome = nomeUsuario(node.attrs.id as string);
    return ["span", { class: "txr-mencao", "data-mencao": node.attrs.id, contenteditable: "false" }, ["span", { class: "edt-mencao-ini" }, nome[0] ?? "?"], nome];
  },
  renderText({ node }) {
    return `@${node.attrs.id}`;
  },
});

type Props = {
  value: string;
  onValor: (texto: string) => void;
  entidade: "tarefa" | "documento" | "negocio";
  entidadeId: number;
  pessoas: PessoaHQ[];
  onAnexou?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Ctrl/⌘ + Enter */
  onEnviar?: () => void;
  onEsc?: () => void;
  rotulo: string;
  compacto?: boolean;
  onFoco?: () => void;
};

export default function EditorTarefa({ value, onValor, entidade, entidadeId, pessoas, onAnexou, placeholder, autoFocus, onEnviar, onEsc, rotulo, compacto, onFoco }: Props) {
  const ultimo = useRef(value);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<{ de: number; ate: number; termo: string; x: number; y: number } | null>(null);
  const [ativa, setAtiva] = useState(0);
  const refs = useRef({ onValor, onEnviar, onEsc, onAnexou, entidade, entidadeId });
  refs.current = { onValor, onEnviar, onEsc, onAnexou, entidade, entidadeId };

  const candidatas = useMemo(() => {
    if (!sugestao) return [];
    const q = normalizar(sugestao.termo);
    return pessoas.filter((p) => normalizar(p.nome).split(" ").some((parte) => parte.startsWith(q)) || p.usuario.startsWith(q)).slice(0, 6);
  }, [sugestao, pessoas]);
  const estado = useRef({ candidatas, ativa, sugestao });
  estado.current = { candidatas, ativa, sugestao };

  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  async function enviarImagens(arquivos: File[], pos?: number) {
    const imagens = arquivos.filter((f) => f.type.startsWith("image/"));
    if (!imagens.length) return false;
    setErro(null);
    setEnviando((n) => n + imagens.length);
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    for (const [i, f] of imagens.entries()) {
      try {
        if (f.size > MAX) throw new Error(`“${f.name}” passa de 8 MB.`);
        const nome = f.name && f.name !== "image.png" ? f.name : `print-${carimbo}${i ? `-${i + 1}` : ""}.${f.type.split("/")[1] || "png"}`;
        const anexo = await enviarArquivo(refs.current.entidade, refs.current.entidadeId, new File([f], nome, { type: f.type }));
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed) continue;
        const { state, view } = ed;
        const no = state.schema.nodes.imagem.create({ src: `/api/anexos/${anexo.id}`, alt: nome, largura: null });
        const tr = pos !== undefined && i === 0 ? state.tr.insert(Math.min(pos, state.doc.content.size), no) : state.tr.replaceSelectionWith(no);
        // Cursor vai para a linha de baixo da imagem (senão a próxima tecla substitui a imagem selecionada).
        let depois = tr.selection instanceof NodeSelection ? tr.selection.to : tr.selection.from;
        const seguinte = tr.doc.nodeAt(depois);
        if (!seguinte || !seguinte.isTextblock) {
          tr.insert(depois, state.schema.nodes.paragraph.create());
        }
        depois = Math.min(depois + 1, tr.doc.content.size);
        tr.setSelection(TextSelection.near(tr.doc.resolve(depois)));
        view.dispatch(tr.scrollIntoView());
        view.focus();
        refs.current.onAnexou?.();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    return true;
  }

  function marcar(p: PessoaHQ) {
    const editor = editorRef.current;
    const s = estado.current.sugestao;
    if (!editor || !s) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: s.de, to: s.ate }, [{ type: "mencao", attrs: { id: p.usuario } }, { type: "text", text: " " }])
      .run();
    setSugestao(null);
  }

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: false, bold: false, italic: false, strike: false, code: false, codeBlock: false, blockquote: false,
        bulletList: false, orderedList: false, listItem: false, horizontalRule: false, link: false, underline: false,
      }),
      Imagem,
      Mencao,
    ],
    content: textoParaDoc(value) as never,
    editorProps: {
      attributes: { class: "edt-area", "aria-label": rotulo, role: "textbox", "aria-multiline": "true" },
      handlePaste: (_view, event) => {
        const arquivos = [...(event.clipboardData?.files ?? [])];
        if (!arquivos.some((f) => f.type.startsWith("image/"))) return false;
        event.preventDefault();
        enviarImagens(arquivos);
        return true;
      },
      handleDrop: (view, event, _slice, movido) => {
        if (movido) return false;
        const arquivos = [...(event.dataTransfer?.files ?? [])];
        if (!arquivos.some((f) => f.type.startsWith("image/"))) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        enviarImagens(arquivos, pos);
        return true;
      },
      handleKeyDown: (_view, event) => {
        const { candidatas: c, ativa: a, sugestao: s } = estado.current;
        if (s && c.length) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            setAtiva((i) => (i + (event.key === "ArrowDown" ? 1 : c.length - 1)) % c.length);
            return true;
          }
          if ((event.key === "Enter" && !event.ctrlKey && !event.metaKey) || event.key === "Tab") {
            marcar(c[a] ?? c[0]);
            return true;
          }
        }
        if (event.key === "Escape") {
          if (s) {
            setSugestao(null);
            return true;
          }
          if (refs.current.onEsc) {
            event.stopPropagation();
            refs.current.onEsc();
            return true;
          }
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && refs.current.onEnviar) {
          refs.current.onEnviar();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      const texto = docParaTexto(e.getJSON() as NoEditor);
      ultimo.current = texto;
      refs.current.onValor(texto);
    },
    onFocus: () => onFoco?.(),
    onBlur: () => setTimeout(() => setSugestao(null), 150),
    onSelectionUpdate: ({ editor: e }) => verSugestao(e),
    onTransaction: ({ editor: e }) => verSugestao(e),
  });

  function verSugestao(e: NonNullable<typeof editor>) {
    const { $from, empty } = e.state.selection;
    if (!empty) return setSugestao(null);
    const antes = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const m = /(?:^|[\s(])@([\p{L}\w]{0,30})$/u.exec(antes);
    if (!m) return setSugestao((s) => (s ? null : s));
    const de = $from.pos - m[1].length - 1;
    const c = e.view.coordsAtPos(de);
    setSugestao((s) => {
      if (s && s.de === de && s.termo === m[1]) return s;
      setAtiva(0);
      return { de, ate: $from.pos, termo: m[1], x: c.left, y: c.bottom };
    });
  }

  editorRef.current = editor;

  // Valor trocado por fora (ex.: comentário enviado limpa o campo): recarrega o editor.
  useEffect(() => {
    if (!editor || value === ultimo.current) return;
    ultimo.current = value;
    editor.commands.setContent(textoParaDoc(value) as never, { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className={`edt${compacto ? " compacto" : ""}`}>
      <EditorContent editor={editor} />
      {editor && editor.isEmpty && placeholder && <span className="edt-dica-vazio">{placeholder}</span>}
      {(enviando > 0 || erro) && (
        <span className={`txr-aviso${erro ? " erro" : ""}`} role={erro ? "alert" : "status"}>
          {erro ?? `Enviando imagem${enviando > 1 ? "ns" : ""}…`}
        </span>
      )}
      {sugestao && candidatas.length > 0 && (
        <ul className="txr-pessoas edt-pessoas" role="listbox" aria-label="Marcar pessoa" style={{ left: sugestao.x, top: sugestao.y + 6 }}>
          {candidatas.map((p, i) => (
            <li
              key={p.usuario}
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
                {p.nome[0]?.toUpperCase()}
              </span>
              <span>{p.nome}</span>
              <small>@{p.usuario}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
