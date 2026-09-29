"use client";

// Cabeçalho do grupo autenticado (Requirements 1.4, 9.2).
// - Checa a sessão via GET /api/me (401 é tratado no wrapper de lib/api.ts,
//   que redireciona para /login).
// - Navegação para Chat, Escritório, Incidentes e Aprovações.
// - Contador de aprovações pendentes com polling leve (Requirement 9.2).
// - Contador de incidentes abertos do Vigia (Requirement 6.1), via
//   /api/incidentes/resumo, com o mesmo polling leve.
// - Botão "Sair" que chama POST /api/logout e volta para /login.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { obter, enviar } from "../lib/api";

type Me = { usuario: string; aprovador: boolean };
type Aprovacao = { id: number };

const LINKS = [
  { href: "/chat", rotulo: "Chat" },
  { href: "/escritorio", rotulo: "Escritório" },
  { href: "/incidentes", rotulo: "Incidentes" },
  { href: "/aprovacoes", rotulo: "Aprovações" },
] as const;

// Intervalo do polling do contador de pendentes (~3 s: leve, não é tempo real).
const INTERVALO_PENDENTES_MS = 3000;

export default function Header() {
  const caminho = usePathname();
  const [usuario, setUsuario] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [incidentesAbertos, setIncidentesAbertos] = useState(0);
  const [saindo, setSaindo] = useState(false);

  // Checa a sessão uma vez. Se não houver sessão, o wrapper de api.ts
  // redireciona para /login ao receber 401.
  useEffect(() => {
    let ativo = true;
    obter<Me>("/me")
      .then((me) => {
        if (ativo) setUsuario(me.usuario);
      })
      .catch(() => {
        // 401 já redireciona; outros erros deixam o cabeçalho sem nome.
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Polling leve do contador de aprovações pendentes (Requirement 9.2).
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

  // Polling leve do contador de incidentes abertos do Vigia (Requirement 6.1).
  useEffect(() => {
    let ativo = true;

    async function buscar() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const resumo = await obter<{ abertos: number }>("/incidentes/resumo");
        if (ativo && typeof resumo?.abertos === "number") {
          setIncidentesAbertos(resumo.abertos);
        }
      } catch {
        // erros de rede/401 não devem quebrar o loop
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

  return (
    <header
      className="painel"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "12px 20px",
        borderRadius: 0,
        borderLeft: "none",
        borderRight: "none",
        borderTop: "none",
      }}
    >
      <span className="titulo-pixel" style={{ fontSize: "18px" }}>
        Orion HQ
      </span>

      <nav style={{ display: "flex", gap: "8px", flex: 1 }}>
        {LINKS.map((link) => {
          const ativo = caminho === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="botao"
              aria-current={ativo ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
                borderColor: ativo ? "var(--destaque)" : undefined,
                color: ativo ? "var(--destaque)" : "var(--texto)",
              }}
            >
              {link.rotulo}
              {link.href === "/aprovacoes" && pendentes > 0 && (
                <span
                  className="mono"
                  aria-label={`${pendentes} aprovações pendentes`}
                  style={{
                    minWidth: "20px",
                    height: "20px",
                    padding: "0 6px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--espera)",
                    color: "var(--fundo)",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {pendentes}
                </span>
              )}
              {link.href === "/incidentes" && incidentesAbertos > 0 && (
                <span
                  className="mono"
                  aria-label={`${incidentesAbertos} incidentes abertos`}
                  style={{
                    minWidth: "20px",
                    height: "20px",
                    padding: "0 6px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#FF7A59",
                    color: "var(--fundo)",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {incidentesAbertos}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {usuario && (
        <span className="texto-secundario mono" style={{ fontSize: "13px" }}>
          {usuario}
        </span>
      )}
      <button type="button" className="botao" onClick={sair} disabled={saindo}>
        {saindo ? "Saindo…" : "Sair"}
      </button>
    </header>
  );
}
