"use client";

// Importação de planilha CSV do Comercial: escolhe o arquivo (ou cola o texto) e mostra o resultado.

import { useState } from "react";
import { enviar } from "../lib/api";

type Resultado = { organizacoes: number; contatos: number; negocios: number; erros: { linha: number; erro: string }[] };

export default function ImportarPlanilha({ onImportado }: { onImportado: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function lerArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setTexto(await arquivo.text());
    setResultado(null);
  }

  async function importar() {
    if (enviando || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await enviar<Resultado>("/comercial/importar", { csv: texto });
      setResultado(r);
      onImportado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível importar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="com-importar">
      <p className="texto-secundario" style={{ marginTop: 0 }}>
        Planilha em CSV com cabeçalho. Colunas aceitas: <strong>organização</strong> (obrigatória), tipo, cidade, origem,
        contato, cargo, e-mail, telefone e título. Cada linha vira organização, contato e um negócio em Lead.
      </p>
      <input type="file" accept=".csv,text/csv,text/plain" aria-label="Arquivo CSV" onChange={(e) => lerArquivo(e.target.files?.[0])} />
      <textarea
        rows={6}
        aria-label="Conteúdo do CSV"
        placeholder={"organização;tipo;contato;telefone\nClínica Sol;clínica;Ana Souza;81999990000"}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setResultado(null);
        }}
      />
      {erro && (
        <p role="alert" className="doc-erro">
          {erro}
        </p>
      )}
      {resultado && (
        <div role="status" className="com-importar-resultado">
          Importado: {resultado.organizacoes} organizações, {resultado.contatos} contatos e {resultado.negocios} negócios.
          {resultado.erros.length > 0 && (
            <ul>
              {resultado.erros.map((e) => (
                <li key={e.linha}>
                  Linha {e.linha}: {e.erro}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="botao-destaque" onClick={importar} disabled={enviando || !texto.trim()}>
          {enviando ? "Importando…" : "Importar"}
        </button>
      </div>
    </div>
  );
}
