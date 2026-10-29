"use client";

// Novo documento (spec docs, Requirements 1.1, 5.3). Ao salvar, vai para a página do documento.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DocEditor from "../../../../components/DocEditor";
import { enviar, obter } from "../../../../lib/api";
import { opcoesPai, type DadosDocumento, type Documento, type Filtros, type NoArvore } from "../../../../lib/docs";

export default function NovoDocumentoPage() {
  const router = useRouter();
  const [pastas, setPastas] = useState<string[]>([]);
  const [arvore, setArvore] = useState<NoArvore[]>([]);
  const [inicial, setInicial] = useState<DadosDocumento | null>(null);

  useEffect(() => {
    // ?pai=ID abre o formulário já como subpágina (botão "Nova subpágina").
    const pai = Number(new URLSearchParams(window.location.search).get("pai"));
    setInicial({ titulo: "", conteudo: "", pasta: null, pai_id: Number.isInteger(pai) && pai > 0 ? pai : null, tags: [] });
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
