"use client";

// Negócio: dados, mudança de etapa, histórico e registro de interações (spec comercial, Requirement 5.5).

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Modal from "../../../../../components/Modal";
import MensagensModelo from "../../../../../components/MensagensModelo";
import NegocioForm, { type DadosNegocio } from "../../../../../components/NegocioForm";
import { ErroApi, atualizar, enviar, obter } from "../../../../../lib/api";
import {
  ETAPAS,
  ROTULO_ETAPA,
  ROTULO_INTERACAO,
  TIPOS_INTERACAO,
  formatarDia,
  formatarReais,
  hojeISO,
  situacaoPasso,
  type Etapa,
  type NegocioDetalhe,
} from "../../../../../lib/comercial";
import { formatarData } from "../../../../../lib/docs";

export default function NegocioPage() {
  const { id } = useParams<{ id: string }>();
  const [n, setN] = useState<NegocioDetalhe | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [perdendo, setPerdendo] = useState(false);
  const [motivo, setMotivo] = useState("");

  const [tipo, setTipo] = useState<string>("ligacao");
  const [resumo, setResumo] = useState("");
  const [salvandoInteracao, setSalvandoInteracao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setN(await obter<NegocioDetalhe>(`/comercial/negocios/${id}`));
      setErro(null);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 404) setNaoEncontrado(true);
      else setErro(e instanceof Error ? e.message : "Erro ao carregar o negócio.");
    }
  }, [id]);

  useEffect(() => {
    obter<{ usuario: string }>("/me").then((m) => setUsuario(m.usuario)).catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mover(etapa: Etapa, motivoPerda?: string) {
    if (etapa === "perdido" && !motivoPerda) {
      setMotivo("");
      setPerdendo(true);
      return;
    }
    try {
      await enviar(`/comercial/negocios/${id}/etapa`, { etapa, motivo_perda: motivoPerda ?? null });
      setPerdendo(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível mudar a etapa.");
    }
  }

  async function salvarEdicao(dados: DadosNegocio) {
    await atualizar(`/comercial/negocios/${id}`, dados);
    setEditando(false);
    await carregar();
  }

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (salvandoInteracao) return;
    setSalvandoInteracao(true);
    try {
      await enviar(`/comercial/negocios/${id}/interacoes`, { tipo, resumo: resumo.trim() });
      setResumo("");
      await carregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível registrar.");
    } finally {
      setSalvandoInteracao(false);
    }
  }

  async function excluir(interacaoId: number) {
    if (!window.confirm("Excluir esta anotação?")) return;
    try {
      await fetch(`/api/comercial/interacoes/${interacaoId}`, { method: "DELETE" });
      await carregar();
    } catch {
      setErro("Não foi possível excluir.");
    }
  }

  if (naoEncontrado)
    return (
      <div className="docs-pagina">
        <p>Negócio não encontrado.</p>
        <Link href="/comercial">← Voltar ao Comercial</Link>
      </div>
    );
  if (!n)
    return (
      <div className="docs-pagina">
        {erro ? <p role="alert" className="com-erro">{erro}</p> : <p className="texto-secundario">Carregando…</p>}
      </div>
    );

  const situacao = situacaoPasso(n.proximo_passo_em, hojeISO());
  const fechado = n.etapa === "ganho" || n.etapa === "perdido";

  return (
    <div className="docs-pagina">
      <nav className="doc-migalhas" aria-label="Você está em">
        <Link href="/comercial">Comercial</Link> <span aria-hidden="true">/</span>{" "}
        <Link href={`/comercial/organizacoes/${n.organizacao_id}`}>{n.organizacao_nome}</Link>
      </nav>

      <div className="com-topo">
        <h1 className="com-titulo-negocio">{n.titulo}</h1>
        <div className="com-acoes">
          <button type="button" className="botao" onClick={() => setEditando(true)}>
            Editar
          </button>
        </div>
      </div>

      {erro && <p role="alert" className="com-erro">{erro}</p>}

      <div className="com-detalhe">
        <section className="painel com-bloco">
          <label htmlFor="etapa" className="texto-secundario">Etapa</label>
          <select id="etapa" value={n.etapa} onChange={(e) => mover(e.target.value as Etapa)}>
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {ROTULO_ETAPA[e]}
              </option>
            ))}
          </select>
          {n.etapa === "perdido" && n.motivo_perda && <p className="texto-secundario">Motivo: {n.motivo_perda}</p>}
          {fechado && n.fechado_em && <p className="texto-secundario">Fechado em {formatarDia(n.fechado_em)}</p>}

          <dl className="com-dados">
            <dt>Valor mensal</dt><dd className="mono">{formatarReais(n.valor_mensal)}</dd>
            <dt>Pacientes/alunos ativos</dt><dd>{n.pacientes_ativos ?? "—"}</dd>
            <dt>Pacote</dt><dd>{n.plano_interesse ? (n.plano_interesse === "essencial" ? "Essencial" : "Completo") : "—"}</dd>
            <dt>Usa hoje</dt><dd>{n.usa_hoje ?? "—"}</dd>
            <dt>Origem</dt><dd>{n.origem ?? "—"}</dd>
            <dt>Responsável</dt><dd>{n.responsavel}</dd>
          </dl>
          {!fechado && (
            <div className={`com-passo passo-${situacao}`}>
              <strong>Próximo passo:</strong> {n.proximo_passo ?? "não definido"}
              {n.proximo_passo_em && <span className="mono"> · {formatarDia(n.proximo_passo_em)}</span>}
            </div>
          )}
          <h3 className="com-grupo-titulo">Contatos</h3>
          {n.contatos.length === 0 ? (
            <p className="texto-secundario">Nenhum contato. Adicione na <Link href={`/comercial/organizacoes/${n.organizacao_id}`}>organização</Link>.</p>
          ) : (
            <ul className="com-lista">
              {n.contatos.map((c) => (
                <li key={c.id}>
                  {c.nome}
                  {c.cargo ? ` · ${c.cargo}` : ""}
                  <div className="texto-secundario">{[c.email, c.telefone].filter(Boolean).join(" · ")}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <MensagensModelo negocio={n} contatos={n.contatos} usuario={usuario} />

        <section className="painel com-bloco">
          <h2 className="com-grupo-titulo">Histórico</h2>
          <form className="com-form" onSubmit={registrar}>
            <div className="com-linha">
              <div className="com-campo">
                <label htmlFor="int-tipo">Tipo</label>
                <select id="int-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_INTERACAO.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_INTERACAO[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="com-campo">
              <label htmlFor="int-resumo">O que aconteceu</label>
              <textarea id="int-resumo" rows={3} value={resumo} onChange={(e) => setResumo(e.target.value)} maxLength={5000} required />
            </div>
            <p className="com-aviso texto-secundario">Sem dados de saúde de pessoas.</p>
            <div className="com-acoes">
              <button type="submit" className="botao botao-destaque" disabled={salvandoInteracao || !resumo.trim()}>
                Registrar
              </button>
            </div>
          </form>
          <ul className="com-historico">
            {n.interacoes.length === 0 && <li className="texto-secundario">Nada registrado ainda.</li>}
            {n.interacoes.map((i) => (
              <li key={i.id} className={`com-evento${i.tipo === "etapa" ? " sistema" : ""}`}>
                <div className="com-evento-topo">
                  <strong>{ROTULO_INTERACAO[i.tipo] ?? i.tipo}</strong>
                  <span className="mono texto-secundario">
                    {formatarData(i.ocorrida_em)} · {i.autor}
                  </span>
                  {i.tipo !== "etapa" && (
                    <button type="button" className="botao com-excluir" onClick={() => excluir(i.id)} aria-label="Excluir anotação">
                      Excluir
                    </button>
                  )}
                </div>
                <p>{i.resumo}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Modal titulo="Editar negócio" aberto={editando} onFechar={() => setEditando(false)}>
        <NegocioForm inicial={n} onSalvar={salvarEdicao} onCancelar={() => setEditando(false)} />
      </Modal>

      <Modal titulo="Marcar como perdido" aberto={perdendo} onFechar={() => setPerdendo(false)}>
        <form
          className="com-form"
          onSubmit={(e) => {
            e.preventDefault();
            mover("perdido", motivo.trim());
          }}
        >
          <div className="com-campo">
            <label htmlFor="motivo">Motivo da perda</label>
            <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={500} autoFocus />
          </div>
          <div className="com-acoes">
            <button type="button" className="botao" onClick={() => setPerdendo(false)}>Cancelar</button>
            <button type="submit" className="botao botao-destaque">Confirmar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
