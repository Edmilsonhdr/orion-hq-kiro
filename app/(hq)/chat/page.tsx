"use client";

// Chat do grupo (Requirements 2.3, 2.4, 9.3).
// - Lista de mensagens por polling incremental (usePoll).
// - Envio que NÃO bloqueia a tela: o POST /chat volta logo após salvar a
//   mensagem; o run roda em segundo plano no servidor e a resposta chega pelo
//   polling (o design pede que o front não espere o run terminar).
// - Indicador "trabalhando…" com o detalhe da última atividade do run atual,
//   derivado das atividades (não de estado local), para funcionar mesmo para
//   quem abre a tela no meio de um run.
// - Cartões de aprovação pendente no topo (Requirement 9.3).

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ErroApi, enviar, obter } from "../../../lib/api";
import { usePoll } from "../../../lib/usePoll";
import { nomeEm, pessoaEm } from "../../../lib/exibicao";
import ListaConversas from "../../../components/ListaConversas";
import ChatMessage, { Mensagem } from "../../../components/ChatMessage";
import { fontesDe } from "../../../lib/fontes";
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

  const nome = nomeEm(ultima.agente, ultima.criado_em, atividades);
  const detalhe = (ultima.detalhe || "").trim();
  return detalhe ? `${nome} · ${detalhe}` : nome;
}

async function mensagemFoiSalva(desde: number, texto: string, conversaId: number | null): Promise<boolean> {
  try {
    const novas = await obter<Mensagem[]>(`/mensagens?desde=${desde}${conversaId ? `&conversa=${conversaId}` : ""}`);
    return Array.isArray(novas) && novas.some((m) => m.texto === texto);
  } catch {
    return false;
  }
}

// Primeiras perguntas sugeridas no chat vazio (clicar só preenche a caixa; o envio é do sócio).
const SUGESTOES = [
  "O que mudou no Orion esta semana?",
  "Como está o funil comercial?",
  "Quais negócios estão parados há mais de uma semana?",
  "Marca uma reunião amanhã às 15h com a pauta da semana",
];

export default function ChatPage() {
  // useSearchParams exige Suspense na pré-renderização.
  return (
    <Suspense fallback={null}>
      <ChatComConversas />
    </Suspense>
  );
}

function ChatComConversas() {
  const parametros = useSearchParams();
  const pedida = parametros.get("conversa");
  const [conversaId, setConversaId] = useState<number | null>(null);
  useEffect(() => {
    try {
      // ?conversa=ID (busca global; 0 = Geral) vale mais que a última conversa lembrada
      const temPedido = pedida !== null && /^\d+$/.test(pedida);
      const alvo = temPedido ? Number(pedida) : Number(window.localStorage.getItem("hq:conversa"));
      if (temPedido) window.localStorage.setItem("hq:conversa", String(alvo));
      setConversaId(alvo > 0 ? alvo : null);
    } catch {
      // sem armazenamento: começa na Geral
    }
  }, [pedida]);
  const escolher = useCallback((id: number | null) => {
    setConversaId(id);
    try {
      window.localStorage.setItem("hq:conversa", String(id ?? 0));
    } catch {
      // só uma conveniência
    }
  }, []);
  return (
    <div className="chat-layout">
      <ListaConversas atual={conversaId} onEscolher={escolher} />
      <ChatConversa key={conversaId ?? 0} conversaId={conversaId} />
    </div>
  );
}

function ChatConversa({ conversaId }: { conversaId: number | null }) {
  const mensagens = usePoll<Mensagem>(conversaId ? `/mensagens?conversa=${conversaId}` : "/mensagens", INTERVALO_MSG_MS);
  const atividades = usePoll<Atividade>("/atividades", INTERVALO_ATIV_MS);

  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  // Atalho vindo do Escritório: /chat?msg=... preenche o campo (não envia sozinho).
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("msg");
    if (m) setTexto(m);
  }, []);

  // Aprovações pendentes: polling próprio e leve (Requirement 9.3).
  const [pendentes, setPendentes] = useState<Aprovacao[]>([]);
  const [decidindo, setDecidindo] = useState<number | null>(null);

  const fimRef = useRef<HTMLDivElement | null>(null);

  const trabalho = useMemo(() => indicadorTrabalho(atividades), [atividades]);
  const assinaturas = useMemo(
    () => new Map(mensagens.map((m) => [m.id, pessoaEm("orq", m.criado_em, atividades)])),
    [mensagens, atividades]
  );

  // Ferramentas usadas por run (para o "consultou: …" de cada resposta).
  const fontesPorRun = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const a of atividades) {
      if (a.tipo !== "ferramenta" || !a.run_id) continue;
      mapa.set(a.run_id, [...(mapa.get(a.run_id) ?? []), a.detalhe ?? ""]);
    }
    return mapa;
  }, [atividades]);
  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () => (termo ? mensagens.filter((m) => m.texto.toLowerCase().includes(termo)) : mensagens),
    [mensagens, termo]
  );

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
    const ultimoId = mensagens.length ? mensagens[mensagens.length - 1].id : 0;

    // O POST /chat volta assim que a mensagem é salva; o run segue no servidor
    // e a resposta chega pelo polling de mensagens e atividades (design.md).
    try {
      await enviar("/chat", { texto: conteudo, conversa_id: conversaId });
    } catch (erro) {
      const recusada = erro instanceof ErroApi && erro.status < 500;
      // Timeout/erro de rede não significa que a mensagem se perdeu.
      if (recusada || !(await mensagemFoiSalva(ultimoId, conteudo, conversaId))) {
        setErroEnvio("Não foi possível enviar a mensagem. Tente novamente.");
        setTexto((atual) => atual || conteudo);
      }
    } finally {
      setEnviando(false);
    }
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
        flex: 1,
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        gap: "12px",
      }}
    >
      <h1 className="so-leitor">Chat</h1>
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

      <input
        type="search"
        className="chat-busca"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar no histórico do chat"
        aria-label="Buscar no histórico do chat"
      />

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
          <div className="docs-vazio">
            <strong>Nenhuma mensagem ainda</strong>
            Comece a conversa com o Orquestrador. Algumas ideias:
            <div className="chat-sugestoes">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" className="botao" onClick={() => setTexto(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {termo && visiveis.length === 0 && (
          <p className="texto-secundario" style={{ textAlign: "center" }}>
            Nenhuma mensagem com “{busca.trim()}”.
          </p>
        )}
        {visiveis.map((m) => (
          <ChatMessage
            key={m.id}
            mensagem={m}
            assinatura={assinaturas.get(m.id)}
            fontes={m.run_id ? fontesDe(fontesPorRun.get(m.run_id) ?? []) : []}
          />
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
          <span>
            <strong style={{ color: "var(--texto)", fontWeight: 600 }}>{trabalho.split(" · ")[0]}</strong> está trabalhando…
            {trabalho.includes(" · ") && <> {trabalho.split(" · ").slice(1).join(" · ")}</>}
          </span>
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
          placeholder="Mensagem para o Orquestrador (Enter envia)"
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
