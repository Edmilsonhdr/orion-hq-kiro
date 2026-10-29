"use client";

// Menu lateral do grupo autenticado (Requirements 1.4, 9.2).
// - Checa a sessão via GET /api/me (401 é tratado em lib/api.ts, que redireciona para /login).
// - Navegação agrupada (Trabalho e Operação) com contadores: aprovações pendentes (polling leve),
//   incidentes abertos do Vigia e próximos passos vencidos do Comercial.
// - Busca global (Ctrl+K), nome do usuário e "Sair".
// - Recolhível (só ícones; a escolha fica no navegador) e, no celular, vira barra no topo com gaveta.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { obter, enviar } from "../lib/api";
import Paleta from "./Paleta";

type Me = { usuario: string; aprovador: boolean };
type Aprovacao = { id: number };

type Item = { href: string; rotulo: string; icone: string; contador?: "aprovacoes" | "incidentes" | "comercial" };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Trabalho",
    itens: [
      { href: "/chat", rotulo: "Chat", icone: "chat" },
      { href: "/comercial", rotulo: "Comercial", icone: "comercial", contador: "comercial" },
      { href: "/docs", rotulo: "Docs", icone: "docs" },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { href: "/escritorio", rotulo: "Escritório", icone: "escritorio" },
      { href: "/incidentes", rotulo: "Incidentes", icone: "incidentes", contador: "incidentes" },
      { href: "/aprovacoes", rotulo: "Aprovações", icone: "aprovacoes", contador: "aprovacoes" },
    ],
  },
];

// Intervalo do polling do contador de pendentes (~3 s: leve, não é tempo real).
const INTERVALO_PENDENTES_MS = 3000;
// Vencidos do Comercial mudam devagar (só com o passar dos dias ou edições).
const INTERVALO_COMERCIAL_MS = 60000;
const CHAVE_MENU = "hq:menu-recolhido";

const CAMINHOS: Record<string, ReactNode> = {
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
  escritorio: (
    <>
      <path d="M4 21V5h10v16M14 9h6v12M2 21h20" />
      <path d="M8 9h2M8 13h2M8 17h2" />
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
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  recolher: <path d="M15 5l-7 7 7 7" />,
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
  const [pendentes, setPendentes] = useState(0);
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

  // A gaveta do celular fecha ao navegar.
  useEffect(() => setGaveta(false), [caminho]);

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
        if (ativo && Array.isArray(lista)) setPendentes(lista.length);
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

  const contagem = { aprovacoes: pendentes, incidentes: incidentesAbertos, comercial: vencidos };
  const rotuloContador = {
    aprovacoes: "aprovações pendentes",
    incidentes: "incidentes abertos",
    comercial: "próximos passos vencidos",
  };

  return (
    <aside className={`hq-menu${recolhido ? " recolhido" : ""}${gaveta ? " gaveta-aberta" : ""}`}>
      <div className="hq-menu-topo">
        <Link href="/chat" className="hq-marca titulo-pixel" aria-label="Orion HQ">
          <span className="hq-marca-ponto" aria-hidden="true" />
          <span className="hq-rotulo">Orion HQ</span>
        </Link>
        <button
          type="button"
          className="hq-gaveta-botao"
          aria-label="Abrir menu"
          aria-expanded={gaveta}
          onClick={() => setGaveta((g) => !g)}
        >
          <Icone nome="menu" />
        </button>
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
              {grupo.itens.map((item) => {
                const ativo = caminho === item.href || caminho.startsWith(`${item.href}/`);
                const n = item.contador ? contagem[item.contador] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`hq-item${ativo ? " ativo" : ""}`}
                    aria-current={ativo ? "page" : undefined}
                    title={item.rotulo}
                  >
                    <Icone nome={item.icone} />
                    <span className="hq-rotulo">{item.rotulo}</span>
                    {n > 0 && item.contador && (
                      <span
                        className={`hq-contador mono${item.contador === "incidentes" ? " perigo" : ""}`}
                        aria-label={`${n} ${rotuloContador[item.contador]}`}
                      >
                        {n}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="hq-rodape">
          {usuario && (
            <div className="hq-usuario" title={usuario}>
              <span className="hq-avatar" aria-hidden="true">
                {usuario.slice(0, 1).toUpperCase()}
              </span>
              <span className="hq-rotulo">{usuario}</span>
            </div>
          )}
          <div className="hq-rodape-acoes">
            <button type="button" className="hq-sair" onClick={sair} disabled={saindo}>
              <span className="hq-rotulo">{saindo ? "Saindo…" : "Sair"}</span>
              <span className="hq-so-recolhido">
                <Icone nome="sair" />
              </span>
            </button>
            <button
              type="button"
              className="hq-recolher"
              onClick={alternarRecolhido}
              aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
              title={recolhido ? "Expandir menu" : "Recolher menu"}
            >
              <span className={recolhido ? "girado" : undefined}>
                <Icone nome="recolher" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
