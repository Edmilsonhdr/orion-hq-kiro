"use client";

// Editor visual (WYSIWYG) do Docs, sobre Tiptap. O markdown continua sendo a fonte da verdade: o texto
// entra e sai como markdown (@tiptap/markdown), então o modo "Markdown" e o visual editam o mesmo conteúdo.
// O conteúdo só é reescrito quando o usuário edita no modo visual (nunca ao abrir).

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { paraEditor, doEditor } from "../lib/markdownVisual";

type Props = {
  valor: string;
  onChange: (markdown: string) => void;
  onSalvar?: () => void;
};

type Botao = { rotulo: string; titulo: string; ativo?: (e: Editor) => boolean; acao: (e: Editor) => void };

const BOTOES: (Botao | "|")[] = [
  { rotulo: "H1", titulo: "Título grande", ativo: (e) => e.isActive("heading", { level: 1 }), acao: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { rotulo: "H2", titulo: "Título médio", ativo: (e) => e.isActive("heading", { level: 2 }), acao: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { rotulo: "H3", titulo: "Título pequeno", ativo: (e) => e.isActive("heading", { level: 3 }), acao: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  "|",
  { rotulo: "B", titulo: "Negrito (Ctrl+B)", ativo: (e) => e.isActive("bold"), acao: (e) => e.chain().focus().toggleBold().run() },
  { rotulo: "I", titulo: "Itálico (Ctrl+I)", ativo: (e) => e.isActive("italic"), acao: (e) => e.chain().focus().toggleItalic().run() },
  { rotulo: "S", titulo: "Tachado", ativo: (e) => e.isActive("strike"), acao: (e) => e.chain().focus().toggleStrike().run() },
  { rotulo: "</>", titulo: "Código", ativo: (e) => e.isActive("code"), acao: (e) => e.chain().focus().toggleCode().run() },
  "|",
  { rotulo: "• Lista", titulo: "Lista com marcadores", ativo: (e) => e.isActive("bulletList"), acao: (e) => e.chain().focus().toggleBulletList().run() },
  { rotulo: "1. Lista", titulo: "Lista numerada", ativo: (e) => e.isActive("orderedList"), acao: (e) => e.chain().focus().toggleOrderedList().run() },
  { rotulo: "☑ Tarefas", titulo: "Lista de tarefas", ativo: (e) => e.isActive("taskList"), acao: (e) => e.chain().focus().toggleTaskList().run() },
  "|",
  { rotulo: "❝", titulo: "Citação", ativo: (e) => e.isActive("blockquote"), acao: (e) => e.chain().focus().toggleBlockquote().run() },
  { rotulo: "{ }", titulo: "Bloco de código", ativo: (e) => e.isActive("codeBlock"), acao: (e) => e.chain().focus().toggleCodeBlock().run() },
  { rotulo: "―", titulo: "Linha horizontal", acao: (e) => e.chain().focus().setHorizontalRule().run() },
  { rotulo: "Tabela", titulo: "Inserir tabela 3×3", acao: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  "|",
  {
    rotulo: "Link",
    titulo: "Inserir ou remover link",
    ativo: (e) => e.isActive("link"),
    acao: (e) => {
      if (e.isActive("link")) {
        e.chain().focus().unsetLink().run();
        return;
      }
      const url = window.prompt("Endereço do link (https://…):");
      if (url && /^(https?:\/\/|mailto:|\/)/i.test(url.trim())) e.chain().focus().setLink({ href: url.trim() }).run();
    },
  },
  { rotulo: "[[Página]]", titulo: "Link para outra página do Docs", acao: (e) => {
    const t = window.prompt("Título da página do Docs:");
    if (t && t.trim()) e.chain().focus().insertContent(`[[${t.trim()}]]`).run();
  } },
  "|",
  { rotulo: "↶", titulo: "Desfazer (Ctrl+Z)", acao: (e) => e.chain().focus().undo().run() },
  { rotulo: "↷", titulo: "Refazer (Ctrl+Shift+Z)", acao: (e) => e.chain().focus().redo().run() },
];

const TABELA_BOTOES: Botao[] = [
  { rotulo: "+ Linha", titulo: "Adicionar linha abaixo", acao: (e) => e.chain().focus().addRowAfter().run() },
  { rotulo: "+ Coluna", titulo: "Adicionar coluna à direita", acao: (e) => e.chain().focus().addColumnAfter().run() },
  { rotulo: "− Linha", titulo: "Remover linha", acao: (e) => e.chain().focus().deleteRow().run() },
  { rotulo: "− Coluna", titulo: "Remover coluna", acao: (e) => e.chain().focus().deleteColumn().run() },
  { rotulo: "Apagar tabela", titulo: "Apagar a tabela", acao: (e) => e.chain().focus().deleteTable().run() },
];

export default function EditorVisual({ valor, onChange, onSalvar }: Props) {
  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;
  const aoSalvar = useRef(onSalvar);
  aoSalvar.current = onSalvar;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ["mailto"] } }),
      Markdown,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: paraEditor(valor),
    contentType: "markdown",
    editorProps: {
      attributes: { class: "doc-visual-conteudo", "aria-label": "Editor visual do documento", role: "textbox", "aria-multiline": "true" },
      handleKeyDown: (_vista, evento) => {
        if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "s") {
          evento.preventDefault();
          aoSalvar.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => aoMudar.current(doEditor(e.getMarkdown())),
  });

  // Atualiza a barra (botões ativos) a cada mudança de seleção.
  useEffect(() => {
    if (!editor) return;
    const forcar = () => editor.view.dom.dispatchEvent(new Event("orion:barra"));
    editor.on("selectionUpdate", forcar);
    return () => {
      editor.off("selectionUpdate", forcar);
    };
  }, [editor]);

  if (!editor) return <div className="doc-visual doc-visual-carregando" aria-busy="true" />;

  return (
    <div className="doc-visual">
      <div className="doc-visual-barra" role="toolbar" aria-label="Formatação">
        {BOTOES.map((b, i) =>
          b === "|" ? (
            <span key={i} className="doc-visual-sep" aria-hidden="true" />
          ) : (
            <button
              key={b.rotulo}
              type="button"
              className={b.ativo?.(editor) ? "ativo" : undefined}
              aria-pressed={b.ativo ? b.ativo(editor) : undefined}
              title={b.titulo}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => b.acao(editor)}
            >
              {b.rotulo}
            </button>
          )
        )}
      </div>
      {editor.isActive("table") && (
        <div className="doc-visual-barra doc-visual-tabela" role="toolbar" aria-label="Tabela">
          {TABELA_BOTOES.map((b) => (
            <button key={b.rotulo} type="button" title={b.titulo} onMouseDown={(e) => e.preventDefault()} onClick={() => b.acao(editor)}>
              {b.rotulo}
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
