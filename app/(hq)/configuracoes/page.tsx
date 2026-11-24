"use client";

// Configurações: aparência (tema claro ou escuro), segurança da conta (verificação em duas etapas), backup e,
// para aprovadores, o registro de quem mudou o quê no HQ. O registro guarda método, caminho e status, nunca o
// conteúdo.

import { FormEvent, useCallback, useEffect, useState } from "react";
import { atualizar, enviar, obter } from "../../../lib/api";
import { carregarPessoas } from "../../../lib/pessoas";
import { tempoRelativo } from "../../../lib/docs";
import { nomeUsuario } from "../../../lib/exibicao";
import { aplicarTema, lerTema, type Tema } from "../../../lib/tema";

type Estado = "sem" | "pendente" | "ativo";
type Linha = { id: number; usuario: string | null; metodo: string; caminho: string; status: number; criado_em: string };

export default function ConfiguracoesPage() {
  const [tema, setTema] = useState<Tema>("claro");
  useEffect(() => setTema(lerTema()), []);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [config, setConfig] = useState<{ segredo: string; uri: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aprovador, setAprovador] = useState(false);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [quem, setQuem] = useState("");
  const [nome, setNome] = useState("");
  const [nomeSalvo, setNomeSalvo] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);

  const carregarEstado = useCallback(() => {
    obter<{ estado: Estado }>("/2fa").then((r) => setEstado(r.estado)).catch(() => setEstado("sem"));
  }, []);

  useEffect(() => {
    carregarEstado();
    obter<{ aprovador: boolean; usuario: string }>("/me")
      .then((m) => {
        setAprovador(!!m.aprovador);
        carregarPessoas().then((l) => setNome(l.find((p) => p.usuario === m.usuario)?.nome ?? "")).catch(() => {});
      })
      .catch(() => {});
  }, [carregarEstado]);

  useEffect(() => {
    if (!aprovador) return;
    let ativo = true;
    obter<Linha[]>(`/auditoria?limite=150${quem ? `&quem=${encodeURIComponent(quem)}` : ""}`)
      .then((l) => ativo && setLinhas(Array.isArray(l) ? l : []))
      .catch(() => ativo && setLinhas([]));
    return () => {
      ativo = false;
    };
  }, [aprovador, quem]);

  async function acao(caminho: string, corpo: object, depois: () => void) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await enviar<Record<string, string>>(caminho, corpo);
      depois();
      return r;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setOcupado(false);
    }
  }

  async function iniciar() {
    const r = await acao("/2fa/iniciar", {}, () => {});
    if (r) {
      setConfig({ segredo: r.segredo, uri: r.uri });
      setEstado("pendente");
      setCodigo("");
    }
  }

  function confirmar(e: FormEvent) {
    e.preventDefault();
    acao("/2fa/ativar", { codigo }, () => {
      setConfig(null);
      setCodigo("");
      carregarEstado();
    });
  }

  function desativar(e: FormEvent) {
    e.preventDefault();
    acao("/2fa/desativar", { codigo }, () => {
      setCodigo("");
      carregarEstado();
    });
  }

  const pessoas = Array.from(new Set((linhas ?? []).map((l) => l.usuario).filter(Boolean))) as string[];

  return (
    <div className="docs-pagina">
      <div className="com-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">Configurações</h1>
          <p className="texto-secundario" style={{ margin: "6px 0 0" }}>
            Aparência, segurança da sua conta e cópia dos dados do HQ.
          </p>
        </div>
      </div>

      <section className="painel com-bloco" aria-label="Seu nome">
        <h2 className="com-grupo-titulo">Seu nome</h2>
        <p className="texto-secundario cfg-texto">Aparece nas menções (@), nos comentários e nas notificações.</p>
        <form
          className="cfg-nome"
          onSubmit={async (e) => {
            e.preventDefault();
            setErroNome(null);
            try {
              await atualizar("/perfil", { nome });
              await carregarPessoas(true);
              setNomeSalvo(true);
              setTimeout(() => setNomeSalvo(false), 2000);
            } catch (e2) {
              setErroNome(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
            }
          }}
        >
          <input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Edmilson Henrique Dias Rodrigues" aria-label="Seu nome" />
          <button type="submit" className="botao botao-destaque" disabled={!nome.trim()}>
            {nomeSalvo ? "Salvo" : "Salvar"}
          </button>
        </form>
        {erroNome && (
          <p role="alert" className="com-erro">
            {erroNome}
          </p>
        )}
      </section>

      <section className="painel com-bloco" aria-label="Aparência">
        <h2 className="com-grupo-titulo">Aparência</h2>
        <p className="texto-secundario cfg-texto">Vale só neste navegador.</p>
        <div className="cfg-temas" role="radiogroup" aria-label="Tema">
          {(["claro", "escuro"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tema === t}
              className={`cfg-tema${tema === t ? " ativo" : ""}`}
              onClick={() => {
                aplicarTema(t);
                setTema(t);
              }}
            >
              <span className={`cfg-tema-amostra ${t}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {t === "claro" ? "Claro" : "Escuro"}
            </button>
          ))}
        </div>
      </section>

      <section className="painel com-bloco" aria-label="Backup">
        <h2 className="com-grupo-titulo">Backup</h2>
        <p className="texto-secundario cfg-texto">
          Baixe tudo o que vocês escreveram (Docs, Comercial, conversas e anexos) num arquivo só. Guarde uma cópia fora deste computador de vez em
          quando.
        </p>
        <div className="com-acoes" style={{ justifyContent: "flex-start" }}>
          <a className="botao botao-destaque" href="/api/backup" download>
            Baixar backup completo
          </a>
          <a className="botao" href="/api/backup?anexos_incluidos=false" download>
            Sem anexos (menor)
          </a>
        </div>
      </section>

      <section className="painel com-bloco" aria-label="Verificação em duas etapas">
        <h2 className="com-grupo-titulo">Verificação em duas etapas</h2>
        {estado === null && <p className="texto-secundario">Carregando…</p>}

        {estado === "sem" && (
          <>
            <p style={{ marginTop: 0 }}>
              Além da senha, o login passa a pedir um código de 6 dígitos de um aplicativo autenticador (Google Authenticator,
              Authy, 1Password…). Se alguém descobrir a sua senha, ainda não entra.
            </p>
            <button type="button" className="botao-destaque" onClick={iniciar} disabled={ocupado}>
              Ativar
            </button>
          </>
        )}

        {estado === "pendente" && (
          <>
            {config ? (
              <>
                <ol className="seg-passos">
                  <li>
                    No aplicativo autenticador, adicione uma conta <strong>digitando a chave</strong> (ou toque em{" "}
                    <a href={config.uri}>abrir no aplicativo</a>, no celular).
                  </li>
                  <li>
                    Chave: <code className="mono seg-chave">{config.segredo}</code>
                  </li>
                  <li>Digite abaixo o código de 6 dígitos que o aplicativo mostra.</li>
                </ol>
                <form className="seg-codigo" onSubmit={confirmar}>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    placeholder="000000"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    aria-label="Código de 6 dígitos"
                    required
                  />
                  <button type="submit" className="botao-destaque" disabled={ocupado}>
                    Confirmar e ativar
                  </button>
                </form>
              </>
            ) : (
              <>
                <p style={{ marginTop: 0 }}>A configuração ficou pela metade. Comece de novo para gerar uma chave nova.</p>
                <button type="button" className="botao" onClick={iniciar} disabled={ocupado}>
                  Gerar nova chave
                </button>
              </>
            )}
          </>
        )}

        {estado === "ativo" && (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>Ativa.</strong> O login pede o código do aplicativo. Para desativar, digite um código válido agora.
            </p>
            <form className="seg-codigo" onSubmit={desativar}>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                aria-label="Código de 6 dígitos"
                required
              />
              <button type="submit" className="botao" disabled={ocupado}>
                Desativar
              </button>
            </form>
          </>
        )}
        {erro && (
          <p role="alert" className="doc-erro">
            {erro}
          </p>
        )}
      </section>

      {aprovador && (
        <section className="painel com-bloco" aria-label="Registro de mudanças">
          <h2 className="com-grupo-titulo">Registro de mudanças</h2>
          <p className="texto-secundario" style={{ margin: "0 0 10px" }}>
            Cada criação, edição e exclusão feita no HQ, com quem fez e quando. Guardado por 180 dias; o conteúdo enviado não é gravado.
          </p>
          {pessoas.length > 0 && (
            <label className="seg-filtro">
              Pessoa
              <select value={quem} onChange={(e) => setQuem(e.target.value)}>
                <option value="">Todas</option>
                {pessoas.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}
          {linhas === null && <p className="texto-secundario">Carregando…</p>}
          {linhas?.length === 0 && <p className="texto-secundario">Nada registrado ainda.</p>}
          {linhas && linhas.length > 0 && (
            <div className="seg-tabela-rolagem">
              <table className="seg-tabela">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Quem</th>
                    <th>Ação</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} data-falha={l.status >= 400}>
                      <td className="mono">{tempoRelativo(l.criado_em)}</td>
                      <td>{l.usuario ? nomeUsuario(l.usuario) : "—"}</td>
                      <td className="mono">
                        {l.metodo} {l.caminho.replace(/^\/api/, "")}
                      </td>
                      <td className="mono">{l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
