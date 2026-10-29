"use client";

// Painel do agente escolhido no Escritório: o que ele está fazendo, tokens do dia, últimas atividades
// e atalhos (perguntar no chat, ver aprovações). Apresentação pura; os dados vêm da página.

import Link from "next/link";
import { agentePorId, pessoaDoAgente } from "../lib/agents";
import type { Atividade } from "./Office";

const TIPO_ROTULO: Record<string, string> = {
  inicio: "recebeu um pedido",
  pensando: "pensando",
  delegou: "delegou",
  ferramenta: "usou uma ferramenta",
  aguardando_aprovacao: "aguardando aprovação",
  concluiu: "concluiu",
  resposta: "respondeu",
  erro: "teve um erro",
};

const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

export default function PainelAgente({
  id,
  atividades,
  tokens,
  agora,
  onFechar,
}: {
  id: string;
  atividades: Atividade[];
  tokens: number;
  agora: number | null;
  onFechar: () => void;
}) {
  const agente = agentePorId(id);
  if (!agente) return null;
  const nomes = agente.pessoas.map((p) => p.nome).join(" / ");
  const deles = atividades.filter((a) => a.agente === id).sort((a, b) => b.id - a.id);
  const ultima = deles[0];
  const idadeMs = ultima && agora !== null ? agora - new Date(ultima.criado_em).getTime() : null;
  const situacao =
    !ultima
      ? "sem atividade registrada"
      : idadeMs !== null && idadeMs < 30_000
        ? `agora: ${TIPO_ROTULO[ultima.tipo] ?? ultima.tipo}`
        : `última ação: ${TIPO_ROTULO[ultima.tipo] ?? ultima.tipo} às ${formatoHora.format(new Date(ultima.criado_em))}`;
  const pergunta = id === "orq" ? "" : `Pergunte ao ${agente.papel}: `;

  return (
    <section className="painel esc-painel esc-agente" aria-label={`Painel de ${agente.papel}`} style={{ ["--cor" as string]: agente.cor }}>
      <header className="esc-painel-topo">
        <h3 className="titulo-pixel">{agente.papel}</h3>
        <button type="button" className="esc-limpar" onClick={onFechar}>
          fechar
        </button>
      </header>
      <p className="esc-agente-sub">
        {nomes} · <span className="mono">{agente.nivel}</span>
      </p>
      <dl className="esc-agente-dados">
        <div>
          <dt>Situação</dt>
          <dd>{situacao}</dd>
        </div>
        <div>
          <dt>Tokens hoje</dt>
          <dd className="mono">{new Intl.NumberFormat("pt-BR").format(tokens)}</dd>
        </div>
      </dl>
      {deles.length > 0 && (
        <ul className="esc-agente-ultimas">
          {deles.slice(0, 4).map((a) => (
            <li key={a.id}>
              <span className="mono texto-secundario">{formatoHora.format(new Date(a.criado_em))}</span>{" "}
              {a.detalhe || TIPO_ROTULO[a.tipo] || a.tipo}
            </li>
          ))}
        </ul>
      )}
      <div className="esc-agente-acoes">
        <Link href={`/chat?msg=${encodeURIComponent(pergunta)}`} className="botao botao-destaque">
          Perguntar no chat
        </Link>
        <Link href="/aprovacoes" className="botao">
          Ver aprovações
        </Link>
      </div>
    </section>
  );
}
