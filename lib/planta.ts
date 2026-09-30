// Geometria da planta do escritório (872×688), a partir do mockup
// docs/mockup-escritorio.dc.html: 3 salas em cima, corredor de madeira,
// 3 salas embaixo (a do meio é a copa) e a guarita na ponta esquerda.
//
// Todo deslocamento passa pelo corredor (y = 344) e entra/sai das salas pelas
// portas. Ninguém anda pela ponta esquerda (guarita): quem vai embora sai
// pela ponta direita.

import { agentePorId, type Sala } from "./agents";

export type Ponto = { x: number; y: number };

export const LARGURA_PLANTA = 872;
export const ALTURA_PLANTA = 688;

export const CORREDOR_Y = 344;
// Saída do escritório (fora da planta, à direita).
export const SAIDA: Ponto = { x: 884, y: CORREDOR_Y };
// Balcão da guarita: o Rui sai para o corredor por aqui.
export const SAIDA_GUARITA: Ponto = { x: 124, y: CORREDOR_Y };
export const ENTRADA_COPA: Ponto = { x: 436, y: 432 };
export const LUGARES_COPA: readonly Ponto[] = [
  { x: 383, y: 548 },
  { x: 489, y: 548 },
  { x: 436, y: 606 },
];
// Perto da máquina de café (quem espera cadeira).
export const EM_PE_COPA: Ponto = { x: 372, y: 504 };

// Onde a pessoa senta na sala (ponto de chegada das caminhadas).
export function pontoMesa(sala: Sala): Ponto {
  return { x: sala.x + 162, y: sala.y + 130 };
}

// Onde o envelope pousa na mesa.
export function pontoEnvelope(sala: Sala): Ponto {
  return { x: sala.x + 140, y: sala.y + 150 };
}

// Posição lógica de uma pessoa: "mesa:<agente>", "copa:0|1|2|pe",
// "guarita", "casa" (foi embora) ou "fora" (orquestrador fora do turno).
export type Posicao = string;

function noCorredor(x: number): Ponto {
  return { x, y: CORREDOR_Y };
}

// Caminho da posição até o corredor.
export function trilha(posicao: Posicao): Ponto[] {
  if (posicao.startsWith("mesa:")) {
    const sala = agentePorId(posicao.slice(5))?.sala;
    if (!sala) return [SAIDA];
    const mesa = pontoMesa(sala);
    return [mesa, noCorredor(mesa.x)];
  }
  if (posicao === "copa:pe") return [EM_PE_COPA, ENTRADA_COPA, noCorredor(ENTRADA_COPA.x)];
  // A cadeira de baixo contorna a mesa redonda pela direita.
  if (posicao === "copa:2") {
    return [LUGARES_COPA[2], { x: 512, y: 606 }, { x: 512, y: 470 }, ENTRADA_COPA, noCorredor(ENTRADA_COPA.x)];
  }
  if (posicao.startsWith("copa:")) {
    const lugar = LUGARES_COPA[Number(posicao.slice(5))] ?? EM_PE_COPA;
    return [lugar, ENTRADA_COPA, noCorredor(ENTRADA_COPA.x)];
  }
  if (posicao === "guarita") return [SAIDA_GUARITA];
  // Orquestrador fora do turno: some (e reaparece) perto da máquina de café.
  if (posicao === "fora") return trilha("copa:pe");
  return [SAIDA];
}

function semRepetidos(pontos: Ponto[]): Ponto[] {
  return pontos.filter((p, i) => i === 0 || p.x !== pontos[i - 1].x || p.y !== pontos[i - 1].y);
}

export function caminho(de: Posicao, para: Posicao): Ponto[] {
  return semRepetidos([...trilha(de), ...trilha(para).reverse()]);
}

// Ponto de partida do envelope de um agente.
function origemEnvelope(idAgente: string): Ponto {
  const sala = agentePorId(idAgente)?.sala;
  return sala ? pontoEnvelope(sala) : SAIDA_GUARITA;
}

// Rota do envelope de uma delegação: sai da mesa de origem, vai ao corredor,
// anda por ele e entra na sala de destino (ou vai até a cadeira da copa).
export function rotaEnvelope(de: string, para: string, lugarCopa: number | "pe" | null): Ponto[] {
  const inicio = origemEnvelope(de);
  if (lugarCopa !== null) {
    const lugar = lugarCopa === "pe" ? EM_PE_COPA : LUGARES_COPA[lugarCopa];
    return semRepetidos([inicio, noCorredor(inicio.x), noCorredor(ENTRADA_COPA.x), ENTRADA_COPA, lugar]);
  }
  const fim = origemEnvelope(para);
  return semRepetidos([inicio, noCorredor(inicio.x), noCorredor(fim.x), fim]);
}
