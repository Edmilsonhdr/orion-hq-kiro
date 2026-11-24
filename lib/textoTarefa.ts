// Converte o texto das tarefas (como fica salvo no banco) para o documento do editor visual e de volta.
// Formato salvo: linhas de texto; imagem numa linha própria como ![nome](/api/anexos/12) ou ![nome|480](...);
// menção como @login. Assim o back (menções, notificações, prévia do cartão) continua lendo texto simples.

export type NoEditor = { type: string; attrs?: Record<string, unknown>; text?: string; content?: NoEditor[] };

const TOKEN = /!\[([^\]|]*)(?:\|(\d+))?\]\((\/api\/anexos\/\d+)\)|(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_]{1,30})/g;

export function textoParaDoc(texto: string): NoEditor {
  const blocos: NoEditor[] = [];
  for (const linha of (texto ?? "").split("\n")) {
    let atual: NoEditor[] = [];
    let ultimo = 0;
    const fecharParagrafo = (forcar = false) => {
      if (atual.length || forcar) blocos.push({ type: "paragraph", content: atual.length ? atual : undefined });
      atual = [];
    };
    let teveImagem = false;
    for (const m of linha.matchAll(TOKEN)) {
      if (m.index! > ultimo) atual.push({ type: "text", text: linha.slice(ultimo, m.index) });
      if (m[3]) {
        fecharParagrafo();
        blocos.push({ type: "imagem", attrs: { src: m[3], alt: m[1], largura: m[2] ? Number(m[2]) : null } });
        teveImagem = true;
      } else {
        atual.push({ type: "mencao", attrs: { id: m[4] } });
      }
      ultimo = m.index! + m[0].length;
    }
    if (ultimo < linha.length) atual.push({ type: "text", text: linha.slice(ultimo) });
    // Linha vazia vira parágrafo vazio; linha só com imagem não gera parágrafo extra.
    fecharParagrafo(!teveImagem && atual.length === 0);
  }
  if (blocos.length === 0) blocos.push({ type: "paragraph" });
  return { type: "doc", content: blocos };
}

function inline(nos: NoEditor[] | undefined): string {
  return (nos ?? [])
    .map((n) => (n.type === "text" ? n.text ?? "" : n.type === "mencao" ? `@${n.attrs?.id}` : n.type === "hardBreak" ? "\n" : ""))
    .join("");
}

export function docParaTexto(doc: NoEditor): string {
  const linhas = (doc.content ?? []).map((b) => {
    if (b.type === "imagem") {
      const a = b.attrs ?? {};
      return `![${String(a.alt ?? "imagem").replace(/[\]|]/g, "")}${a.largura ? `|${Math.round(Number(a.largura))}` : ""}](${a.src})`;
    }
    return inline(b.content);
  });
  return linhas.join("\n").replace(/\n+$/, "").replace(/^\n+/, "");
}
