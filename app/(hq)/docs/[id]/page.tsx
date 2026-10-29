"use client";

// Documento: leitura (com sumário), edição, arquivar e histórico de versões com restauração
// (spec docs, Requirements 2, 3.3, 5.3, 5.5, 5.6).

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DocEditor from "../../../../components/DocEditor";
import Markdown from "../../../../components/Markdown";
import Comentarios from "../../../../components/Comentarios";
import Anexos from "../../../../components/Anexos";
import TarefasRelacionadas from "../../../../components/TarefasRelacionadas";
import Sumario from "../../../../components/Sumario";
import { ErroApi, atualizar, enviar, obter } from "../../../../lib/api";
import {
  formatarData,
  tempoRelativo,
  type Ancestral,
  type DadosDocumento,
  type Documento,
  type Filtros,
  type NoArvore,
  opcoesPai,
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
  const [arvore, setArvore] = useState<NoArvore[]>([]);

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
    obter<NoArvore[]>("/documentos/arvore")
      .then((a) => ativo && setArvore(a))
      .catch(() => {
        // sem a árvore o seletor de página pai fica só com "topo"
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

  // Título da aba do navegador acompanha o documento.
  useEffect(() => {
    if (doc) document.title = `${doc.titulo} · Docs · Orion HQ`;
  }, [doc]);

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

  async function moverSubpagina(subId: number, direcao: "cima" | "baixo") {
    if (ocupado) return;
    setOcupado(true);
    try {
      await enviar(`/documentos/${subId}/ordem`, { direcao });
      setDoc(await obter<Documento>(`/documentos/${id}`));
    } catch {
      setErro("Não foi possível mudar a ordem.");
    } finally {
      setOcupado(false);
    }
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

  const migalhas = (titulo: string, pasta?: string | null, ancestrais: Ancestral[] = []) => (
    <nav className="doc-migalhas" aria-label="Você está em">
      <Link href="/docs">Docs</Link>
      {ancestrais.map((a) => (
        <Fragment key={a.id}>
          <span aria-hidden="true">›</span>
          <Link href={`/docs/${a.id}`}>{a.titulo}</Link>
        </Fragment>
      ))}
      {!ancestrais.length && pasta && (
        <>
          <span aria-hidden="true">›</span>
          <Link href={`/docs?pasta=${encodeURIComponent(pasta)}`}>{pasta}</Link>
        </>
      )}
      <span aria-hidden="true">›</span>
      <span aria-current="page" style={{ color: "var(--texto)" }}>
        {titulo}
      </span>
    </nav>
  );

  if (naoEncontrado) {
    return (
      <div className="docs-pagina">
        {migalhas("Não encontrado")}
        <div className="docs-vazio">
          <strong>Documento não encontrado</strong>
          <p style={{ margin: "0 0 14px" }}>Ele pode ter sido apagado ou o endereço está errado.</p>
          <Link href="/docs" className="botao" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Voltar para Docs
          </Link>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="docs-pagina">
        {migalhas("Carregando…")}
        {erro ? (
          <p role="alert" className="doc-erro">
            {erro}
          </p>
        ) : (
          <div className="docs-lista" aria-busy="true">
            <div className="docs-esqueleto" style={{ height: 44, maxWidth: 480 }} />
            <div className="docs-esqueleto" style={{ height: 260 }} />
          </div>
        )}
      </div>
    );
  }

  if (editando) {
    return (
      <div className="docs-pagina" style={{ maxWidth: "1280px" }}>
        {migalhas(`Editando: ${doc.titulo}`, doc.pasta, doc.ancestrais)}
        <DocEditor
          inicial={{
            titulo: doc.titulo,
            conteudo: doc.conteudo,
            pasta: doc.pasta,
            pai_id: doc.pai_id,
            tags: doc.tags,
          }}
          pastasSugeridas={pastas}
          opcoesPai={opcoesPai(arvore, doc.id)}
          chaveRascunho={id}
          onSalvar={salvar}
          onCancelar={() => setEditando(false)}
        />
      </div>
    );
  }

  return (
    <div className="docs-pagina">
      {migalhas(doc.titulo, doc.pasta, doc.ancestrais)}

      <div className="doc-cabecalho">
        <h1 className="doc-titulo">{doc.titulo}</h1>
        <div className="doc-acoes">
          <button type="button" className="botao-destaque" onClick={() => setEditando(true)}>
            Editar
          </button>
          <Link href={`/docs/novo?pai=${doc.id}`} className="botao" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Nova subpágina
          </Link>
          <button type="button" onClick={alternarHistorico} aria-pressed={mostrarHistorico}>
            Histórico
          </button>
          <button type="button" onClick={alternarArquivado} disabled={ocupado}>
            {doc.arquivado ? "Desarquivar" : "Arquivar"}
          </button>
        </div>
      </div>

      <div className="doc-meta">
        {doc.arquivado && <span className="doc-etiqueta">arquivado</span>}
        {doc.tags.map((t) => (
          <span key={t} className="mono">
            #{t}
          </span>
        ))}
        <span title={`Criado em ${formatarData(doc.criado_em)}`}>
          {doc.autor} · atualizado {tempoRelativo(doc.atualizado_em)}
        </span>
        <span className="mono" title="Data da última atualização">
          {formatarData(doc.atualizado_em)}
        </span>
      </div>

      {erro && (
        <p role="alert" className="doc-erro" style={{ marginBottom: 12 }}>
          {erro}
        </p>
      )}

      {mostrarHistorico && (
        <section className="painel doc-historico" aria-label="Histórico de versões">
          <h2 style={{ margin: "0 0 6px", fontSize: "16px", fontFamily: "var(--fonte-texto)", fontWeight: 600 }}>
            Histórico de versões
          </h2>
          {historico === null && <p className="texto-secundario">Carregando…</p>}
          {historico?.length === 0 && (
            <p className="texto-secundario" style={{ margin: 0 }}>
              Ainda não há versões anteriores: elas aparecem quando o título ou o texto mudam.
            </p>
          )}
          <ul className="doc-versoes">
            {historico?.map((v) => (
              <li key={v.id} className="doc-versao">
                <span style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{formatarData(v.criado_em)}</strong>
                  <span className="texto-secundario"> · editado por {v.editado_por}</span>
                  <br />
                  <span className="texto-secundario" style={{ fontSize: 13 }}>
                    “{v.titulo}”
                  </span>
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
            <div style={{ marginTop: 14, borderTop: "1px solid var(--borda)", paddingTop: 12 }}>
              <p className="texto-secundario" style={{ marginTop: 0 }}>
                Versão de {formatarData(versaoAberta.criado_em)} — “{versaoAberta.titulo}”
              </p>
              <Markdown texto={versaoAberta.conteudo} />
            </div>
          )}
        </section>
      )}

      <div className="doc-leitura-grade">
        <article className="painel doc-artigo">
          <Markdown texto={doc.conteudo} />
          {doc.subpaginas && doc.subpaginas.length > 0 && (
            <section className="doc-subpaginas" aria-label="Subpáginas">
              <h2>Subpáginas</h2>
              <ul>
                {doc.subpaginas.map((s, i) => (
                  <li key={s.id} className="doc-subpagina-item">
                    <Link href={`/docs/${s.id}`}>{s.titulo}</Link>
                    {doc.subpaginas && doc.subpaginas.length > 1 && (
                      <span className="doc-subpagina-ordem">
                        <button type="button" aria-label={`Subir ${s.titulo}`} disabled={i === 0 || ocupado} onClick={() => moverSubpagina(s.id, "cima")}>
                          ↑
                        </button>
                        <button type="button" aria-label={`Descer ${s.titulo}`} disabled={i === doc.subpaginas!.length - 1 || ocupado} onClick={() => moverSubpagina(s.id, "baixo")}>
                          ↓
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
        <Sumario texto={doc.conteudo} />
      </div>

      <TarefasRelacionadas entidade="documento" id={doc.id} />

      <Anexos entidade="documento" id={doc.id} />

      <Comentarios documentoId={doc.id} />
    </div>
  );
}
