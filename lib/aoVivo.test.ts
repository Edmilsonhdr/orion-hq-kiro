// Testes do estado ao vivo dos agentes: `npm run test:front` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";

import { estadoAoVivo, type AtividadeViva } from "./aoVivo.ts";

const AGORA = Date.parse("2026-11-02T15:00:00Z");
const ha = (s: number) => new Date(AGORA - s * 1000).toISOString();
const ativ = (agente: string, tipo: string, s: number, detalhe: string | null = null): AtividadeViva => ({
  agente,
  tipo,
  detalhe,
  criado_em: ha(s),
});

test("sem atividade, o agente está ocioso", () => {
  assert.deepEqual(estadoAoVivo([], "tech", AGORA), { estado: "ocioso", detalhe: null, haMs: null });
});

test("atividade recente de trabalho vira trabalhando, com o detalhe", () => {
  const r = estadoAoVivo([ativ("tech", "ferramenta", 5, "lendo o changelog")], "tech", AGORA);
  assert.equal(r.estado, "trabalhando");
  assert.equal(r.detalhe, "lendo o changelog");
});

test("atividade antiga volta a ocioso", () => {
  assert.equal(estadoAoVivo([ativ("tech", "pensando", 120)], "tech", AGORA).estado, "ocioso");
});

test("fim de ciclo deixa ocioso mesmo se recente", () => {
  const lista = [ativ("tech", "inicio", 8), ativ("tech", "concluiu", 2)];
  assert.equal(estadoAoVivo(lista, "tech", AGORA).estado, "ocioso");
});

test("pedido de aprovação recente vira aguardando", () => {
  const r = estadoAoVivo([ativ("agenda", "aguardando_aprovacao", 600, "Reunião de sexta")], "agenda", AGORA);
  assert.equal(r.estado, "aguardando");
  assert.equal(r.detalhe, "Reunião de sexta");
});

test("considera só o agente pedido e a atividade mais nova", () => {
  const lista = [ativ("tech", "inicio", 50), ativ("negocios", "ferramenta", 3), ativ("tech", "pensando", 4)];
  assert.equal(estadoAoVivo(lista, "tech", AGORA).estado, "trabalhando");
  assert.equal(estadoAoVivo(lista, "vigia", AGORA).estado, "ocioso");
});
