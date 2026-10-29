"use client";

// Anexos de um documento ou negócio: escolher arquivo, arrastar para cá ou colar um print (Ctrl+V).
// Os arquivos ficam no próprio banco (limite de 8 MB cada); PDF e imagens abrem no navegador.

import { useCallback, useEffect, useRef, useState } from "react";
import { excluir, obter } from "../lib/api";
import { formatarTamanho, type Anexo } from "../lib/comercial";
import { formatarData } from "../lib/docs";

const MAX = 8 * 1024 * 1024;

async function enviarArquivo(entidade: string, id: number, arquivo: File): Promise<void> {
  const resposta = await fetch(`/api/anexos?entidade=${entidade}&id=${id}&nome=${encodeURIComponent(arquivo.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: arquivo,
  });
  if (resposta.status === 401) {
    window.location.href = "/login?expirou=1";
    throw new Error("Sessão expirada");
  }
  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (corpo?.detail) mensagem = String(corpo.detail);
    } catch {
      // sem corpo JSON
    }
    throw new Error(mensagem);
  }
}

export default function Anexos({ entidade, id }: { entidade: "documento" | "negocio"; id: number }) {
  const [lista, setLista] = useState<Anexo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await obter<Anexo[]>(`/anexos?entidade=${entidade}&id=${id}`));
    } catch {
      // sem a lista a seção só fica vazia
    }
  }, [entidade, id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function enviar(arquivos: File[]) {
    if (arquivos.length === 0 || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      for (const a of arquivos) {
        if (a.size > MAX) throw new Error(`“${a.name}” passa de 8 MB.`);
        await enviarArquivo(entidade, id, a);
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
      if (campoRef.current) campoRef.current.value = "";
    }
  }

  async function remover(a: Anexo) {
    if (!window.confirm(`Excluir “${a.nome}”?`)) return;
    try {
      await excluir(`/anexos/${a.id}`);
      await carregar();
    } catch {
      setErro("Não foi possível excluir.");
    }
  }

  function aoColar(e: React.ClipboardEvent) {
    const imagens = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (imagens.length === 0) return;
    e.preventDefault();
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    enviar(imagens.map((f, i) => new File([f], `print-${carimbo}${i ? `-${i + 1}` : ""}.${f.type.split("/")[1] || "png"}`, { type: f.type })));
  }

  return (
    <section
      className={`painel com-bloco anexos${sobre ? " anexos-sobre" : ""}`}
      aria-label="Anexos"
      onPaste={aoColar}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        enviar([...e.dataTransfer.files]);
      }}
    >
      <h2 className="com-grupo-titulo">Anexos</h2>
      {lista.length === 0 && <p className="texto-secundario" style={{ margin: "0 0 8px" }}>Nenhum anexo. Arraste um arquivo para cá, cole um print (Ctrl+V) ou escolha abaixo.</p>}
      <ul className="anexos-lista">
        {lista.map((a) => (
          <li key={a.id}>
            {a.tipo.startsWith("image/") && (
              <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="anexos-miniatura">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/anexos/${a.id}`} alt={a.nome} loading="lazy" />
              </a>
            )}
            <span className="anexos-nome">
              <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" download={a.tipo === "application/pdf" || a.tipo.startsWith("image/") ? undefined : a.nome}>
                {a.nome}
              </a>
              <span className="texto-secundario mono">
                {" "}
                · {formatarTamanho(a.tamanho)} · {a.autor} · {formatarData(a.criado_em)}
              </span>
            </span>
            <button type="button" className="botao com-excluir" aria-label={`Excluir ${a.nome}`} onClick={() => remover(a)}>
              Excluir
            </button>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      <label className="botao anexos-escolher">
        {enviando ? "Enviando…" : "Adicionar arquivo"}
        <input
          ref={campoRef}
          type="file"
          multiple
          hidden
          disabled={enviando}
          onChange={(e) => enviar([...(e.target.files ?? [])])}
        />
      </label>
      <span className="texto-secundario anexos-dica"> PDF, imagem, texto, CSV, Word, Excel ou PowerPoint · até 8 MB</span>
    </section>
  );
}
