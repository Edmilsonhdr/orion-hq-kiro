"use client";

// Página de login (Requirement 1.1/1.2/1.4).
// Formulário usuário + senha que envia POST /api/login. Em sucesso vai para
// /chat; em 401 mostra uma mensagem genérica que não revela qual campo errou.

import { FormEvent, useState } from "react";
import { enviar, ErroApi } from "../../lib/api";

export default function LoginPage() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await enviar("/login", { usuario, senha });
      window.location.href = "/chat";
    } catch (e) {
      // 401 e demais erros mostram a mesma mensagem genérica (Requirement 1.2).
      if (e instanceof ErroApi && e.status === 401) {
        setErro("Usuário ou senha inválidos.");
      } else {
        setErro("Não foi possível entrar. Tente novamente.");
      }
      setEnviando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <form
        onSubmit={aoEnviar}
        className="painel"
        style={{
          width: "100%",
          maxWidth: "360px",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <h1 className="titulo-pixel" style={{ margin: 0, fontSize: "22px" }}>
          Orion HQ
        </h1>
        <p className="texto-secundario" style={{ margin: 0 }}>
          Entre para acompanhar os agentes.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span>Usuário</span>
          <input
            type="text"
            name="usuario"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span>Senha</span>
          <input
            type="password"
            name="senha"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>

        {erro && (
          <p role="alert" style={{ margin: 0, color: "var(--espera)" }}>
            {erro}
          </p>
        )}

        <button
          type="submit"
          className="botao-destaque"
          disabled={enviando}
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
