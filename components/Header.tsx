"use client";

// Menu lateral do grupo autenticado (Requirements 1.4, 9.2).
// - Checa a sessão via GET /api/me (401 é tratado em lib/api.ts, que redireciona para /login).
// - Navegação agrupada (Trabalho e Operação) com contadores: incidentes abertos do Vigia (em Agentes) e
//   próximos passos vencidos do Comercial. Configurações (segurança e backup) fica no pé.
// - Aprovações viram uma caixa de entrada: o sino no topo mostra as pendentes (polling leve).
// - Busca global (Ctrl+K), cartão do usuário, tema claro/escuro e "Sair".
// - Recolhível (só ícones; a escolha fica no navegador) e, no celular, vira barra no topo com gaveta.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { obter, enviar } from "../lib/api";
import Paleta from "./Paleta";
import { usePessoas } from "../lib/pessoas";
import PainelNotificacoes, { useNotificacoes } from "./SinoNotificacoes";
import { nomeUsuario } from "../lib/exibicao";
import { lerTema, trocarTema, type Tema } from "../lib/tema";

type Me = { usuario: string; aprovador: boolean };
type Aprovacao = { id: number; tipo: string; pedido_por: string | null; criado_em: string; proposta: { titulo?: string } | null };

type Item = { href: string; rotulo: string; icone: string; tambem?: string[]; contador?: "incidentes" | "comercial" };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Trabalho",
    itens: [
      { href: "/inicio", rotulo: "Início", icone: "inicio" },
      { href: "/chat", rotulo: "Chat", icone: "chat" },
      { href: "/tarefas", rotulo: "Tarefas", icone: "tarefas" },
      { href: "/calendario", rotulo: "Calendário", icone: "calendario" },
      { href: "/comercial", rotulo: "Comercial", icone: "comercial", contador: "comercial" },
      { href: "/docs", rotulo: "Docs", icone: "docs" },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { href: "/gmud", rotulo: "GMUD", icone: "gmud" },
      { href: "/agentes", rotulo: "Agentes", icone: "agentes", tambem: ["/escritorio", "/incidentes"], contador: "incidentes" },
    ],
  },
];

const CONFIGURACOES: Item = { href: "/configuracoes", rotulo: "Configurações", icone: "configuracoes", tambem: ["/seguranca"] };

const ROTULO_TIPO: Record<string, string> = {
  reuniao: "Reunião",
  criar_documento: "Novo documento",
  editar_documento: "Edição de documento",
};
const tituloAprovacao = (a: Aprovacao) =>
  a.proposta?.titulo || ROTULO_TIPO[a.tipo] || (a.tipo.startsWith("comercial_") ? "Comercial" : a.tipo.replace(/_/g, " "));

// Intervalo do polling do contador de pendentes (~3 s: leve, não é tempo real).
const INTERVALO_PENDENTES_MS = 3000;
// Vencidos do Comercial mudam devagar (só com o passar dos dias ou edições).
const INTERVALO_COMERCIAL_MS = 60000;
const CHAVE_MENU = "hq:menu-recolhido";

const CAMINHOS: Record<string, ReactNode> = {
  inicio: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  chat: <path d="M4 5h16v10H9l-5 4V5z" />,
  comercial: (
    <>
      <path d="M3 8h18v11H3z" />
      <path d="M9 8V5h6v3M3 13h18" />
    </>
  ),
  docs: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  tarefas: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  escritorio: (
    <>
      <path d="M4 21V5h10v16M14 9h6v12M2 21h20" />
      <path d="M8 9h2M8 13h2M8 17h2" />
    </>
  ),
  gmud: (
    <>
      <path d="M4 7h11M4 7l3-3M4 7l3 3" />
      <path d="M20 17H9M20 17l-3-3M20 17l-3 3" />
    </>
  ),
  agentes: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M12 7.5v4M12 11.5l-6 5M12 11.5l6 5" />
    </>
  ),
  incidentes: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  aprovacoes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  seguranca: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  recolher: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  sino: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  configuracoes: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  lua: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  marca: (
    <>
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor" stroke="none" />
    </>
  ),
  sair: <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />,
};

function Icone({ nome }: { nome: string }) {
  return (
    <svg
      className="hq-icone"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}

export default function Header() {
  const caminho = usePathname();
  const [usuario, setUsuario] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<Aprovacao[]>([]);
  const [caixa, setCaixa] = useState(false);
  const notif = useNotificacoes();
  usePessoas(); // carrega os nomes de exibição para todo o HQ
  const [tema, setTema] = useState<Tema>("claro");
  const caixaRef = useRef<HTMLDivElement>(null);
  const [incidentesAbertos, setIncidentesAbertos] = useState(0);
  const [vencidos, setVencidos] = useState(0);
  const [saindo, setSaindo] = useState(false);
  // null = sem escolha do usuário (no Escritório o menu começa recolhido para sobrar espaço à planta).
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const [gaveta, setGaveta] = useState(false);

  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE_MENU);
      if (salvo !== null) setEscolha(salvo === "1");
    } catch {
      // sem armazenamento: segue o padrão
    }
  }, []);

  useEffect(() => setTema(lerTema()), []);

  // A gaveta do celular e a caixa de entrada fecham ao navegar.
  useEffect(() => {
    setGaveta(false);
    setCaixa(false);
  }, [caminho]);

  // A caixa de entrada fecha com clique fora ou Esc.
  useEffect(() => {
    if (!caixa) return;
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !caixaRef.current?.contains(e.target as Node)) setCaixa(false);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", fechar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", fechar);
    };
  }, [caixa]);

  const recolhido = escolha ?? caminho.startsWith("/escritorio");

  function alternarRecolhido() {
    const novo = !recolhido;
    setEscolha(novo);
    try {
      window.localStorage.setItem(CHAVE_MENU, novo ? "1" : "0");
    } catch {
      // só uma conveniência
    }
  }

  // Checa a sessão uma vez. Se não houver sessão, o wrapper de api.ts redireciona para /login.
  useEffect(() => {
    let ativo = true;
    obter<Me>("/me")
      .then((me) => {
        if (ativo) setUsuario(me.usuario);
      })
      .catch(() => {
        // 401 já redireciona; outros erros deixam o menu sem nome.
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Polling leve dos contadores (aprovações, incidentes). Pausa com a aba escondida.
  useEffect(() => {
    let ativo = true;

    async function buscar() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const lista = await obter<Aprovacao[]>("/aprovacoes?status=pendente");
        if (ativo && Array.isArray(lista)) setPendentes(lista);
      } catch {
        // erros de rede/401 não devem quebrar o loop
      }
      try {
        const resumo = await obter<{ abertos: number }>("/incidentes/resumo");
        if (ativo && typeof resumo?.abertos === "number") setIncidentesAbertos(resumo.abertos);
      } catch {
        // idem
      }
    }

    buscar();
    const timer = setInterval(buscar, INTERVALO_PENDENTES_MS);
    const aoMudarVisibilidade = () => {
      if (!document.hidden) buscar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  // Heartbeat de presença: avisa o HQ que este usuário está com a tela aberta.
  useEffect(() => {
    const bater = () => {
      if (!document.hidden) enviar("/presenca").catch(() => {});
    };
    bater();
    const timer = setInterval(bater, 30000);
    return () => clearInterval(timer);
  }, []);

  // Próximos passos vencidos do Comercial (spec comercial, Requirement 5.1).
  useEffect(() => {
    let ativo = true;

    async function buscar() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const resumo = await obter<{ vencidos: number }>("/comercial/resumo");
        if (ativo && typeof resumo?.vencidos === "number") setVencidos(resumo.vencidos);
      } catch {
        // erros de rede/401 não devem quebrar o loop
      }
    }

    buscar();
    const timer = setInterval(buscar, INTERVALO_COMERCIAL_MS);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, []);

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try {
      await enviar("/logout");
    } catch {
      // mesmo em erro, seguimos para o login
    } finally {
      window.location.href = "/login";
    }
  }

  const contagem = { incidentes: incidentesAbertos, comercial: vencidos };
  const rotuloContador = {
    incidentes: "incidentes abertos",
    comercial: "próximos passos vencidos",
  };

  function item(it: Item) {
    const ativo = [it.href, ...(it.tambem ?? [])].some((h) => caminho === h || caminho.startsWith(`${h}/`));
    const n = it.contador ? contagem[it.contador] : 0;
    return (
      <Link key={it.href} href={it.href} className={`hq-item${ativo ? " ativo" : ""}`} aria-current={ativo ? "page" : undefined} title={it.rotulo}>
        <Icone nome={it.icone} />
        <span className="hq-rotulo">{it.rotulo}</span>
        {n > 0 && it.contador && (
          <span className={`hq-contador mono${it.contador === "incidentes" ? " perigo" : ""}`} aria-label={`${n} ${rotuloContador[it.contador]}`}>
            {n}
          </span>
        )}
      </Link>
    );
  }

  function alternarTema() {
    setTema(trocarTema());
  }

  return (
    <aside className={`hq-menu${recolhido ? " recolhido" : ""}${gaveta ? " gaveta-aberta" : ""}`}>
      <div className="hq-menu-topo">
        <Link href="/inicio" className="hq-marca" aria-label="Orion HQ, início">
          <span className="hq-marca-logo" aria-hidden="true">
            <Icone nome="marca" />
          </span>
          <span className="hq-rotulo hq-marca-textos">
            <strong>Orion HQ</strong>
            <span>Central da equipe</span>
          </span>
        </Link>
        <div className="hq-topo-acoes">
          <div className="hq-caixa" ref={caixaRef}>
            <button
              type="button"
              className={`hq-icone-botao${pendentes.length + notif.dados.nao_lidas > 0 ? " com-aviso" : ""}`}
              aria-label={`Notificações: ${notif.dados.nao_lidas} não lidas, ${pendentes.length} aprovações pendentes`}
              aria-expanded={caixa}
              aria-haspopup="dialog"
              title="Notificações"
              onClick={() => setCaixa((c) => !c)}
            >
              <Icone nome="sino" />
              {pendentes.length + notif.dados.nao_lidas > 0 && <span className="hq-sino-contador mono">{Math.min(99, pendentes.length + notif.dados.nao_lidas)}</span>}
            </button>
            {caixa && (
              <PainelNotificacoes
                dados={notif.dados}
                setDados={notif.setDados}
                aprovacoes={pendentes.map((a) => ({ id: a.id, titulo: tituloAprovacao(a), tipo_rotulo: ROTULO_TIPO[a.tipo] ?? "Proposta", pedido_por: a.pedido_por ?? null }))}
                onFechar={() => setCaixa(false)}
              />
            )}
          </div>
          <button
            type="button"
            className="hq-icone-botao hq-recolher"
            onClick={alternarRecolhido}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            title={recolhido ? "Expandir menu" : "Recolher menu"}
          >
            <Icone nome="recolher" />
          </button>
          <button type="button" className="hq-gaveta-botao hq-icone-botao" aria-label="Abrir menu" aria-expanded={gaveta} onClick={() => setGaveta((g) => !g)}>
            <Icone nome="menu" />
          </button>
        </div>
      </div>

      <div className="hq-menu-corpo">
        <button
          type="button"
          className="hq-buscar"
          onClick={() => window.dispatchEvent(new Event("orion:paleta"))}
          aria-label="Abrir busca (Ctrl+K)"
          title="Buscar (Ctrl+K)"
        >
          <Icone nome="buscar" />
          <span className="hq-rotulo">Buscar</span>
          <span className="hq-rotulo mono hq-atalho">Ctrl K</span>
        </button>
        <Paleta />

        <nav aria-label="Principal">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo} className="hq-grupo">
              <div className="hq-grupo-titulo hq-rotulo">{grupo.titulo}</div>
              {grupo.itens.map(item)}
            </div>
          ))}
        </nav>

        <div className="hq-rodape">
          {item(CONFIGURACOES)}
          <div className="hq-usuario-cartao">
            {usuario && (
              <span className="hq-usuario" title={nomeUsuario(usuario)}>
                <span className="hq-avatar" aria-hidden="true">
                  {usuario.slice(0, 1).toUpperCase()}
                </span>
                <span className="hq-rotulo hq-usuario-textos">
                  <strong>{nomeUsuario(usuario)}</strong>
                  <span>Sócio</span>
                </span>
              </span>
            )}
            <span className="hq-usuario-acoes">
              <button
                type="button"
                className="hq-icone-botao"
                onClick={alternarTema}
                aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
                title={tema === "escuro" ? "Tema claro" : "Tema escuro"}
              >
                <Icone nome={tema === "escuro" ? "sol" : "lua"} />
              </button>
              <button type="button" className="hq-icone-botao" onClick={sair} disabled={saindo} aria-label="Sair" title={saindo ? "Saindo…" : "Sair"}>
                <Icone nome="sair" />
              </button>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
