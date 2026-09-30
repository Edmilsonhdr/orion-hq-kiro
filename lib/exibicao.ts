// Nome e cor de exibição de um agente num instante: para o Orquestrador, é
// quem estava de plantão naquele horário (lib/rotina.ts). O banco continua
// guardando só os ids ("orq", "Orquestrador" no chat).

import { agentePorId, pessoaDoAgente, type Pessoa } from "./agents";
import { plantaoEm, type AtividadeRotina } from "./rotina";

export function pessoaEm(
  idAgente: string,
  criadoEm: string,
  atividades: readonly AtividadeRotina[]
): Pessoa | null {
  const agente = agentePorId(idAgente);
  if (!agente) return null;
  if (agente.pessoas.length === 1) return agente.pessoas[0];
  const t = Date.parse(criadoEm);
  const indice = Number.isNaN(t) ? 0 : plantaoEm(t, atividades).pessoa;
  return pessoaDoAgente(agente, indice);
}

export function nomeEm(idAgente: string, criadoEm: string, atividades: readonly AtividadeRotina[]): string {
  return pessoaEm(idAgente, criadoEm, atividades)?.nome ?? idAgente;
}
