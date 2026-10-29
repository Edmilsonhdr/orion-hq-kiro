"use client";

// Documento: leitura, edição, arquivar e histórico de versões com restauração
// (spec docs, Requirements 2, 3.3, 5.3, 5.5, 5.6).

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DocEditor from "../../../../components/DocEditor";
import Markdown from "../../../../components/Markdown";
import { ErroApi, atualizar, enviar, obter } from "../../../../lib/api";
import {
  formatarData,
  type DadosDocumento,
  type Documento,
  type Filtros,
  type Versao,
  type VersaoResumo,
} from "../../../../lib/docs";

export default function DocumentoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [doc, setDoc] = useState<Documento | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [pastas, setPastas] = useState<string[]>([]);

  const [historico, setHistorico] = useState<VersaoResumo[] | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [versaoAberta, setVersaoAberta] = useState<Versao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    obter<Documento>(`/documentos/${id}`)
      .then((d) => {
        if (ativo) setDoc(d);
      })
      .catch((e) => {
        if (!ativo) return;
        if (e instanceof ErroApi && e.status === 404) setNaoEncontrado(true);
        else setErro(e instanceof Error ? e.message : "Erro ao carregar o documento.");
      });
    obter<Filtros>("/documentos/pastas")
      .then((f) => ativo && setPastas(f.pastas))
      .catch(() => {
        // sugestões de pasta são opcionais
      });
    return () => {
      ativo = false;
    };
  }, [id]);

  const carregarHistorico = useCallback(async () => {
    try {
      setHistorico(await obter<VersaoResumo[]>(`/documentos/${id}/versoes`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o histórico.");
    }
  }, [id]);

  async function salvar(dados: DadosDocumento) {
    const atualizado = await atualizar<Documento>(`/documentos/${id}`, dados);
    setDoc(atualizado);
    setEditando(false);
    setErro(null);
    if (mostrarHistorico) carregarHistorico();
  }

  async function alternarArquivado() {
    if (!doc || ocupado) return;
    setOcupado(true);
    try {
      setDoc(await enviar<Documento>(`/documentos/${id}/arquivar`, { arquivado: !doc.arquivado }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível arquivar.");
    } finally {
      setOcupado(false);
    }
  }

  function alternarHistorico() {
    const abrir = !mostrarHistorico;
    setMostrarHistorico(abrir);
    setVersaoAberta(null);
    if (abrir) carregarHistorico();
  }

  async function verVersao(versaoId: number) {
    try {
      setVersaoAberta(await obter<Versao>(`/documentos/${id}/versoes/${versaoId}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar a versão.");
    }
  }

  async function restaurar(versaoId: number) {
    if (ocupado) return;
    if (!window.confirm("Restaurar esta versão? A versão atual fica guardada no histórico.")) return;
    setOcupado(true);
    try {
      setDoc(await enviar<Documento>(`/documentos/${id}/versoes/${versaoId}/restaurar`));
      setVersaoAberta(null);
      setErro(null);
      await carregarHistorico();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível restaurar.");
    } finally {
      setOcupado(false);
    }
  }

  const voltar = (
    <p style={{ margin: "0 0 8px" }}>
      <Link href="/docs">← Docs</Link>
    </p>
  );

  if (naoEncontrado) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 20px" }}>
        {voltar}
        <p>Documento não encontrado.</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 20px" }}>
        {voltar}
        {erro ? (
          <p role="alert" style={{ color: "#FF7A59" }}>
            {erro}
          </p>
        ) : (
          <p className="texto-secundario">Carregando…</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 20px" }}>
      {voltar}

      {editando ? (
        <DocEditor
          inicial={{ titulo: doc.titulo, conteudo: doc.conteudo, pasta: doc.pasta, tags: doc.tags }}
          pastasSugeridas={pastas}
          onSalvar={salvar}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "24px", flex: "1 1 300px", overflowWrap: "anywhere" }}>
              {doc.titulo}
            </h1>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className="botao-destaque" onClick={() => setEditando(true)}>
                Editar
              </button>
              <button type="button" onClick={alternarHistorico} aria-pressed={mostrarHistorico}>
                Histórico
              </button>
              <button type="button" onClick={alternarArquivado} disabled={ocupado}>
                {doc.arquivado ? "Desarquivar" : "Arquivar"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "10px 0" }}>
            {doc.arquivado && <span className="doc-etiqueta">arquivado</span>}
            {doc.pasta && <span className="doc-etiqueta">{doc.pasta}</span>}
            {doc.tags.map((t) => (
              <span key={t} className="doc-etiqueta mono">
                #{t}
              </span>
            ))}
          </div>
          <p className="texto-secundario mono" style={{ margin: "0 0 16px", fontSize: "12px" }}>
            {doc.autor} · criado em {formatarData(doc.criado_em)} · atualizado em{" "}
            {formatarData(doc.atualizado_em)}
          </p>

          {erro && (
            <p role="alert" style={{ color: "#FF7A59" }}>
              {erro}
            </p>
          )}

          {mostrarHistorico && (
            <section className="painel" style={{ padding: "14px 16px", marginBottom: "16px" }}>
              <h2 style={{ margin: "0 0 10px", fontSize: "16px" }}>Histórico de versões</h2>
              {historico === null && <p className="texto-secundario">Carregando…</p>}
              {historico?.length === 0 && (
                <p className="texto-secundario" style={{ margin: 0 }}>
                  Ainda não há versões anteriores: elas aparecem quando o título ou o texto mudam.
                </p>
              )}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "8px" }}>
                {historico?.map((v) => (
                  <li
                    key={v.id}
                    style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}
                  >
                    <span className="mono" style={{ fontSize: "13px", flex: "1 1 240px" }}>
                      {formatarData(v.criado_em)} · {v.editado_por} · “{v.titulo}”
                    </span>
                    <button type="button" onClick={() => verVersao(v.id)}>
                      Ver
                    </button>
                    <button type="button" onClick={() => restaurar(v.id)} disabled={ocupado}>
                      Restaurar
                    </button>
                  </li>
                ))}
              </ul>
              {versaoAberta && (
                <div style={{ marginTop: "14px", borderTop: "1px solid var(--borda)", paddingTop: "12px" }}>
                  <p className="texto-secundario" style={{ marginTop: 0 }}>
                    Versão de {formatarData(versaoAberta.criado_em)} — “{versaoAberta.titulo}”
                  </p>
                  <Markdown texto={versaoAberta.conteudo} />
                </div>
              )}
            </section>
          )}

          <article className="painel" style={{ padding: "16px 20px" }}>
            <Markdown texto={doc.conteudo} />
          </article>
        </>
      )}
    </div>
  );
}
