// Modelos de página para "Novo documento". Só estrutura e perguntas: nada de dados inventados.

export type Modelo = {
  id: string;
  nome: string;
  descricao: string;
  titulo: string;
  conteudo: string;
  tags: string[];
};

export function modelos(hoje: string): Modelo[] {
  return [
    {
      id: "branco",
      nome: "Em branco",
      descricao: "Começar do zero.",
      titulo: "",
      conteudo: "",
      tags: [],
    },
    {
      id: "ata",
      nome: "Ata de reunião",
      descricao: "Pauta, decisões e próximos passos.",
      titulo: `Reunião de ${hoje}`,
      conteudo: [
        "## Participantes",
        "- ",
        "",
        "## Pauta",
        "1. ",
        "",
        "## Decisões",
        "- ",
        "",
        "## Próximos passos",
        "| O quê | Quem | Até quando |",
        "|---|---|---|",
        "|  |  |  |",
        "",
      ].join("\n"),
      tags: ["ata"],
    },
    {
      id: "one-pager",
      nome: "One-pager",
      descricao: "Uma página para explicar uma ideia ou projeto.",
      titulo: "Nome do projeto",
      conteudo: [
        "## Problema",
        "Qual dor estamos resolvendo e para quem?",
        "",
        "## Proposta",
        "O que vamos fazer, em poucas frases.",
        "",
        "## Como saberemos que deu certo",
        "- ",
        "",
        "## Riscos e dúvidas",
        "- ",
        "",
        "## Próximos passos",
        "- [ ] ",
        "",
      ].join("\n"),
      tags: ["projeto"],
    },
    {
      id: "retrospectiva",
      nome: "Retrospectiva",
      descricao: "O que foi bem, o que não foi e o que mudar.",
      titulo: `Retrospectiva de ${hoje}`,
      conteudo: [
        "## O que foi bem",
        "- ",
        "",
        "## O que não foi bem",
        "- ",
        "",
        "## O que vamos mudar",
        "- [ ] ",
        "",
      ].join("\n"),
      tags: ["retrospectiva"],
    },
    {
      id: "lancamento",
      nome: "Plano de lançamento",
      descricao: "Checklist antes, durante e depois de lançar.",
      titulo: "Plano de lançamento",
      conteudo: [
        "## Objetivo",
        "",
        "## Antes do lançamento",
        "- [ ] ",
        "",
        "## No dia",
        "- [ ] ",
        "",
        "## Depois",
        "- [ ] Acompanhar os primeiros usuários",
        "- [ ] Registrar o que aprendemos",
        "",
      ].join("\n"),
      tags: ["lancamento"],
    },
  ];
}
