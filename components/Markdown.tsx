// Renderiza markdown dos Docs como elementos React (nunca HTML bruto — spec docs, Requirement 5.4).
// O parser (lib/markdown.ts) devolve uma árvore de dados; aqui só a convertemos em elementos.

import type { ReactNode } from "react";
import { parseMarkdown, type Bloco, type Inline } from "../lib/markdown";

function inline(itens: Inline[]): ReactNode[] {
  return itens.map((item, i) => {
    switch (item.t) {
      case "texto":
        return item.v;
      case "codigo":
        return (
          <code key={i} className="mono doc-codigo">
            {item.v}
          </code>
        );
      case "negrito":
        return <strong key={i}>{inline(item.c)}</strong>;
      case "italico":
        return <em key={i}>{inline(item.c)}</em>;
      case "link":
        return (
          <a key={i} href={item.href} target="_blank" rel="noopener noreferrer nofollow">
            {inline(item.c)}
          </a>
        );
    }
  });
}

function bloco(b: Bloco, i: number): ReactNode {
  switch (b.t) {
    case "titulo": {
      const nivel = Math.min(b.nivel + 1, 6); // o h1 da página é o título do documento
      const Tag = `h${nivel}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={i} id={b.id}>
          {inline(b.c)}
        </Tag>
      );
    }
    case "paragrafo":
      return <p key={i}>{inline(b.c)}</p>;
    case "lista": {
      const Tag = b.ordenada ? "ol" : "ul";
      return (
        <Tag key={i}>
          {b.itens.map((item, j) =>
            item.feito === undefined ? (
              <li key={j}>{inline(item.c)}</li>
            ) : (
              <li key={j} className="doc-tarefa" data-feito={item.feito}>
                <input type="checkbox" checked={item.feito} disabled readOnly aria-label={item.feito ? "Feito" : "Pendente"} />
                <span>{inline(item.c)}</span>
              </li>
            ),
          )}
        </Tag>
      );
    }
    case "tabela":
      return (
        <div key={i} className="doc-tabela-caixa">
          <table>
            <thead>
              <tr>
                {b.cabecalho.map((c, j) => (
                  <th key={j}>{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.linhas.map((linha, j) => (
                <tr key={j}>
                  {linha.map((c, k) => (
                    <td key={k}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "citacao":
      return <blockquote key={i}>{inline(b.c)}</blockquote>;
    case "codigo":
      return (
        <pre key={i} className="mono doc-bloco-codigo">
          <code>{b.v}</code>
        </pre>
      );
    case "linha":
      return <hr key={i} />;
  }
}

export default function Markdown({ texto }: { texto: string }) {
  const blocos = parseMarkdown(texto);
  if (blocos.length === 0) {
    return <p className="texto-secundario">Documento vazio.</p>;
  }
  return <div className="doc-markdown">{blocos.map(bloco)}</div>;
}
