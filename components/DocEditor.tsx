"use client";

// Editor de documento (spec docs, 5.3/5.6): título, pasta, tags e markdown com barra de formatação,
// pré-visualização ao vivo (lado a lado em telas largas, em abas nas estreitas), Ctrl/Cmd+S, aviso ao
// sair com alterações e rascunho local (localStorage) para não perder texto.
//
// O texto fica em estado local e só some quando o salvamento der certo: erro de API mostra a mensagem
// sem perder o que foi digitado.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Markdown from "./Markdown";
import { BLOCOS, detectarBarra, filtrarBlocos, inserirBloco, type Barra, type Bloco } from "../lib/blocos";
import { obter } from "../lib/api";
import { CONTEUDO_MAX, contarPalavras, tagsDoTexto, type DadosDocumento, type NoArvore, type OpcaoPai } from "../lib/docs";
import { aplicarLink, detectarLink, filtrarTitulos, type LinkAberto } from "../lib/linkPagina";

// O editor visual (Tiptap) só carrega no navegador e só quando é usado.
const EditorVisual = dynamic(() => import("./EditorVisual"), {
  ssr: false,
  loading: () => <div className="doc-visual doc-visual-carregando" aria-busy="true" />,
});

const CHAVE_FORMATO = "hq:editor-formato";

type Props = {
  inicial: DadosDocumento;
  pastasSugeridas: string[];
  opcoesPai: OpcaoPai[];
  rotuloSalvar?: string;
  // Identifica o rascunho local: o id do documento, ou "novo".
  chaveRascunho: string;
  onSalvar: (dados: DadosDocumento) => Promise<void>;
  onCancelar: () => void;
};

type Rascunho = DadosDocumento & { em: number };

const ATRASO_RASCUNHO_MS = 800;

function lerRascunho(chave: string): Rascunho | null {
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as Rascunho) : null;
  } catch {
    return null;
  }
}

function gravarRascunho(chave: string, dados: Rascunho | null) {
  try {
    if (dados) window.localStorage.setItem(chave, JSON.stringify(dados));
    else window.localStorage.removeItem(chave);
  } catch {
    // armazenamento indisponível (modo privado, cota): o rascunho é só uma conveniência
  }
}

export default function DocEditor({
  inicial,
  pastasSugeridas,
  opcoesPai,
  rotuloSalvar = "Salvar",
  chaveRascunho,
  onSalvar,
  onCancelar,
}: Props) {
  const chave = `docs:rascunho:${chaveRascunho}`;
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [conteudo, setConteudo] = useState(inicial.conteudo);
  const [pasta, setPasta] = useState(inicial.pasta ?? "");
  const [pai, setPai] = useState(inicial.pai_id === null ? "" : String(inicial.pai_id));
  const [tags, setTags] = useState(inicial.tags.join(", "));
  const [modo, setModo] = useState<"escrever" | "previa">("escrever");
  // Visual (WYSIWYG) é o padrão; "markdown" mostra o texto cru com barra e pré-visualização.
  const [formato, setFormato] = useState<"visual" | "markdown">("visual");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [barra, setBarra] = useState<Barra | null>(null);
  const [indiceBarra, setIndiceBarra] = useState(0);

  const atual: DadosDocumento = useMemo(
    () => ({
      titulo,
      conteudo,
      pasta: pasta.trim() || null,
      pai_id: pai ? Number(pai) : null,
      tags: tagsDoTexto(tags),
    }),
    [titulo, conteudo, pasta, pai, tags],
  );
  const sujo =
    atual.titulo !== inicial.titulo ||
    atual.conteudo !== inicial.conteudo ||
    atual.pasta !== (inicial.pasta ?? null) ||
    atual.pai_id !== (inicial.pai_id ?? null) ||
    atual.tags.join(",") !== inicial.tags.join(",");

  // Há rascunho de uma sessão anterior diferente do que foi carregado?
  useEffect(() => {
    const guardado = lerRascunho(chave);
    if (
      guardado &&
      (guardado.titulo !== inicial.titulo ||
        guardado.conteudo !== inicial.conteudo ||
        (guardado.pasta ?? null) !== (inicial.pasta ?? null) ||
        (guardado.pai_id ?? null) !== (inicial.pai_id ?? null) ||
        guardado.tags.join(",") !== inicial.tags.join(","))
    ) {
      setRascunho(guardado);
    }
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAVE_FORMATO) === "markdown") setFormato("markdown");
    } catch {
      // sem armazenamento: modo visual
    }
  }, []);

  function trocarFormato(novo: "visual" | "markdown") {
    setFormato(novo);
    setBarra(null);
    try {
      window.localStorage.setItem(CHAVE_FORMATO, novo);
    } catch {
      // só uma conveniência
    }
  }

  // Autosave do rascunho (com atraso) enquanto há alterações e o aviso de rascunho não está aberto.
  useEffect(() => {
    if (rascunho) return;
    const t = setTimeout(
      () => gravarRascunho(chave, sujo ? { ...atual, em: Date.now() } : null),
      ATRASO_RASCUNHO_MS,
    );
    return () => clearTimeout(t);
  }, [atual, sujo, chave, rascunho]);

  // Avisa ao fechar a aba/recarregar com alterações não salvas.
  useEffect(() => {
    if (!sujo || salvando) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo, salvando]);

  const salvar = useCallback(async () => {
    if (salvando || !titulo.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(atual);
      gravarRascunho(chave, null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }, [salvando, titulo, onSalvar, atual, chave]);

  // Ctrl/Cmd+S salva.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        salvar();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [salvar]);

  function cancelar() {
    if (sujo && !window.confirm("Descartar as alterações não salvas?")) return;
    gravarRascunho(chave, null);
    onCancelar();
  }

  function restaurarRascunho() {
    if (!rascunho) return;
    setTitulo(rascunho.titulo);
    setConteudo(rascunho.conteudo);
    setPasta(rascunho.pasta ?? "");
    setPai(rascunho.pai_id ? String(rascunho.pai_id) : "");
    setTags(rascunho.tags.join(", "));
    setRascunho(null);
  }

  function descartarRascunho() {
    gravarRascunho(chave, null);
    setRascunho(null);
  }

  // --- Barra de formatação: opera sobre a seleção do textarea ---

  function aplicar(transformar: (selecionado: string, ta: HTMLTextAreaElement) => { texto: string; selecionar?: [number, number] }) {
    const ta = areaRef.current;
    if (!ta) return;
    const { selectionStart: ini, selectionEnd: fim, value } = ta;
    const { texto, selecionar } = transformar(value.slice(ini, fim), ta);
    const novo = value.slice(0, ini) + texto + value.slice(fim);
    setConteudo(novo);
    setModo("escrever");
    requestAnimationFrame(() => {
      ta.focus();
      const [a, b] = selecionar ?? [ini + texto.length, ini + texto.length];
      ta.setSelectionRange(ini + a, ini + b);
    });
  }

  function envolver(antes: string, depois: string, exemplo: string) {
    aplicar((sel) => {
      const miolo = sel || exemplo;
      return { texto: `${antes}${miolo}${depois}`, selecionar: [antes.length, antes.length + miolo.length] };
    });
  }

  function prefixarLinhas(prefixo: (i: number) => string, exemplo: string) {
    aplicar((sel) => {
      const linhas = (sel || exemplo).split("\n");
      const texto = linhas.map((l, i) => `${prefixo(i)}${l}`).join("\n");
      return { texto, selecionar: [0, texto.length] };
    });
  }

  function inserirTabela() {
    // Insere depois da seleção (nunca a substitui).
    aplicar((sel) => {
      const texto = `${sel}\n\n| Coluna 1 | Coluna 2 |\n|---|---|\n| valor | valor |\n`;
      return { texto, selecionar: [texto.length, texto.length] };
    });
  }

  const ferramentas: { rotulo: string; titulo: string; acao: () => void; sep?: boolean }[] = [
    { rotulo: "H2", titulo: "Título", acao: () => prefixarLinhas(() => "## ", "Título") },
    { rotulo: "H3", titulo: "Subtítulo", acao: () => prefixarLinhas(() => "### ", "Subtítulo") },
    { rotulo: "B", titulo: "Negrito", acao: () => envolver("**", "**", "negrito"), sep: true },
    { rotulo: "I", titulo: "Itálico", acao: () => envolver("*", "*", "itálico") },
    { rotulo: "</>", titulo: "Código", acao: () => envolver("`", "`", "código") },
    { rotulo: "•", titulo: "Lista", acao: () => prefixarLinhas(() => "- ", "item"), sep: true },
    { rotulo: "1.", titulo: "Lista numerada", acao: () => prefixarLinhas((i) => `${i + 1}. `, "item") },
    { rotulo: "☐", titulo: "Lista de tarefas", acao: () => prefixarLinhas(() => "- [ ] ", "tarefa") },
    { rotulo: "❝", titulo: "Citação", acao: () => prefixarLinhas(() => "> ", "citação") },
    { rotulo: "Link", titulo: "Link", acao: () => envolver("[", "](https://)", "texto do link"), sep: true },
    { rotulo: "▦", titulo: "Tabela", acao: inserirTabela },
  ];

  // --- Sugestão de páginas ao digitar [[ ---

  const [paginas, setPaginas] = useState<NoArvore[]>([]);
  const [link, setLink] = useState<LinkAberto | null>(null);
  const [indiceLink, setIndiceLink] = useState(0);
  useEffect(() => {
    obter<NoArvore[]>("/documentos/arvore")
      .then(setPaginas)
      .catch(() => {
        // sem a lista não há sugestões; o link continua podendo ser digitado
      });
  }, []);
  const sugestoesLink = link ? filtrarTitulos(paginas, link.consulta) : [];

  function escolherPagina(titulo: string) {
    const ta = areaRef.current;
    if (!ta || !link) return;
    const r = aplicarLink(ta.value, link, ta.selectionStart, titulo);
    setConteudo(r.valor);
    setLink(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.cursor, r.cursor);
    });
  }

  // --- Menu "/" ---

  const blocosBarra: Bloco[] = barra ? filtrarBlocos(barra.consulta) : [];

  function atualizarBarra(valor: string, cursor: number) {
    const nova = detectarBarra(valor, cursor);
    setBarra(nova);
    setIndiceBarra(0);
  }

  function escolherBloco(bloco: Bloco) {
    const ta = areaRef.current;
    if (!ta || !barra) return;
    const r = inserirBloco(ta.value, barra, ta.selectionStart, bloco);
    setConteudo(r.valor);
    setBarra(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.cursor, r.cursor);
    });
  }

  function aoTeclarTexto(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (link && sugestoesLink.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndiceLink((i) => Math.min(i + 1, sugestoesLink.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndiceLink((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        escolherPagina(sugestoesLink[indiceLink].titulo);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setLink(null);
      }
      return;
    }
    if (!barra || blocosBarra.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceBarra((i) => Math.min(i + 1, blocosBarra.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceBarra((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      escolherBloco(blocosBarra[indiceBarra]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setBarra(null);
    }
  }

  const caracteres = conteudo.length;
  const perto = caracteres > CONTEUDO_MAX * 0.9;

  return (
    <div className="doc-editor" data-modo={modo}>
      {rascunho && (
        <div className="doc-aviso" role="status">
          <span>
            Há um rascunho não salvo de{" "}
            {new Date(rascunho.em).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </span>
          <button type="button" className="botao-destaque" onClick={restaurarRascunho}>
            Restaurar rascunho
          </button>
          <button type="button" onClick={descartarRascunho}>
            Descartar
          </button>
        </div>
      )}

      <input
        className="doc-editor-titulo"
        aria-label="Título"
        placeholder="Título do documento"
        value={titulo}
        maxLength={200}
        onChange={(e) => setTitulo(e.target.value)}
      />

      <div className="doc-editor-meta">
        <input
          aria-label="Pasta"
          placeholder="Pasta (ex.: Produto / Ideias)"
          list="docs-pastas"
          value={pasta}
          maxLength={100}
          onChange={(e) => setPasta(e.target.value)}
          style={{ flex: "1 1 220px" }}
        />
        <datalist id="docs-pastas">
          {pastasSugeridas.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <select
          aria-label="Página pai"
          value={pai}
          onChange={(e) => setPai(e.target.value)}
          style={{ flex: "1 1 200px" }}
        >
          <option value="">Sem página pai (topo)</option>
          {opcoesPai.map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <input
          aria-label="Tags"
          placeholder="Tags separadas por vírgula"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          style={{ flex: "2 1 280px" }}
        />
      </div>

      <div className="doc-formato" role="tablist" aria-label="Formato do editor">
        <button type="button" role="tab" aria-selected={formato === "visual"} className={formato === "visual" ? "ativo" : undefined} onClick={() => trocarFormato("visual")}>
          Visual
        </button>
        <button type="button" role="tab" aria-selected={formato === "markdown"} className={formato === "markdown" ? "ativo" : undefined} onClick={() => trocarFormato("markdown")}>
          Markdown
        </button>
      </div>

      {formato === "visual" ? (
        <EditorVisual valor={conteudo} onChange={setConteudo} />
      ) : (
      <>
      <div className="doc-barra" role="toolbar" aria-label="Formatação">
        {ferramentas.map((f) => (
          <span key={f.titulo} style={{ display: "contents" }}>
            {f.sep && <span className="doc-barra-sep" aria-hidden="true" />}
            <button
              type="button"
              className="doc-ferramenta"
              title={f.titulo}
              aria-label={f.titulo}
              onClick={f.acao}
            >
              {f.rotulo}
            </button>
          </span>
        ))}
        <div className="doc-abas" role="tablist" aria-label="Modo do editor">
          <button
            type="button"
            className="doc-ferramenta"
            role="tab"
            aria-selected={modo === "escrever"}
            onClick={() => setModo("escrever")}
            style={{ borderColor: modo === "escrever" ? "var(--destaque)" : undefined }}
          >
            Escrever
          </button>
          <button
            type="button"
            className="doc-ferramenta"
            role="tab"
            aria-selected={modo === "previa"}
            onClick={() => setModo("previa")}
            style={{ borderColor: modo === "previa" ? "var(--destaque)" : undefined }}
          >
            Pré-visualizar
          </button>
        </div>
      </div>

      <div className="doc-editor-colunas">
        <textarea
          ref={areaRef}
          className="doc-texto mono"
          aria-label="Conteúdo em markdown"
          placeholder="Escreva em markdown. Digite / no começo de uma linha para inserir um bloco, ou use a barra acima."
          value={conteudo}
          maxLength={CONTEUDO_MAX}
          onChange={(e) => {
            setConteudo(e.target.value);
            atualizarBarra(e.target.value, e.target.selectionStart);
            setLink(detectarLink(e.target.value, e.target.selectionStart));
            setIndiceLink(0);
          }}
          onKeyDown={aoTeclarTexto}
          onClick={(e) => atualizarBarra(e.currentTarget.value, e.currentTarget.selectionStart)}
          onBlur={() => {
            setBarra(null);
            setLink(null);
          }}
        />
        {barra && blocosBarra.length > 0 && (
          <ul className="doc-barra-menu" role="listbox" aria-label="Inserir bloco">
            {blocosBarra.map((b, i) => (
              <li
                key={b.id}
                role="option"
                aria-selected={i === indiceBarra}
                className={i === indiceBarra ? "ativo" : undefined}
                // mouseDown (não click): o blur da textarea fecharia o menu antes do clique
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolherBloco(b);
                }}
              >
                <span>{b.rotulo}</span>
                <span className="mono texto-secundario">{b.dica}</span>
              </li>
            ))}
          </ul>
        )}
        {link && sugestoesLink.length > 0 && (
          <ul className="doc-barra-menu" role="listbox" aria-label="Linkar página">
            {sugestoesLink.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === indiceLink}
                className={i === indiceLink ? "ativo" : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolherPagina(p.titulo);
                }}
              >
                <span>{p.titulo}</span>
                <span className="mono texto-secundario">{p.pasta ?? "página"}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="painel doc-editor-previa" aria-label="Pré-visualização">
          <Markdown texto={conteudo} />
        </div>
      </div>
      </>
      )}

      {erro && (
        <p role="alert" className="doc-erro">
          {erro}
        </p>
      )}

      <div className="doc-rodape">
        <button
          type="button"
          className="botao-destaque"
          onClick={salvar}
          disabled={salvando || !titulo.trim() || (!sujo && chaveRascunho !== "novo")}
        >
          {salvando ? "Salvando…" : rotuloSalvar}
        </button>
        <button type="button" onClick={cancelar} disabled={salvando}>
          Cancelar
        </button>
        <span className="doc-estado" data-sujo={sujo}>
          {sujo ? "Alterações não salvas" : "Sem alterações"}
        </span>
        <span className="mono">{contarPalavras(conteudo)} palavras</span>
        <span className="mono" style={{ color: perto ? "var(--espera)" : undefined }}>
          {caracteres.toLocaleString("pt-BR")} / {CONTEUDO_MAX.toLocaleString("pt-BR")}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <kbd className="mono">Ctrl</kbd> + <kbd className="mono">S</kbd> salva
        </span>
      </div>
    </div>
  );
}
