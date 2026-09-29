// Testes da rotina do escritório: `npm run test:front` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROTINA,
  derivarCena,
  destinoEnvelope,
  ehNoite,
  papoVisivel,
  plantaoEm,
  turnoNominal,
  type AtividadeRotina,
  type EntradaCena,
} from "./rotina.ts";

// Horário de São Paulo (UTC-3, sem horário de verão).
function sp(hhmm: string, dia = "2026-09-28"): number {
  return Date.parse(`${dia}T${hhmm.length === 5 ? `${hhmm}:00` : hhmm}-03:00`);
}

let proximoId = 1;
function atv(
  agente: string,
  tipo: string,
  ms: number,
  extra: Partial<AtividadeRotina> = {}
): AtividadeRotina {
  return {
    id: proximoId++,
    run_id: "run-1",
    agente,
    tipo,
    detalhe: `${agente} ${tipo}`,
    dados: {},
    criado_em: new Date(ms).toISOString(),
    ...extra,
  };
}

function cena(agora: number, atividades: AtividadeRotina[], flags: Partial<EntradaCena> = {}) {
  return derivarCena({
    agora,
    atividades,
    aprovacaoPendente: false,
    incidenteAberto: false,
    ...flags,
  });
}

const ATLAS = 0;
const NARA = 1;

test("plantão pelo horário: bordas dos turnos de 90 minutos", () => {
  assert.equal(plantaoEm(sp("00:00"), []).pessoa, ATLAS);
  assert.equal(plantaoEm(sp("01:29:59"), []).pessoa, ATLAS);
  assert.equal(plantaoEm(sp("01:30"), []).pessoa, NARA);
  assert.equal(plantaoEm(sp("02:59:59"), []).pessoa, NARA);
  assert.equal(plantaoEm(sp("03:00"), []).pessoa, ATLAS);
  assert.equal(plantaoEm(sp("23:59:59"), []).pessoa, NARA);
  assert.equal(turnoNominal(sp("13:45")).inicio, sp("13:30"));
});

test("sala do chefe nunca fica vazia: exatamente um orq na mesa", () => {
  for (let m = 0; m < 24 * 60; m += 7) {
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const c = cena(sp(hhmm), []);
    const naMesa = ["orq:0", "orq:1"].filter((k) => c.pessoas[k] === "mesa");
    assert.equal(naMesa.length, 1, hhmm);
  }
});

test("quem sai do turno vai pra copa por alguns minutos e depois some", () => {
  const logo = cena(sp("01:31"), []);
  assert.equal(logo.pessoas["orq:1"], "mesa");
  assert.equal(logo.pessoas["orq:0"], "copa");
  assert.ok(logo.copa.some((o) => o.chave === "orq:0"));
  const depois = cena(sp("01:36"), []);
  assert.equal(depois.pessoas["orq:0"], "fora");
  assert.ok(!depois.copa.some((o) => o.chave === "orq:0"));
});

test("troca adiada enquanto um run está em andamento, e o fim sai das atividades", () => {
  const atividades = [
    atv("orq", "inicio", sp("01:29")),
    atv("orq", "delegou", sp("01:29:30"), { dados: { de: "orq", para: "tech" } }),
    atv("tech", "ferramenta", sp("01:30:30")),
    atv("tech", "pensando", sp("01:31:30")),
    atv("orq", "resposta", sp("01:32")),
  ];
  const durante = plantaoEm(sp("01:31"), atividades);
  assert.equal(durante.pessoa, ATLAS);
  assert.equal(durante.adiado, true);
  assert.equal(durante.trocaEm, sp("01:32"));

  const apos = plantaoEm(sp("01:32:01"), atividades);
  assert.equal(apos.pessoa, NARA);
  assert.equal(apos.saindo, ATLAS);
});

test("run travado não prende o plantão para sempre", () => {
  const atividades = [atv("orq", "inicio", sp("01:29"))];
  // Sem atividade por runParadoMs, o run deixa de contar.
  assert.equal(plantaoEm(sp("01:30:30"), atividades).pessoa, ATLAS);
  assert.equal(plantaoEm(sp("01:31:01"), atividades).pessoa, NARA);
});

test("run que começa depois da virada não adia a troca", () => {
  const atividades = [atv("orq", "inicio", sp("01:30:10")), atv("orq", "resposta", sp("01:35"))];
  assert.equal(plantaoEm(sp("01:31"), atividades).pessoa, NARA);
});

test("especialista entra na copa só depois de 2 minutos ocioso", () => {
  const fim = sp("10:00");
  const atividades = [atv("tech", "ferramenta", fim - 10_000), atv("tech", "resposta", fim)];
  assert.equal(cena(fim + 60_000, atividades).pessoas.tech, "mesa");
  assert.equal(cena(fim + ROTINA.cafeAposMs - 1, atividades).pessoas.tech, "mesa");
  const naCopa = cena(fim + ROTINA.cafeAposMs + 1, atividades);
  assert.equal(naCopa.pessoas.tech, "copa");
  assert.ok(naCopa.copa.some((o) => o.chave === "tech"));
});

test("delegação para quem está na copa traz a pessoa de volta e o envelope vai pra copa", () => {
  const base = [atv("tech", "resposta", sp("09:00"))];
  const delegou = atv("orq", "delegou", sp("10:00"), { dados: { de: "orq", para: "tech" } });
  const atividades = [...base, atv("orq", "inicio", sp("09:59:50")), delegou];
  const entrada: EntradaCena = {
    agora: sp("10:00:05"),
    atividades,
    aprovacaoPendente: false,
    incidenteAberto: false,
  };
  const c = derivarCena(entrada);
  assert.equal(c.pessoas.tech, "mesa");
  assert.equal(c.agentes.tech.ativo, true);
  assert.equal(c.agentes.tech.chamado, true);
  const destino = destinoEnvelope(delegou, entrada);
  assert.ok(destino && destino.lugarCopa !== null);
});

test("copa tem 3 cadeiras; o quarto fica em pé e senta quando vaga", () => {
  const atividades = [
    atv("tech", "resposta", sp("09:00")),
    atv("negocios", "resposta", sp("09:01")),
    atv("work", "resposta", sp("09:02")),
    atv("agenda", "resposta", sp("09:03")),
    atv("vigia", "resposta", sp("09:04")),
  ];
  const c = cena(sp("09:30"), atividades);
  const sentados = c.copa.filter((o) => o.lugar !== "pe").map((o) => o.chave);
  const empe = c.copa.filter((o) => o.lugar === "pe").map((o) => o.chave);
  assert.deepEqual(sentados, ["tech", "negocios", "work"]);
  assert.deepEqual(empe, ["agenda", "vigia"]);

  // O Tobias volta a trabalhar: a Lia (primeira da fila) pega a cadeira dele.
  const depois = cena(sp("09:31"), [...atividades, atv("tech", "inicio", sp("09:30:30"))]);
  const lugarLia = depois.copa.find((o) => o.chave === "agenda");
  assert.equal(lugarLia?.lugar, 0);
  assert.equal(depois.copa.find((o) => o.chave === "negocios")?.lugar, 1);
});

test("mesmos dados e mesmo instante produzem a mesma cena", () => {
  const atividades = [atv("tech", "resposta", sp("09:00")), atv("work", "resposta", sp("09:10"))];
  assert.deepEqual(cena(sp("09:40"), atividades), cena(sp("09:40"), [...atividades].reverse()));
});

test("Lia esperando aprovação não vai pra copa", () => {
  const atividades = [atv("agenda", "aguardando_aprovacao", sp("09:00"))];
  const c = cena(sp("10:00"), atividades, { aprovacaoPendente: true });
  assert.equal(c.pessoas.agenda, "mesa");
  assert.equal(c.agentes.agenda.espera, true);
  assert.ok(!c.copa.some((o) => o.chave === "agenda"));
  assert.equal(cena(sp("10:00"), atividades).pessoas.agenda, "copa");
});

test("Rui não sai da guarita com incidente aberto", () => {
  const c = cena(sp("10:00"), [], { incidenteAberto: true });
  assert.equal(c.pessoas.vigia, "guarita");
  assert.equal(cena(sp("10:00"), []).pessoas.vigia, "copa");
});

test("noite sem trabalho: especialistas em casa, orq de plantão e Rui na guarita", () => {
  assert.equal(ehNoite(sp("19:00")), true);
  assert.equal(ehNoite(sp("07:59")), true);
  assert.equal(ehNoite(sp("08:00")), false);
  const c = cena(sp("21:20"), []);
  for (const id of ["tech", "agenda", "negocios", "work"]) assert.equal(c.pessoas[id], "casa", id);
  assert.equal(c.pessoas.vigia, "guarita");
  assert.equal(c.noite, true);
  assert.equal(c.copa.length, 0);
  assert.equal(["orq:0", "orq:1"].filter((k) => c.pessoas[k] === "mesa").length, 1);
});

test("noite com trabalho: a pessoa aparece na mesa e sai 2 min depois de terminar", () => {
  const atividades = [
    atv("orq", "delegou", sp("21:00"), { dados: { de: "orq", para: "negocios" } }),
    atv("negocios", "ferramenta", sp("21:00:10")),
    atv("negocios", "resposta", sp("21:01")),
  ];
  const trabalhando = cena(sp("21:00:15"), atividades);
  assert.equal(trabalhando.pessoas.negocios, "mesa");
  assert.equal(trabalhando.agentes.negocios.ativo, true);
  assert.equal(cena(sp("21:02:59"), atividades).pessoas.negocios, "mesa");
  assert.equal(cena(sp("21:03:01"), atividades).pessoas.negocios, "casa");
});

test("assinatura do chat pelo horário da mensagem, não pelo horário atual", () => {
  // Mensagem das 01:20 é do Atlas mesmo lida às 02:00 (turno da Nara).
  assert.equal(plantaoEm(sp("01:20"), []).pessoa, ATLAS);
  assert.equal(plantaoEm(sp("02:00"), []).pessoa, NARA);
  // Com run atravessando a virada, a resposta das 01:31 ainda é do Atlas.
  const atividades = [atv("orq", "inicio", sp("01:29:30")), atv("orq", "resposta", sp("01:31:15"))];
  assert.equal(plantaoEm(sp("01:31"), atividades).pessoa, ATLAS);
});

test("conversinha só com 2 ou mais sentados", () => {
  const instante = 18000 * 10;
  assert.equal(papoVisivel(instante, 1), false);
  assert.equal(papoVisivel(instante, 2), true);
  assert.equal(papoVisivel(instante + 6000, 2), false);
});
