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

  const [abertas, setAbertas] = useState(false);

  return (
    <div className="chat-principal">
      <h1 className="so-leitor">Chat</h1>
      <header className="chat-topo">
        <div className="chat-topo-quem">
          <span className="chat-topo-avatar" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <strong>Orquestrador</strong>
            <span className={`chat-topo-status${trabalho ? " ativo" : ""}`}>{trabalho ? "trabalhando…" : "pronto para ajudar"}</span>
          </div>
        </div>
        <label className="chat-busca-caixa">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na conversa" aria-label="Buscar no histórico do chat" />
        </label>
      </header>

      {/* Aprovações pendentes: uma faixa compacta; os detalhes abrem sob demanda (Requirement 9.3) */}
      {pendentes.length > 0 && (
        <section className={`chat-aprov${abertas ? " aberta" : ""}`} aria-label="Aprovações pendentes">
          <button type="button" className="chat-aprov-faixa" aria-expanded={abertas} onClick={() => setAbertas((v) => !v)}>
            <span className="chat-aprov-ponto" aria-hidden="true" />
            <span className="chat-aprov-texto">
              <strong>
                {pendentes.length === 1 ? "1 proposta esperando sua decisão" : `${pendentes.length} propostas esperando sua decisão`}
              </strong>
              <span> · {pendentes.map((a) => (a.proposta as { titulo?: string })?.titulo).filter(Boolean).slice(0, 2).join(", ")}</span>
            </span>
            <span className="chat-aprov-ver">{abertas ? "Fechar" : "Revisar"}</span>
          </button>
          {abertas && (
            <div className="chat-aprov-lista">
              {pendentes.map((a) => (
                <ApprovalCard key={a.id} aprovacao={a} onDecidir={decidir} ocupado={decidindo === a.id} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="chat-mensagens">
        {mensagens.length === 0 && (
          <div className="chat-vazio">
            <span className="chat-vazio-icone" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor" />
              </svg>
            </span>
            <h2>Como posso ajudar?</h2>
            <p>O Orquestrador consulta Docs, Comercial e o código do Orion, e chama o especialista certo.</p>
            <div className="chat-sugestoes">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" className="chat-sugestao" onClick={() => setTexto(s)}>
                  {s}
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {termo && visiveis.length === 0 && <p className="chat-nada">Nenhuma mensagem com “{busca.trim()}”.</p>}
        {visiveis.map((m) => (
          <ChatMessage key={m.id} mensagem={m} assinatura={assinaturas.get(m.id)} fontes={m.run_id ? fontesDe(fontesPorRun.get(m.run_id) ?? []) : []} />
        ))}
        <div ref={fimRef} />
      </div>

      {/* Indicador "trabalhando…" com a última atividade do run (Requirement 2.4) */}
      {trabalho && (
        <div role="status" aria-live="polite" className="chat-trabalhando">
          <span className="chat-trabalhando-pontos" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>{trabalho.split(" · ")[0]}</strong> está trabalhando…
            {trabalho.includes(" · ") && <> {trabalho.split(" · ").slice(1).join(" · ")}</>}
          </span>
        </div>
      )}

      {erroEnvio && (
        <p role="alert" className="chat-erro">
          {erroEnvio}
        </p>
      )}

      {/* Caixa de envio */}
      <form onSubmit={aoEnviar} className="chat-compor">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
            }
          }}
          placeholder="Escreva para o Orquestrador…"
          rows={2}
          aria-label="Mensagem"
        />
        <div className="chat-compor-rodape">
          <span className="chat-compor-dica">
            <kbd>Enter</kbd> envia · <kbd>Shift</kbd> + <kbd>Enter</kbd> quebra a linha
          </span>
          <button type="submit" className="chat-enviar" disabled={enviando || texto.trim().length === 0} aria-label={enviando ? "Enviando" : "Enviar"}>
            {enviando ? (
              "…"
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
