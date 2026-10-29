"use client";

// Cartão de aprovação (Requirements 9.1, 9.3).
// Mostra a proposta de forma legível, quem pediu e quando, com botões
// Aprovar/Recusar. Reutilizável no topo do chat e na tela de aprovações.
// A decisão é delegada ao pai via `onDecidir(id, aprovado)`.

import Markdown from "./Markdown";
import { agentePorId } from "../lib/agents";
import { nomeEm } from "../lib/exibicao";

export type Aprovacao = {
  id: number;
  tipo: string;
  proposta: PropostaReuniao | Record<string, unknown>;
  pedido_por: string | null;
  status: string;
  aprovado?: boolean | null;
  decidido_por: string | null;
  criado_em: string;
  decidido_em: string | null;
};

// Propostas de documento (Docs): criar = campos soltos; editar = `campos` com o que muda.
type PropostaDocumento = {
  acao?: "criar" | "editar";
  titulo?: string;
  conteudo?: string;
  pasta?: string | null;
  tags?: string[];
  documento_id?: number;
  documento_titulo?: string;
  campos?: { titulo?: string; conteudo?: string; pasta?: string | null; tags?: string[] };
};

const TIPOS_DOCUMENTO = ["criar_documento", "editar_documento"];
const TIPOS_COMERCIAL = ["comercial_novo_negocio", "comercial_atualizar_negocio", "comercial_interacao"];

type PropostaComercial = {
  acao?: string;
  organizacao_nome?: string;
  organizacao_tipo?: string;
  negocio_id?: number;
  negocio_titulo?: string;
  etapa_origem?: string;
  etapa?: string | null;
  motivo_perda?: string | null;
  tipo?: string;
  resumo?: string;
  campos?: Record<string, string | number | null>;
};

const ROTULO_CAMPO: Record<string, string> = {
  titulo: "Título",
  valor_mensal: "Valor mensal (R$)",
  pacientes_ativos: "Pacientes/alunos ativos",
  plano_interesse: "Pacote",
  usa_hoje: "Usa hoje",
  origem: "Origem",
  responsavel: "Responsável",
  proximo_passo: "Próximo passo",
  proximo_passo_em: "Data do próximo passo",
};
const PREVIA_MAX = 1500;

type PropostaReuniao = {
  titulo?: string;
  inicio?: string;
  duracao_min?: number;
  participantes?: string[];
  pauta?: string[];
};

function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

// `pedido_por` pode ser um id de agente ("agenda"): mostra "Lia (Agenda)".
function quemPediu(pedidoPor: string, criadoEm: string): string {
  const agente = agentePorId(pedidoPor);
  if (!agente) return pedidoPor;
  return `${nomeEm(agente.id, criadoEm, [])} (${agente.papel})`;
}

function DetalhesDocumento({ proposta }: { proposta: PropostaDocumento }) {
  const editar = proposta.acao === "editar";
  const dados = editar ? proposta.campos ?? {} : proposta;
  const conteudo = dados.conteudo ?? "";
  const previa =
    conteudo.length > PREVIA_MAX ? `${conteudo.slice(0, PREVIA_MAX)}\n\n…` : conteudo;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div>
        <span className="texto-secundario">Ação: </span>
        <span>
          {editar
            ? `Editar o documento #${proposta.documento_id} “${proposta.documento_titulo ?? ""}”`
            : "Criar um documento novo"}
        </span>
      </div>
      {editar && dados.titulo && (
        <div>
          <span className="texto-secundario">Novo título: </span>
          <span>{dados.titulo}</span>
        </div>
      )}
      {dados.pasta !== undefined && (
        <div>
          <span className="texto-secundario">Pasta: </span>
          <span>{dados.pasta || "(nenhuma)"}</span>
        </div>
      )}
      {dados.tags !== undefined && (
        <div>
          <span className="texto-secundario">Tags: </span>
          <span className="mono">{dados.tags.length ? dados.tags.join(", ") : "(nenhuma)"}</span>
        </div>
      )}
      {conteudo && (
        <div
          style={{
            border: "1px solid var(--borda)",
            borderRadius: "6px",
            padding: "8px 12px",
            maxHeight: "260px",
            overflow: "auto",
          }}
        >
          <Markdown texto={previa} />
        </div>
      )}
    </div>
  );
}

function DetalhesComercial({ tipo, proposta }: { tipo: string; proposta: PropostaComercial }) {
  const campos = Object.entries(proposta.campos ?? {}).filter(([, v]) => v !== null && v !== "");
  const acao =
    tipo === "comercial_novo_negocio"
      ? `Criar um negócio em “${proposta.organizacao_nome ?? ""}”`
      : tipo === "comercial_interacao"
        ? `Registrar ${proposta.tipo ?? "nota"} no negócio #${proposta.negocio_id} “${proposta.negocio_titulo ?? ""}”`
        : `Atualizar o negócio #${proposta.negocio_id} “${proposta.negocio_titulo ?? ""}”`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div>
        <span className="texto-secundario">Ação: </span>
        <span>{acao}</span>
      </div>
      {proposta.etapa && (
        <div>
          <span className="texto-secundario">Etapa: </span>
          <span>
            {proposta.etapa_origem ? `${proposta.etapa_origem} → ` : ""}
            {proposta.etapa}
            {proposta.motivo_perda ? ` (${proposta.motivo_perda})` : ""}
          </span>
        </div>
      )}
      {campos.map(([chave, valor]) => (
        <div key={chave}>
          <span className="texto-secundario">{ROTULO_CAMPO[chave] ?? chave}: </span>
          <span>{String(valor)}</span>
        </div>
      ))}
      {proposta.resumo && <div style={{ whiteSpace: "pre-wrap" }}>{proposta.resumo}</div>}
    </div>
  );
}

function DetalhesReuniao({ proposta }: { proposta: PropostaReuniao }) {
  const participantes = proposta.participantes ?? [];
  const pauta = proposta.pauta ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {proposta.inicio && (
        <div>
          <span className="texto-secundario">Início: </span>
          <span className="mono">{dataHora(proposta.inicio)}</span>
          {typeof proposta.duracao_min === "number" && (
            <span className="texto-secundario">
              {" "}
              · {proposta.duracao_min} min
            </span>
          )}
        </div>
      )}
      {participantes.length > 0 && (
        <div>
          <span className="texto-secundario">Participantes: </span>
          <span>{participantes.join(", ")}</span>
        </div>
      )}
      {pauta.length > 0 && (
        <div>
          <span className="texto-secundario">Pauta:</span>
          <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
            {pauta.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ApprovalCard({
  aprovacao,
  onDecidir,
  onRetomar,
  ocupado = false,
}: {
  aprovacao: Aprovacao;
  onDecidir?: (id: number, aprovado: boolean) => void;
  onRetomar?: (id: number) => void;
  ocupado?: boolean;
}) {
  const ehDocumento = TIPOS_DOCUMENTO.includes(aprovacao.tipo);
  const ehComercial = TIPOS_COMERCIAL.includes(aprovacao.tipo);
  const propostaCom = (aprovacao.proposta ?? {}) as PropostaComercial;
  const proposta = (aprovacao.proposta ?? {}) as PropostaReuniao;
  const propostaDoc = (aprovacao.proposta ?? {}) as PropostaDocumento;
  const titulo = ehComercial
    ? propostaCom.campos?.titulo?.toString() || propostaCom.negocio_titulo || "Proposta comercial"
    : ehDocumento
      ? propostaDoc.titulo || propostaDoc.documento_titulo || "Proposta de documento"
      : proposta.titulo || "Proposta de reunião";
  const pendente = aprovacao.status === "pendente";
  const comErro = aprovacao.status === "erro";
  const destaque = pendente || comErro;

  return (
    <div
      className="painel"
      style={{
        padding: "14px 16px",
        borderColor: destaque ? "var(--espera)" : "var(--borda)",
        borderLeft: `3px solid ${
          destaque ? "var(--espera)" : "var(--borda-forte)"
        }`,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <span className="titulo-pixel" style={{ fontSize: "13px" }}>
          {titulo}
        </span>
        <span className="mono texto-secundario" style={{ fontSize: "11px" }}>
          {dataHora(aprovacao.criado_em)}
        </span>
      </div>

      {ehComercial ? (
        <DetalhesComercial tipo={aprovacao.tipo} proposta={propostaCom} />
      ) : ehDocumento ? (
        <DetalhesDocumento proposta={propostaDoc} />
      ) : (
        <DetalhesReuniao proposta={proposta} />
      )}

      {aprovacao.pedido_por && (
        <div className="texto-secundario" style={{ fontSize: "13px" }}>
          Pedido por {quemPediu(aprovacao.pedido_por, aprovacao.criado_em)}
        </div>
      )}

      {pendente && onDecidir ? (
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="botao-destaque"
            disabled={ocupado}
            onClick={() => onDecidir(aprovacao.id, true)}
          >
            Aprovar
          </button>
          <button
            type="button"
            className="botao"
            disabled={ocupado}
            onClick={() => onDecidir(aprovacao.id, false)}
          >
            Recusar
          </button>
        </div>
      ) : comErro ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "13px", color: "var(--espera)" }}>
            {aprovacao.aprovado ? "Aprovada" : "Recusada"}
            {aprovacao.decidido_por ? ` por ${aprovacao.decidido_por}` : ""}, mas
            a ação não foi concluída.
          </div>
          {onRetomar && (
            <div>
              <button
                type="button"
                className="botao-destaque"
                disabled={ocupado}
                onClick={() => onRetomar(aprovacao.id)}
              >
                Tentar de novo
              </button>
            </div>
          )}
        </div>
      ) : !pendente ? (
        <div className="texto-secundario" style={{ fontSize: "13px" }}>
          {aprovacao.status === "aprovada"
            ? "Aprovada"
            : aprovacao.status === "obsoleta"
              ? "Aprovada, mas não aplicada: o item mudou desde a proposta"
              : "Recusada"}
          {aprovacao.decidido_por ? ` por ${aprovacao.decidido_por}` : ""}
          {aprovacao.decidido_em ? ` · ${dataHora(aprovacao.decidido_em)}` : ""}
        </div>
      ) : null}
    </div>
  );
}
