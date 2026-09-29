// Rotina do escritório virtual: turnos do Orquestrador, pausa pro café e fim
// do dia, como funções puras.
//
// Regra de ouro: nada é sorteado nem guardado só no navegador. Todo estado
// visual sai do relógio (fuso de São Paulo) e das atividades do banco, então
// duas telas com os mesmos dados no mesmo instante mostram a mesma cena.
//
// Sem imports de runtime: o arquivo roda direto com `node --test`
// (lib/rotina.test.ts). Os nomes e visuais dos personagens ficam em
// lib/agents.ts; aqui só existem ids e índices.

export type AtividadeRotina = {
  id: number;
  run_id: string | null;
  agente: string;
  tipo: string;
  detalhe?: string | null;
  dados?: Record<string, unknown> | null;
  criado_em: string;
};

export type ConfigRotina = {
  // Duração de cada turno do Orquestrador, contada a partir da meia-noite.
  turnoMin: number;
  // Quantas pessoas se revezam no plantão (Atlas e Nara).
  pessoasOrq: number;
  // Sem atividade há mais que isso, o especialista vai pra copa (ou pra casa à noite).
  cafeAposMs: number;
  // Uma atividade de trabalho mantém a sala "ativa" por esse tempo.
  ativoMs: number;
  // Noite: de noiteInicioMin até noiteFimMin (minutos do dia, São Paulo).
  noiteInicioMin: number;
  noiteFimMin: number;
  // Run sem atividade há mais que isso deixa de contar como "em andamento".
  runParadoMs: number;
  // Quem sai do turno fica esse tempo na copa antes de ir embora.
  saidaCopaMs: number;
  lugaresCopa: number;
  // Quanto do passado entra na simulação das cadeiras da copa.
  janelaCopaMs: number;
};

const SEG = 1000;
const MIN = 60 * SEG;
const DIA = 24 * 60 * MIN;

export const ROTINA: ConfigRotina = {
  turnoMin: 90,
  pessoasOrq: 2,
  cafeAposMs: 2 * MIN,
  ativoMs: 30 * SEG,
  noiteInicioMin: 19 * 60,
  noiteFimMin: 8 * 60,
  runParadoMs: 2 * MIN,
  saidaCopaMs: 5 * MIN,
  lugaresCopa: 3,
  janelaCopaMs: 6 * 60 * MIN,
};

// Agentes que seguem a rotina de copa/casa (o Orquestrador segue os turnos).
export const ESPECIALISTAS = ["tech", "agenda", "negocios", "work", "vigia"] as const;

// Ordem fixa para desempates (cadeiras da copa, etc.).
const ORDEM = ["tech", "agenda", "negocios", "work", "vigia", "orq:0", "orq:1", "orq:2", "orq:3"];

const TIPOS_TRABALHO = new Set(["inicio", "pensando", "ferramenta", "delegou"]);
const TIPOS_FIM_DE_RUN = new Set(["resposta", "erro", "aguardando_aprovacao"]);

// ---------------------------------------------------------------- relógio

const formatoSP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Milissegundos desde a meia-noite em São Paulo.
export function msDoDia(ms: number): number {
  const partes = formatoSP.formatToParts(new Date(ms));
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const segundos = (valor("hour") % 24) * 3600 + valor("minute") * 60 + valor("second");
  return segundos * SEG + (((ms % SEG) + SEG) % SEG);
}

export function inicioDoDia(ms: number): number {
  return ms - msDoDia(ms);
}

export function ehNoite(ms: number, cfg: ConfigRotina = ROTINA): boolean {
  const minutos = msDoDia(ms) / MIN;
  return minutos >= cfg.noiteInicioMin || minutos < cfg.noiteFimMin;
}

function tempo(a: AtividadeRotina): number {
  return Date.parse(a.criado_em);
}

// ---------------------------------------------------------------- turnos

export type Turno = { indice: number; pessoa: number; inicio: number; fim: number };

// Turno pelo relógio, sem considerar runs em andamento.
export function turnoNominal(ms: number, cfg: ConfigRotina = ROTINA): Turno {
  const dia = inicioDoDia(ms);
  const duracao = cfg.turnoMin * MIN;
  const indice = Math.floor((ms - dia) / duracao);
  const inicio = dia + indice * duracao;
  return {
    indice,
    pessoa: indice % cfg.pessoasOrq,
    inicio,
    fim: Math.min(inicio + duracao, dia + DIA),
  };
}

type Marco = { t: number; fim: boolean };

function indexarRuns(atividades: readonly AtividadeRotina[]): Marco[][] {
  const porRun = new Map<string, Marco[]>();
  for (const a of atividades) {
    if (!a.run_id) continue;
    const t = tempo(a);
    if (Number.isNaN(t)) continue;
    const lista = porRun.get(a.run_id) ?? [];
    lista.push({ t, fim: TIPOS_FIM_DE_RUN.has(a.tipo) });
    porRun.set(a.run_id, lista);
  }
  const runs = Array.from(porRun.values());
  for (const marcos of runs) marcos.sort((x, y) => x.t - y.t);
  return runs;
}

// Se o run estiver em andamento no instante t, devolve quando ele deixa de
// estar (atividade de fim, ou tempo demais sem atividade). Senão, null.
function andamentoAte(marcos: Marco[], t: number, cfg: ConfigRotina): number | null {
  let i = -1;
  for (let j = 0; j < marcos.length && marcos[j].t <= t; j++) i = j;
  if (i < 0) return null;
  let atual = marcos[i];
  if (atual.fim || t - atual.t >= cfg.runParadoMs) return null;
  for (let j = i + 1; j < marcos.length; j++) {
    const proximo = marcos[j];
    if (proximo.t - atual.t >= cfg.runParadoMs) return atual.t + cfg.runParadoMs;
    if (proximo.fim) return proximo.t;
    atual = proximo;
  }
  return atual.t + cfg.runParadoMs;
}

// Primeiro instante a partir de t em que nenhum run está em andamento.
function livreApos(t: number, runs: Marco[][], cfg: ConfigRotina): number {
  let instante = t;
  for (let guarda = 0; guarda < 100; guarda++) {
    let proximo: number | null = null;
    for (const marcos of runs) {
      const fim = andamentoAte(marcos, instante, cfg);
      if (fim !== null && (proximo === null || fim > proximo)) proximo = fim;
    }
    if (proximo === null || proximo <= instante) return instante;
    instante = proximo;
  }
  return instante;
}

export type Plantao = {
  // Índice da pessoa de plantão (0 = Atlas, 1 = Nara).
  pessoa: number;
  // A troca do turno atual está esperando um run terminar.
  adiado: boolean;
  // Quando a troca do turno atual aconteceu (ou vai acontecer, se adiada).
  trocaEm: number;
  // Quem acabou de sair do turno e ainda está na copa (ou null).
  saindo: number | null;
};

// Quem está de plantão em `ms`. A troca de turno espera os runs em andamento
// na hora da virada terminarem; o fim do adiamento também sai das atividades.
export function plantaoEm(
  ms: number,
  atividades: readonly AtividadeRotina[],
  cfg: ConfigRotina = ROTINA
): Plantao {
  const turno = turnoNominal(ms, cfg);
  const anterior = turnoNominal(turno.inicio - 1, cfg).pessoa;
  if (anterior === turno.pessoa) {
    return { pessoa: turno.pessoa, adiado: false, trocaEm: turno.inicio, saindo: null };
  }
  const trocaEm = livreApos(turno.inicio, indexarRuns(atividades), cfg);
  if (ms < trocaEm) {
    return { pessoa: anterior, adiado: true, trocaEm, saindo: null };
  }
  return {
    pessoa: turno.pessoa,
    adiado: false,
    trocaEm,
    saindo: ms - trocaEm < cfg.saidaCopaMs ? anterior : null,
  };
}

// ---------------------------------------------------------------- especialistas

export type Local = "mesa" | "copa" | "casa" | "guarita" | "fora";

export type Flags = { aprovacaoPendente: boolean; incidenteAberto: boolean };

type Toque = { t: number; delegacao: boolean; atividade: AtividadeRotina };

// Atividades que "tocam" um agente: as dele e as delegações para ele.
function indexarToques(atividades: readonly AtividadeRotina[]): Map<string, Toque[]> {
  const mapa = new Map<string, Toque[]>();
  const adicionar = (id: string, toque: Toque) => {
    const lista = mapa.get(id) ?? [];
    lista.push(toque);
    mapa.set(id, lista);
  };
  for (const a of atividades) {
    const t = tempo(a);
    if (Number.isNaN(t)) continue;
    adicionar(a.agente, { t, delegacao: false, atividade: a });
    const para = a.tipo === "delegou" ? a.dados?.para : undefined;
    if (typeof para === "string" && para !== a.agente) {
      adicionar(para, { t, delegacao: true, atividade: a });
    }
  }
  for (const lista of mapa.values()) {
    lista.sort((x, y) => x.t - y.t || x.atividade.id - y.atividade.id);
  }
  return mapa;
}

function ultimoToque(toques: Toque[] | undefined, ms: number): Toque | null {
  if (!toques) return null;
  let achado: Toque | null = null;
  for (const toque of toques) {
    if (toque.t > ms) break;
    achado = toque;
  }
  return achado;
}

function localEspecialista(
  id: string,
  ms: number,
  toques: Toque[] | undefined,
  flags: Flags,
  cfg: ConfigRotina
): Local {
  const posto: Local = id === "vigia" ? "guarita" : "mesa";
  // Quem espera aprovação não sai da mesa; o Rui não larga o posto com incidente aberto.
  if (id === "agenda" && flags.aprovacaoPendente) return "mesa";
  if (id === "vigia" && flags.incidenteAberto) return "guarita";
  const ultimo = ultimoToque(toques, ms);
  const recente = ultimo !== null && ms - ultimo.t < cfg.cafeAposMs;
  if (ehNoite(ms, cfg)) {
    // O Rui é o plantão de erros: fica na guarita à noite.
    if (id === "vigia") return "guarita";
    return recente ? "mesa" : "casa";
  }
  return recente ? posto : "copa";
}

export type EstadoAgente = {
  local: Local;
  ativo: boolean;
  espera: boolean;
  detalhe: string | null;
  // O último toque foi uma delegação (volta correndo da copa).
  chamado: boolean;
};

function estadoEspecialista(
  id: string,
  ms: number,
  toques: Toque[] | undefined,
  flags: Flags,
  cfg: ConfigRotina
): EstadoAgente {
  const local = localEspecialista(id, ms, toques, flags, cfg);
  const ultimo = ultimoToque(toques, ms);
  const espera = id === "agenda" && flags.aprovacaoPendente;
  let ativo = false;
  let detalhe: string | null = null;
  if (ultimo && ms - ultimo.t < cfg.ativoMs) {
    if (ultimo.delegacao) {
      ativo = true;
      detalhe = "recebendo tarefa";
    } else if (TIPOS_TRABALHO.has(ultimo.atividade.tipo)) {
      ativo = true;
      detalhe = ultimo.atividade.detalhe ?? null;
    }
  }
  return { local, ativo, espera, detalhe, chamado: !!ultimo?.delegacao };
}

// ---------------------------------------------------------------- copa

export type LugarCopa = number | "pe";
export type OcupanteCopa = { chave: string; lugar: LugarCopa };

type Intervalo = { chave: string; inicio: number; fim: number };

// Intervalos em que um especialista esteve (ou está) na copa, a partir das
// pausas maiores que `cafeAposMs` entre os toques.
function intervalosDeCopa(
  chave: string,
  toques: Toque[] | undefined,
  desde: number,
  ms: number,
  cfg: ConfigRotina
): Intervalo[] {
  const tempos = (toques ?? []).map((t) => t.t).filter((t) => t <= ms);
  const antes = tempos.filter((t) => t < desde);
  const pontos = [antes.length ? antes[antes.length - 1] : Number.NEGATIVE_INFINITY, ...tempos.filter((t) => t >= desde)];
  const intervalos: Intervalo[] = [];
  for (let i = 0; i < pontos.length; i++) {
    const inicio = pontos[i] + cfg.cafeAposMs;
    const fim = i + 1 < pontos.length ? pontos[i + 1] : Number.POSITIVE_INFINITY;
    if (fim - pontos[i] > cfg.cafeAposMs) {
      intervalos.push({ chave, inicio: Math.max(inicio, desde), fim });
    }
  }
  return intervalos.filter((i) => i.fim > i.inicio);
}

// Distribui as cadeiras da copa simulando entradas e saídas em ordem: quem
// chega pega a cadeira livre de menor número; sem cadeira, fica em pé e senta
// na primeira que vagar. Resultado estável e igual em qualquer tela.
function simularCadeiras(
  intervalos: Intervalo[],
  membros: Set<string>,
  ms: number,
  cfg: ConfigRotina
): OcupanteCopa[] {
  const ordem = (chave: string) => {
    const i = ORDEM.indexOf(chave);
    return i < 0 ? ORDEM.length : i;
  };
  type Evento = { t: number; entra: boolean; chave: string };
  const eventos: Evento[] = [];
  for (const i of intervalos) {
    if (i.inicio > ms) continue;
    eventos.push({ t: i.inicio, entra: true, chave: i.chave });
    if (i.fim <= ms) eventos.push({ t: i.fim, entra: false, chave: i.chave });
  }
  eventos.sort((a, b) => a.t - b.t || Number(a.entra) - Number(b.entra) || ordem(a.chave) - ordem(b.chave));

  const cadeiras: (string | null)[] = Array.from({ length: cfg.lugaresCopa }, () => null);
  let fila: string[] = [];
  const sair = (chave: string) => {
    const i = cadeiras.indexOf(chave);
    if (i >= 0) {
      cadeiras[i] = fila.shift() ?? null;
    } else {
      fila = fila.filter((c) => c !== chave);
    }
  };
  const entrar = (chave: string) => {
    if (cadeiras.includes(chave) || fila.includes(chave)) return;
    const livre = cadeiras.indexOf(null);
    if (livre >= 0) cadeiras[livre] = chave;
    else fila.push(chave);
  };
  for (const e of eventos) {
    if (e.entra) entrar(e.chave);
    else sair(e.chave);
  }
  // Quem não está mais na copa (aprovação, incidente, noite) libera a cadeira.
  for (const chave of [...cadeiras, ...fila]) {
    if (chave && !membros.has(chave)) sair(chave);
  }
  for (const chave of Array.from(membros).sort((a, b) => ordem(a) - ordem(b))) entrar(chave);

  return [
    ...cadeiras.flatMap((chave, lugar) => (chave ? [{ chave, lugar }] : [])),
    ...fila.map((chave) => ({ chave, lugar: "pe" as const })),
  ];
}

// "Conversinha": com 2+ sentados, o balão aparece 6 s a cada 18 s.
export function papoVisivel(ms: number, sentados: number): boolean {
  return sentados >= 2 && Math.floor(ms / 6000) % 3 === 0;
}

// Frase de ociosidade que muda a cada 90 s (semente para não mudarem juntas).
export function fraseOciosa(frases: readonly string[], ms: number, semente = 0): string {
  if (frases.length === 0) return "";
  return frases[(Math.floor(ms / 90000) + semente) % frases.length];
}

// ---------------------------------------------------------------- cena

export function chavePessoa(idAgente: string, indice = 0): string {
  return idAgente === "orq" ? `orq:${indice}` : idAgente;
}

export type EntradaCena = Flags & {
  agora: number;
  atividades: readonly AtividadeRotina[];
};

export type Cena = {
  agora: number;
  noite: boolean;
  plantao: Plantao;
  // Estado de cada agente (sala). O do "orq" é o de quem está de plantão.
  agentes: Record<string, EstadoAgente>;
  // Onde está cada pessoa (chave de chavePessoa).
  pessoas: Record<string, Local>;
  copa: OcupanteCopa[];
  papo: boolean;
};

export function derivarCena(entrada: EntradaCena, cfg: ConfigRotina = ROTINA): Cena {
  const { agora, atividades } = entrada;
  const flags: Flags = {
    aprovacaoPendente: entrada.aprovacaoPendente,
    incidenteAberto: entrada.incidenteAberto,
  };
  const noite = ehNoite(agora, cfg);
  const toques = indexarToques(atividades);
  const plantao = plantaoEm(agora, atividades, cfg);

  const agentes: Record<string, EstadoAgente> = {};
  const pessoas: Record<string, Local> = {};
  for (const id of ESPECIALISTAS) {
    agentes[id] = estadoEspecialista(id, agora, toques.get(id), flags, cfg);
    pessoas[id] = agentes[id].local;
  }

  const orq = estadoEspecialista("orq", agora, toques.get("orq"), flags, cfg);
  agentes.orq = { ...orq, local: "mesa", espera: false };
  for (let i = 0; i < cfg.pessoasOrq; i++) {
    pessoas[chavePessoa("orq", i)] =
      i === plantao.pessoa ? "mesa" : i === plantao.saindo ? "copa" : "fora";
  }

  // Cadeiras da copa: simulação a partir do começo do expediente (ou da janela).
  const membros = new Set(Object.keys(pessoas).filter((k) => pessoas[k] === "copa"));
  const expediente = inicioDoDia(agora) + cfg.noiteFimMin * MIN;
  const desde = Math.max(agora - cfg.janelaCopaMs, noite ? agora : expediente);
  const intervalos: Intervalo[] = [];
  if (!noite) {
    for (const id of ESPECIALISTAS) {
      intervalos.push(...intervalosDeCopa(id, toques.get(id), desde, agora, cfg));
    }
  }
  if (plantao.saindo !== null) {
    intervalos.push({
      chave: chavePessoa("orq", plantao.saindo),
      inicio: plantao.trocaEm,
      fim: plantao.trocaEm + cfg.saidaCopaMs,
    });
  }
  const copa = simularCadeiras(intervalos, membros, agora, cfg);
  const sentados = copa.filter((o) => o.lugar !== "pe").length;

  return {
    agora,
    noite,
    plantao,
    agentes,
    pessoas,
    copa,
    papo: !noite && papoVisivel(agora, sentados),
  };
}

// Para onde vai o envelope de uma delegação: a mesa do destino, ou a cadeira
// dele na copa se ele estava lá quando a delegação chegou.
export function destinoEnvelope(
  delegacao: AtividadeRotina,
  entrada: EntradaCena,
  cfg: ConfigRotina = ROTINA
): { para: string; lugarCopa: LugarCopa | null } | null {
  const para = delegacao.dados?.para;
  if (typeof para !== "string") return null;
  const t = tempo(delegacao);
  if (Number.isNaN(t)) return null;
  const antes = derivarCena({ ...entrada, agora: t - 1 }, cfg);
  const ocupante = antes.copa.find((o) => o.chave === chavePessoa(para));
  return { para, lugarCopa: ocupante ? ocupante.lugar : null };
}
