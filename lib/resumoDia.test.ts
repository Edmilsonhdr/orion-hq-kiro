import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoDoDia, type EntradaDia } from "./resumoDia.ts";

const vazio: EntradaDia = { aprovacoes: 0, vencidos: [], hoje: [], parados: [], pilotos: [], mencoes: 0, incidentes: 0 };
const neg = (id: number, org: string) => ({ id, titulo: `T${id}`, organizacao_nome: org });

test("dia sem pendências devolve lista vazia", () => {
  assert.deepEqual(resumoDoDia(vazio), []);
});

test("prioriza alertas e traduz singular/plural", () => {
  const r = resumoDoDia({
    ...vazio,
    aprovacoes: 1,
    incidentes: 2,
    vencidos: [neg(1, "Clínica Sol"), neg(2, "Dr. Leo")],
    parados: [neg(3, "Studio Fit")],
    pilotos: [{ organizacao_nome: "Clínica Sol", dias_no_piloto: 12 }],
    mencoes: 3,
  });
  assert.deepEqual(r.map((i) => i.chave), ["incidentes", "vencidos", "aprovacoes", "parados", "pilotos", "mencoes"]);
  assert.equal(r[0].texto, "2 incidentes abertos");
  assert.equal(r[0].alerta, true);
  assert.equal(r[1].texto, "2 passos vencidos no Comercial");
  assert.deepEqual(r[1].detalhes, ["Clínica Sol", "Dr. Leo"]);
  assert.equal(r[2].texto, "1 aprovação esperando você");
  assert.equal(r[3].texto, "1 negócio parado há mais de 7 dias");
  assert.equal(r[4].texto, "1 piloto em andamento (o mais antigo há 12 dias)");
});

test("inclui as tarefas da pessoa: vencidas como alerta, as de hoje depois", () => {
  const r = resumoDoDia({ ...vazio, tarefasVencidas: ["Enviar proposta"], tarefasHoje: ["Ligar para Ana", "Revisar contrato"] });
  assert.deepEqual(r.map((i) => i.chave), ["tarefas-vencidas", "tarefas-hoje"]);
  assert.equal(r[0].texto, "1 tarefa sua vencida");
  assert.equal(r[0].alerta, true);
  assert.equal(r[1].texto, "2 tarefas suas para hoje");
  assert.deepEqual(r[1].detalhes, ["Ligar para Ana", "Revisar contrato"]);
});
