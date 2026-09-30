// Metadados dos agentes e dos personagens do escritório (design.md).
// Ids idênticos aos do Python e aos gravados no banco; os nomes são só de
// exibição. Nenhum componente deve ter nome, cor ou visual de agente fixo no
// código: tudo sai daqui.

export type IdAgente = "orq" | "tech" | "agenda" | "negocios" | "work" | "vigia";

// Aparência em pixel art de um personagem.
export type Visual = {
  pele: string;
  cabelo: string;
  // Cor da camisa/blusa.
  roupa: string;
  barba?: boolean;
  oculos?: boolean;
  cabeloLongo?: boolean;
  bone?: boolean;
  gravata?: boolean;
  coque?: boolean;
  blazer?: boolean;
  // Colete de segurança com faixa refletiva (Rui).
  colete?: boolean;
};

export type Pessoa = {
  nome: string;
  visual: Visual;
  // Cor do nome no chat (mensagens assinadas por essa pessoa).
  corChat: string;
};

// Sala de 280×280 na planta de 872×688.
export type Sala = {
  rotulo: string;
  x: number;
  y: number;
  piso: string;
  parede: string;
  // Parede de vidro (Sala do Chefe).
  vidro?: boolean;
};

export type Agente = {
  id: IdAgente;
  papel: string;
  nivel: "N1" | "N2" | "N3";
  cor: string;
  // O Orquestrador tem mais de uma pessoa (turnos); os demais, uma só.
  pessoas: readonly Pessoa[];
  frasesOciosas: readonly string[];
  // null: o Rui não tem sala, fica na guarita do corredor.
  sala: Sala | null;
};

export const AGENTES: readonly Agente[] = [
  {
    id: "orq",
    papel: "Orquestrador",
    nivel: "N1",
    cor: "#4C8DFF",
    pessoas: [
      {
        nome: "Atlas",
        corChat: "#7FB0FF",
        visual: { pele: "#C68642", cabelo: "#2B1B10", roupa: "#4C8DFF", gravata: true },
      },
      {
        nome: "Nara",
        corChat: "#F2A0C4",
        visual: { pele: "#E8B98F", cabelo: "#5A2E1A", roupa: "#2B5BB8", coque: true, blazer: true },
      },
    ],
    frasesOciosas: ["ouvindo o grupo", "de olho no chat", "revisando o plano do dia"],
    sala: { rotulo: "SALA DO CHEFE", x: 296, y: 12, piso: "#16223C", parede: "#5E7FB8", vidro: true },
  },
  {
    id: "tech",
    papel: "Tech",
    nivel: "N2",
    cor: "#3FC1C9",
    pessoas: [
      {
        nome: "Tobias",
        corChat: "#3FC1C9",
        visual: { pele: "#F1C27D", cabelo: "#7A4A22", roupa: "#3FC1C9", barba: true },
      },
    ],
    frasesOciosas: ["observando a main", "relendo o changelog", "de olho nos PRs"],
    sala: { rotulo: "ENGENHARIA", x: 12, y: 12, piso: "#152036", parede: "#3B4666" },
  },
  {
    id: "agenda",
    papel: "Agenda",
    nivel: "N2",
    cor: "#7BD88F",
    pessoas: [
      {
        nome: "Lia",
        corChat: "#7BD88F",
        visual: { pele: "#8D5524", cabelo: "#1A1411", roupa: "#7BD88F", cabeloLongo: true },
      },
    ],
    frasesOciosas: ["sem pendências", "organizando o calendário", "conferindo a semana"],
    sala: { rotulo: "AGENDA", x: 580, y: 12, piso: "#13221E", parede: "#3B4666" },
  },
  {
    id: "negocios",
    papel: "Negócios",
    nivel: "N2",
    cor: "#A58BFF",
    pessoas: [
      {
        nome: "Bento",
        corChat: "#A58BFF",
        visual: { pele: "#E0AC69", cabelo: "#A7A7A7", roupa: "#A58BFF", oculos: true },
      },
    ],
    frasesOciosas: ["aguardando eventos", "olhando as métricas", "lendo o mercado"],
    sala: { rotulo: "NEGÓCIOS", x: 12, y: 396, piso: "#1B1830", parede: "#3B4666" },
  },
  {
    id: "work",
    papel: "Worker",
    nivel: "N3",
    cor: "#8FA3C7",
    pessoas: [
      {
        nome: "Pipo",
        corChat: "#8FA3C7",
        visual: { pele: "#FFDBAC", cabelo: "#D9A441", roupa: "#8FA3C7", bone: true },
      },
    ],
    frasesOciosas: ["na fila", "esperando tarefa", "organizando as caixas"],
    sala: { rotulo: "BAIA DOS WORKERS", x: 580, y: 396, piso: "#171C28", parede: "#3B4666" },
  },
  {
    id: "vigia",
    papel: "Vigia",
    nivel: "N2",
    cor: "#FF7A59",
    pessoas: [
      {
        nome: "Rui",
        corChat: "#FF7A59",
        visual: { pele: "#B87A4B", cabelo: "#1A1411", roupa: "#FF7A59", colete: true },
      },
    ],
    frasesOciosas: ["de olho no Sentry", "olhando as câmeras", "fazendo a ronda"],
    sala: null,
  },
];

// Copa (sem agente) e guarita do Rui, na mesma planta.
export const SALA_COPA: Sala = { rotulo: "COPA", x: 296, y: 396, piso: "#25221E", parede: "#3B4666" };
export const GUARITA = { x: 18, y: 298, largura: 100, altura: 94 } as const;

export function agentePorId(id: string): Agente | undefined {
  return AGENTES.find((a) => a.id === id);
}

// Pessoa de um agente pelo índice (o Orquestrador alterna entre as suas).
export function pessoaDoAgente(agente: Agente, indice = 0): Pessoa {
  return agente.pessoas[indice % agente.pessoas.length];
}

// "Tobias · Tech · N2"
export function rotuloCompleto(agente: Agente, pessoa: Pessoa): string {
  return `${pessoa.nome} · ${agente.papel} · ${agente.nivel}`;
}
