"use client";

// Página de login (Requirement 1.1/1.2/1.4).
// Formulário usuário + senha que envia POST /api/login. Em sucesso vai para
// /chat; em 401 mostra uma mensagem genérica que não revela qual campo errou.

import { FormEvent, useEffect, useState } from "react";
import { enviar, ErroApi } from "../../lib/api";

export default function LoginPage() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [expirou, setExpirou] = useState(false);

  useEffect(() => {
    setExpirou(new URLSearchParams(window.location.search).get("expirou") === "1");
  }, []);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await enviar("/login", { usuario, senha });
      window.location.href = "/inicio";
    } catch (e) {
      // 401 e demais erros mostram a mesma mensagem genérica (Requirement 1.2).
      if (e instanceof ErroApi && e.status === 401) {
        setErro("Usuário ou senha inválidos.");
      } else if (e instanceof ErroApi && e.status === 429) {
        setErro("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      } else {
        setErro("Não foi possível entrar. Tente novamente.");
      }
      setEnviando(false);
    }
  }

  return (
    <main className="login-pagina">
      <section className="login-lado" aria-hidden="true">
        <div className="login-marca titulo-pixel">
          <span className="hq-marca-ponto" /> Orion HQ
        </div>
        <p className="login-frase">O escritório dos agentes de IA do orion</p>
        <ul className="login-pontos">
          <li>Chat com o Orquestrador e os especialistas</li>
          <li>Docs, Comercial e aprovações num lugar só</li>
        </ul>
      </section>
      <form onSubmit={aoEnviar} className="painel login-form">
        <h1 className="titulo-pixel" style={{ margin: 0, fontSize: "22px" }}>
          Entrar
        </h1>
        <p className="texto-secundario" style={{ margin: 0 }}>
          Acompanhe os agentes e o que precisa da sua aprovação.
        </p>
        {expirou && (
          <p role="status" className="login-aviso">
            Sua sessão expirou. Entre de novo para continuar.
          </p>
        )}

        <label className="login-campo">
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

        <label className="login-campo">
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

        <button type="submit" className="botao-destaque" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
