// Ajustes de ida e volta entre o markdown do Orion HQ e o editor visual. O editor escapa o que o
// markdown padrão não conhece ([[Página]] e @menção); aqui devolvemos a sintaxe do Docs ao salvar.

// Antes de abrir no editor: nada a mudar hoje (o editor lê [[X]] e @x como texto comum).
export function paraEditor(markdown: string): string {
  return markdown;
}

// Depois de sair do editor: desfaz escapes que o conversor acrescenta.
export function doEditor(markdown: string): string {
  return markdown
    // [[Página]] escapado como \[\[Página\]\] (ou \[\[Página]])
    .replace(/\\\[\\\[([^\]\n\\]+?)\\\]\\\]/g, "[[$1]]")
    .replace(/\\\[\\\[([^\]\n\\]+?)\]\]/g, "[[$1]]")
    .replace(/\\\[([^\]\n]*)\\\]\\\]/g, (t) => t)
    // @usuario não deve ganhar barra
    .replace(/\\@([A-Za-z][A-Za-z0-9_]{1,30})/g, "@$1");
}
