"use client";

// Chat do grupo (Requirements 2.3, 2.4, 9.3).
// - Lista de mensagens por polling incremental (usePoll).
// - Envio que NÃO bloqueia a tela: dispara POST /chat e segue no polling
//   (o design pede que o front não espere o run terminar).
// - Indicador "trabalhando…" com o detalhe da última atividade do run atual,
//   derivado das atividades (não de estado local), para funcionar mesmo para
//   quem abre a tela no meio de um run.
// - Cartões de aprovação pendente no topo (Requirement 9.3).

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { enviar, obter } from "../../../lib/api";
import { usePoll } from "../../../lib/usePoll";
import { agentePorId } from "../../../lib/agents";
import ChatMessage, { Mensagem } from "../../../components/ChatMessage";
import ApprovalCard, { Aprovacao } from "../../../components/ApprovalCard";

type Atividade = {
  id: number;
  run_id: string | null;
  agente: string;
  tipo: string;
  detalhe: string | null;
  dados: Record<string, unknown> | null;
  tokens: number;
  criado_em: string;
};

// Intervalos de polling (~1,5 s para tempo quase real — Requirement 2.3).
const INTERVALO_MSG_MS = 1500;
const INTERVALO_ATIV_MS = 1500;
const INTERVALO_APROV_MS = 3000;

// Uma atividade conta como "trabalho em andamento" enquanto for recente e não
// for um encerramento (concluiu/resposta/erro).
const IDADE_ATIVA_MS = 30000;
const TIPOS_TRABALHO = new Set([
  "inicio",
  "pensando",
  "delegou",
  "ferramenta",
  "aguardando_aprovacao",
]);

function indicadorTrabalho(atividades: Atividade[]): string | null {
  if (atividades.length === 0) return null;
  const ultima = atividades[atividades.length - 1];
  if (!TIPOS_TRABALHO.has(ultima.tipo)) return null;

  const idade = Date.now() - new Date(ultima.criado_em).getTime();
  if (Number.isNaN(idade) || idade > IDADE_ATIVA_MS) return null;

  const nome = agentePorId(ultima.agente)?.nome ?? ultima.agente;
  const detalhe = (ultima.detalhe || "").trim();
  return detalhe ? `${nome} · ${detalhe}` : nome;
}

export default function ChatPage() {
  const mensagens = usePoll<Mensagem>("/mensagens", INTERVALO_MSG_MS);
  const atividades = usePoll<Atividade>("/atividades", INTERVALO_ATIV_MS);

  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  // Aprovações pendentes: polling próprio e leve (Requirement 9.3).
  const [pendentes, setPendentes] = useState<Aprovacao[]>([]);
  const [decidindo, setDecidindo] = useState<number | null>(null);

  const fimRef = useRef<HTMLDivElement | null>(null);

  const trabalho = useMemo(() => indicadorTrabalho(atividades), [atividades]);

  // Rola para o fim quando chegam mensagens novas ou muda o indicador.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length, trabalho]);

  async function buscarPendentes() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const lista = await obter<Aprovacao[]>(
        "/aprovacoes?status=pendente"
      );
      if (Array.isArray(lista)) setPendentes(lista);
    } catch {
      // erros de rede/401 não devem quebrar o loop
    }
  }

  useEffect(() => {
    buscarPendentes();
    const timer = setInterval(buscarPendentes, INTERVALO_APROV_MS);
    const aoMudarVisibilidade = () => {
      if (!document.hidden) buscarPendentes();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setErroEnvio(null);
    setEnviando(true);
    setTexto("");

    // Dispara o POST /chat mas NÃO espera o run terminar para atualizar a tela:
    // o polling de mensagens e atividades cuida disso (design.md).
    enviar("/chat", { texto: conteudo })
      .catch(() => {
        setErroEnvio(
          "Não foi possível enviar a mensagem. Tente novamente."
        );
      })
      .finally(() => {
        setEnviando(false);
      });
  }

  async function decidir(id: number, aprovado: boolean) {
    if (decidindo !== null) return;
    setDecidindo(id);
    try {
      await enviar(`/aprovacoes/${id}`, { aprovado });
      // Some da lista assim que decidida; o polling confirma em seguida.
      setPendentes((atuais) => atuais.filter((a) => a.id !== id));
    } catch {
      // se falhar, o próximo polling recoloca o cartão
    } finally {
      setDecidindo(null);
    }
  }

  return (
    <div
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        gap: "12px",
      }}
    >
      {/* Cartões de aprovação pendente no topo (Requirement 9.3) */}
      {pendentes.length > 0 && (
        <section
          aria-label="Aprovações pendentes"
          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
          {pendentes.map((a) => (
            <ApprovalCard
              key={a.id}
              aprovacao={a}
              onDecidir={decidir}
              ocupado={decidindo === a.id}
            />
          ))}
        </section>
      )}

      {/* Lista de mensagens */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          paddingRight: "4px",
        }}
      >
        {mensagens.length === 0 && (
          <p className="texto-secundario" style={{ textAlign: "center" }}>
            Nenhuma mensagem ainda. Comece a conversa com o Orquestrador.
          </p>
        )}
        {mensagens.map((m) => (
          <ChatMessage key={m.id} mensagem={m} />
        ))}
        <div ref={fimRef} />
      </div>

      {/* Indicador "trabalhando…" com a última atividade do run (Requirement 2.4) */}
      {trabalho && (
        <div
          role="status"
          aria-live="polite"
          className="texto-secundario mono"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            padding: "0 4px",
          }}
        >
          <span aria-hidden="true">⌁</span>
          <span>trabalhando… {trabalho}</span>
        </div>
      )}

      {erroEnvio && (
        <p role="alert" style={{ margin: 0, color: "var(--espera)" }}>
          {erroEnvio}
        </p>
      )}

      {/* Caixa de envio */}
      <form
        onSubmit={aoEnviar}
        style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
            }
          }}
          placeholder="Escreva para o Orquestrador… (Enter envia, Shift+Enter quebra linha)"
          rows={2}
          style={{ flex: 1, resize: "none" }}
          aria-label="Mensagem"
        />
        <button
          type="submit"
          className="botao-destaque"
          disabled={enviando || texto.trim().length === 0}
        >
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
