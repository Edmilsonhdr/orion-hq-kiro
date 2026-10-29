import { test } from "node:test";
import assert from "node:assert/strict";
import type { Negocio } from "./comercial";
import {
  ETAPAS,
  ETAPAS_ABERTAS,
  formatarDia,
  formatarReais,
  hojeISO,
  modelosDeMensagem,
  numeroOuNulo,
  resumoPorEtapa,
  porcentagem,
  situacaoPasso,
  somarDias,
  resumoRapido,
  sugerirProximosPassos,
  formatarTamanho,
} from "./comercial.ts";

test("etapas na ordem do funil, com cinco abertas", () => {
  assert.deepEqual([...ETAPAS_ABERTAS], ["lead", "contato", "demonstracao", "piloto", "proposta"]);
  assert.equal(ETAPAS.at(-1), "perdido");
});

test("formata reais e dias sem depender do fuso", () => {
  assert.match(formatarReais(1490.5).replace(/\s/g, " "), /^R\$ 1\.490,50$/);
  assert.equal(formatarReais(null), "—");
  assert.equal(formatarDia("2026-11-05"), "05/11/2026");
  assert.equal(formatarDia("2026-11-05T02:00:00+00:00"), "05/11/2026");
  assert.equal(formatarDia(null), "—");
});

test("hojeISO usa o fuso de São Paulo", () => {
  // 02:00 UTC de 06/11 ainda é 05/11 em São Paulo (UTC-3).
  assert.equal(hojeISO(new Date("2026-11-06T02:00:00Z")), "2026-11-05");
});

test("situação do próximo passo", () => {
  assert.equal(situacaoPasso("2026-11-04", "2026-11-05"), "vencido");
  assert.equal(situacaoPasso("2026-11-05", "2026-11-05"), "hoje");
  assert.equal(situacaoPasso("2026-11-06", "2026-11-05"), "ok");
  assert.equal(situacaoPasso(null, "2026-11-05"), "sem");
});

test("porcentagem e números do formulário", () => {
  assert.equal(porcentagem(0.5), "50%");
  assert.equal(porcentagem(null), "—");
  assert.equal(numeroOuNulo(" 12,5 "), 12.5);
  assert.equal(numeroOuNulo(""), null);
  assert.ok(Number.isNaN(numeroOuNulo("abc")));
});

test("resumoPorEtapa soma só etapas em aberto", () => {
  const base = { valor_mensal: null } as Negocio;
  const linhas = resumoPorEtapa([
    { ...base, etapa: "lead", valor_mensal: 100 },
    { ...base, etapa: "lead", valor_mensal: 50 },
    { ...base, etapa: "ganho", valor_mensal: 999 },
  ]);
  assert.equal(linhas.find((l) => l.etapa === "lead")?.quantidade, 2);
  assert.equal(linhas.find((l) => l.etapa === "lead")?.valor, 150);
  assert.equal(linhas.some((l) => l.etapa === "ganho"), false);
});

test("modelosDeMensagem usa o primeiro nome e não inclui preço", () => {
  const ms = modelosDeMensagem({ organizacao_nome: "Clínica Sol", organizacao_tipo: "clinica", plano_interesse: null }, "Ana Souza", "Jullyana");
  assert.equal(ms.length, 5);
  assert.match(ms[0].texto, /Olá, Ana!/);
  assert.ok(ms.every((m) => !/R\$/.test(m.texto)));
  assert.equal(ms[0].assunto, "Conheça o Orion para Clínica Sol");
  const auto = modelosDeMensagem({ organizacao_nome: "Dr. Leo", organizacao_tipo: "autonomo", plano_interesse: null }, null, "Jullyana");
  assert.match(auto[0].texto, /o seu trabalho/);
});

test("somarDias atravessa mês e ano", () => {
  assert.equal(somarDias("2026-10-29", 3), "2026-11-01");
  assert.equal(somarDias("2026-12-30", 3), "2027-01-02");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
});

test("resumoRapido e sugestões de próximo passo", () => {
  assert.equal(resumoRapido("ligacao", "Ana"), "Liguei com Ana.");
  assert.equal(resumoRapido("whatsapp", null), "Conversei no WhatsApp.");
  assert.equal(sugerirProximosPassos("piloto", "ligacao")[0].texto, "Acompanhar o uso do piloto");
  assert.equal(sugerirProximosPassos("proposta", "reuniao")[0].texto, "Enviar resumo da reunião");
  assert.equal(sugerirProximosPassos("ganho", "nota")[0].texto, "Retomar o contato");
});

test("formatarTamanho", () => {
  assert.equal(formatarTamanho(512), "512 B");
  assert.equal(formatarTamanho(2048), "2 KB");
  assert.equal(formatarTamanho(3 * 1024 * 1024 + 512 * 1024), "3,5 MB");
});
