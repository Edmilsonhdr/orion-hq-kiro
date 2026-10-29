"use client";

// Novo documento (spec docs, Requirements 1.1, 5.3). Ao salvar, vai para a página do documento.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DocEditor from "../../../../components/DocEditor";
import { enviar, obter } from "../../../../lib/api";
import type { DadosDocumento, Documento, Filtros } from "../../../../lib/docs";

const VAZIO: DadosDocumento = { titulo: "", conteudo: "", pasta: null, tags: [] };

export default function NovoDocumentoPage() {
  const router = useRouter();
  const [pastas, setPastas] = useState<string[]>([]);

  useEffect(() => {
    obter<Filtros>("/documentos/pastas")
      .then((f) => setPastas(f.pastas))
      .catch(() => {
        // sugestões de pasta são opcionais
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
      <DocEditor
        inicial={VAZIO}
        pastasSugeridas={pastas}
        rotuloSalvar="Criar documento"
        chaveRascunho="novo"
        onSalvar={salvar}
        onCancelar={() => router.push("/docs")}
      />
    </div>
  );
}
