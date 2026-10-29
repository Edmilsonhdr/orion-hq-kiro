"use client";

// Novo documento (spec docs, Requirements 1.1, 5.3). Ao salvar, vai para a página do documento.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DocEditor from "../../../../components/DocEditor";
import { enviar, obter } from "../../../../lib/api";
import { formatarDia, hojeISO } from "../../../../lib/comercial";
import { modelos, type Modelo } from "../../../../lib/modelos";
import { opcoesPai, type DadosDocumento, type Documento, type Filtros, type NoArvore } from "../../../../lib/docs";

function dadosDoModelo(m: Modelo, pai: number | null): DadosDocumento {
  return { titulo: m.titulo, conteudo: m.conteudo, pasta: null, pai_id: pai, tags: m.tags };
}

export default function NovoDocumentoPage() {
  const router = useRouter();
  const [pastas, setPastas] = useState<string[]>([]);
  const [arvore, setArvore] = useState<NoArvore[]>([]);
  const [inicial, setInicial] = useState<DadosDocumento | null>(null);
  const [pai, setPai] = useState<number | null>(null);
  const lista = modelos(formatarDia(hojeISO()));

  useEffect(() => {
    // ?pai=ID abre o formulário já como subpágina (botão "Nova subpágina").
    const params = new URLSearchParams(window.location.search);
    const paiUrl = Number(params.get("pai"));
    const paiOk = Number.isInteger(paiUrl) && paiUrl > 0 ? paiUrl : null;
    setPai(paiOk);
    // ?modelo=ata pula a escolha de modelo.
    const escolhido = modelos(formatarDia(hojeISO())).find((m) => m.id === params.get("modelo"));
    if (escolhido) setInicial(dadosDoModelo(escolhido, paiOk));
    obter<Filtros>("/documentos/pastas")
      .then((f) => setPastas(f.pastas))
      .catch(() => {
        // sugestões de pasta são opcionais
      });
    obter<NoArvore[]>("/documentos/arvore")
      .then(setArvore)
      .catch(() => {
        // sem a árvore o seletor de página pai fica só com "topo"
      });
  }, []);

  async function salvar(dados: DadosDocumento) {
    const criado = await enviar<Documento>("/documentos", dados);
    router.push(`/docs/${criado.id}`);
  }

  return (
    <div className="docs-pagina" style={{ maxWidth: "1280px" }}>
      <nav className="doc-migalhas" aria-label="Você está em">
        <Link href="/docs">Docs</Link>
        <span aria-hidden="true">›</span>
        <span>Novo documento</span>
      </nav>
      {!inicial && (
        <section aria-label="Escolha um modelo">
          <h1 className="doc-titulo" style={{ marginBottom: 4 }}>
            Nova página
          </h1>
          <p className="texto-secundario" style={{ margin: 0 }}>
            Comece com um modelo ou em branco.
          </p>
          <div className="modelos-grade">
            {lista.map((m) => (
              <button key={m.id} type="button" className="modelo-cartao" onClick={() => setInicial(dadosDoModelo(m, pai))}>
                <strong>{m.nome}</strong>
                <span className="texto-secundario">{m.descricao}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {inicial && (
      <DocEditor
        inicial={inicial}
        pastasSugeridas={pastas}
        opcoesPai={opcoesPai(arvore)}
        rotuloSalvar="Criar documento"
        chaveRascunho="novo"
        onSalvar={salvar}
        onCancelar={() => router.push("/docs")}
      />
      )}
    </div>
  );
}
