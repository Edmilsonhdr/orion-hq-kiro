import { test } from "node:test";
import assert from "node:assert/strict";
import { corPessoa, etiquetasDe, filtrarTarefas, fraseHistorico, progresso, raias, filtrosAtivos, FILTROS_VAZIOS, moverLocal, porColuna, posicaoAntesDe, resumoQuadro, rotuloPrazo, situacaoPrazo, type ColunaTarefa, type Filtros, type Tarefa } from "./tarefas.ts";

const COLUNAS: ColunaTarefa[] = [
  { chave: "a_fazer", nome: "A fazer", ordem: 0, concluida: false },
  { chave: "fazendo", nome: "Fazendo", ordem: 1, concluida: false },
  { chave: "em_revisao", nome: "Em revisão", ordem: 2, concluida: false },
  { chave: "feito", nome: "Feito", ordem: 3, concluida: true },
];
const col = (chave: string) => COLUNAS.find((c) => c.chave === chave) as ColunaTarefa;

const t = (id: number, status: string, ordem: number, responsavel = "dimi", prazo: string | null = null): Tarefa => ({
  id, titulo: `T${id}`, descricao: null, status, prioridade: "normal", responsavel, criado_por: "dimi", prazo,
  ordem, criado_em: "", atualizado_em: "", concluida_em: null, documento_id: null, negocio_id: null,
  documento_titulo: null, negocio_titulo: null, organizacao_nome: null, coluna_concluida: status === "feito",
});

test("situação do prazo", () => {
  const base = { coluna_concluida: false };
  assert.equal(situacaoPrazo({ prazo: "2026-10-28", ...base }, "2026-10-29"), "vencida");
  assert.equal(situacaoPrazo({ prazo: "2026-10-29", ...base }, "2026-10-29"), "hoje");
  assert.equal(situacaoPrazo({ prazo: "2026-10-31", ...base }, "2026-10-29"), "proxima");
  assert.equal(situacaoPrazo({ prazo: "2026-11-30", ...base }, "2026-10-29"), "ok");
  assert.equal(situacaoPrazo({ prazo: "2020-01-01", coluna_concluida: true }, "2026-10-29"), null);
  assert.equal(situacaoPrazo({ prazo: null, ...base }, "2026-10-29"), null);
});

test("porColuna respeita a ordem manual, inclui colunas vazias e acolhe status desconhecido", () => {
  const c = porColuna([t(1, "a_fazer", 2), t(2, "a_fazer", 0), t(3, "feito", 0), t(4, "coluna_apagada", 5)], COLUNAS);
  assert.deepEqual(c.a_fazer.map((x) => x.id), [2, 1, 4]);
  assert.deepEqual(c.feito.map((x) => x.id), [3]);
  assert.deepEqual(c.em_revisao, []);
});

test("moverLocal muda de coluna, insere na posição e marca a conclusão", () => {
  const base = [t(1, "a_fazer", 0), t(2, "a_fazer", 1), t(3, "fazendo", 0)];
  const c = porColuna(moverLocal(base, 1, col("fazendo"), 0), COLUNAS);
  assert.deepEqual(c.fazendo.map((x) => x.id), [1, 3]);
  assert.deepEqual(c.a_fazer.map((x) => x.id), [2]);
  assert.deepEqual(porColuna(moverLocal(base, 1, col("fazendo")), COLUNAS).fazendo.map((x) => x.id), [3, 1]);
  const feita = moverLocal(base, 1, col("feito")).find((x) => x.id === 1);
  assert.ok(feita?.concluida_em && feita.coluna_concluida);
  const reaberta = moverLocal([{ ...base[0], status: "feito", concluida_em: "x", coluna_concluida: true }], 1, col("em_revisao"))[0];
  assert.equal(reaberta.concluida_em, null);
  assert.equal(reaberta.coluna_concluida, false);
});

test("posicaoAntesDe só vale entre tarefas da mesma pessoa", () => {
  const l = [t(1, "a_fazer", 0), t(2, "fazendo", 0), t(3, "fazendo", 1), t(4, "fazendo", 2, "rayssa")];
  assert.equal(posicaoAntesDe(l, 1, 3), 1);
  assert.equal(posicaoAntesDe(l, 1, 2), 0);
  assert.equal(posicaoAntesDe(l, 1, 4), undefined);
  assert.equal(posicaoAntesDe(l, 3, 2), 0);
});

test("filtros: busca sem acento, prioridade e prazo", () => {
  const hoje = "2026-11-23";
  const lista = [
    { ...t(1, "a_fazer", 0, "dimi", "2026-11-20"), titulo: "Revisão do contrato", prioridade: "alta" as const },
    { ...t(2, "a_fazer", 1, "dimi", "2026-11-23"), titulo: "Build do app" },
    { ...t(3, "fazendo", 0, "rayssa", "2026-11-27"), titulo: "Landing", descricao: "textos para clínicas" },
    { ...t(4, "a_fazer", 2, "dimi", null), titulo: "Sem data" },
    { ...t(5, "feito", 0, "dimi", "2026-11-01"), titulo: "Já feita" },
  ];
  const ids = (f: Partial<Filtros>) => filtrarTarefas(lista, { ...FILTROS_VAZIOS, ...f }, hoje).map((x) => x.id);
  assert.deepEqual(ids({}), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids({ busca: "revisao" }), [1]);
  assert.deepEqual(ids({ busca: "CLINICAS" }), [3]);
  assert.deepEqual(ids({ busca: "rayssa" }), [3]);
  assert.deepEqual(ids({ prioridade: "alta" }), [1]);
  assert.deepEqual(ids({ prazo: "vencidas" }), [1]);
  assert.deepEqual(ids({ prazo: "hoje" }), [2]);
  assert.deepEqual(ids({ prazo: "semana" }), [2, 3]);
  assert.deepEqual(ids({ prazo: "sem_prazo" }), [4]);
  assert.equal(filtrosAtivos({ busca: " ", prazo: "hoje", prioridade: "alta" }), 2);
});

test("resumo do quadro: abertas, vencidas, para hoje e feitas na semana", () => {
  const hoje = "2026-11-23";
  const lista = [
    t(1, "a_fazer", 0, "dimi", "2026-11-20"),
    t(2, "a_fazer", 1, "dimi", "2026-11-23"),
    t(3, "fazendo", 0, "dimi", null),
    { ...t(4, "feito", 0), concluida_em: "2026-11-22T10:00:00Z" },
    { ...t(5, "feito", 1), concluida_em: "2026-11-10T10:00:00Z" },
  ];
  assert.deepEqual(resumoQuadro(lista, hoje), { abertas: 3, vencidas: 1, paraHoje: 1, feitas7: 1 });
});

test("prazo em palavras", () => {
  const hoje = "2026-11-23";
  assert.equal(rotuloPrazo("2026-11-23", hoje), "Hoje");
  assert.equal(rotuloPrazo("2026-11-24", hoje), "Amanhã");
  assert.equal(rotuloPrazo("2026-11-22", hoje), "Ontem");
  assert.equal(rotuloPrazo("2026-11-20", hoje), "Há 3 dias");
  assert.equal(rotuloPrazo("2026-11-27", hoje), "Em 4 dias");
  assert.equal(rotuloPrazo("2026-12-15", hoje), "15 dez");
  assert.equal(rotuloPrazo("2027-01-05", hoje), "5 jan 2027");
  assert.equal(corPessoa("dimi"), corPessoa("dimi"));
});

test("cada sócia tem uma cor própria", () => {
  const cores = ["dimi", "jullyana", "rayssa"].map(corPessoa);
  assert.equal(new Set(cores).size, 3);
  assert.equal(corPessoa("dimi"), "#4c8dff");
});

test("filtros do estilo Jira: tipo, etiqueta, épico e filtros rápidos", () => {
  const bug = { ...t(1, "a_fazer", 0), tipo: "bug" as const, etiquetas: ["app"], epico_id: 9, epico_titulo: "Lojas", prioridade: "alta" as const };
  const comum = { ...t(2, "a_fazer", 1), tipo: "tarefa" as const, etiquetas: ["web"], bloqueios_abertos: 1, atualizado_em: new Date().toISOString() };
  const lista = [bug, comum];
  const so = (f: Partial<Filtros>) => filtrarTarefas(lista, { ...FILTROS_VAZIOS, ...f }, "2026-11-23").map((x) => x.id);
  assert.deepEqual(so({ tipo: "bug" }), [1]);
  assert.deepEqual(so({ etiqueta: "web" }), [2]);
  assert.deepEqual(so({ epico: 9 }), [1]);
  assert.deepEqual(so({ epico: "sem" }), [2]);
  assert.deepEqual(so({ rapidos: ["alta"] }), [1]);
  assert.deepEqual(so({ rapidos: ["bloqueadas"] }), [2]);
  assert.deepEqual(so({ rapidos: ["recentes"] }), [2]);
  assert.deepEqual(so({ busca: "ori-2" }), [2]);
  assert.equal(filtrosAtivos({ ...FILTROS_VAZIOS, tipo: "bug", rapidos: ["alta", "bugs"] }), 3);
  assert.deepEqual(etiquetasDe(lista), ["app", "web"]);
});

test("raias por pessoa e por épico (sem épico por último)", () => {
  const a = { ...t(1, "a_fazer", 0, "rayssa"), epico_id: 5, epico_titulo: "Beta" };
  const b = { ...t(2, "a_fazer", 0, "dimi") };
  assert.deepEqual(raias([a, b], "pessoa").map((r) => r.titulo), ["dimi", "rayssa"]);
  assert.deepEqual(raias([b, a], "epico").map((r) => r.titulo), ["Beta", "Sem épico"]);
  assert.equal(raias([a, b], "nenhum").length, 1);
});

test("frases do histórico e progresso", () => {
  assert.equal(fraseHistorico({ campo: "criada", de: null, para: "X" }), "criou a tarefa");
  assert.equal(fraseHistorico({ campo: "status", de: "A fazer", para: "Fazendo" }), "mudou o status de A fazer para Fazendo");
  assert.equal(fraseHistorico({ campo: "pontos", de: null, para: "3" }), "definiu os pontos como 3");
  assert.equal(fraseHistorico({ campo: "sprint_id", de: "Sprint 1", para: null }), "tirou a sprint (Sprint 1)");
  assert.equal(progresso(1, 3), 33);
  assert.equal(progresso(0, 0), 0);
});
