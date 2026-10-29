"use client";

// Comercial (spec comercial, Requirement 5): indicadores no topo e abas Hoje, Funil e Organizações.
// Sem polling: recarrega ao entrar e depois de cada alteração.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Funil from "../../../components/Funil";
import Modal from "../../../components/Modal";
import NegocioForm, { type DadosNegocio } from "../../../components/NegocioForm";
import { enviar, obter } from "../../../lib/api";
import {
  ROTULO_AREA,
  ROTULO_ETAPA,
  ROTULO_TIPO_ORG,
  TIPOS_ORG,
  formatarDia,
  formatarReais,
  hojeISO,
  porcentagem,
  situacaoPasso,
  type Etapa,
  type Hoje,
  type Negocio,
  type Organizacao,
  type ResumoFunil,
} from "../../../lib/comercial";

type Aba = "hoje" | "funil" | "organizacoes";

function LinhaNegocio({ n }: { n: Negocio }) {
  const situacao = situacaoPasso(n.proximo_passo_em, hojeISO());
  return (
    <li className="com-item">
      <div>
        <Link href={`/comercial/negocios/${n.id}`} className="com-item-titulo">
          {n.titulo}
        </Link>
        <div className="texto-secundario">
          {n.organizacao_nome} · {ROTULO_ETAPA[n.etapa]} · {n.responsavel}
        </div>
      </div>
      <div className={`com-item-passo passo-${situacao}`}>
        {n.proximo_passo ?? "Definir próximo passo"}
        {n.proximo_passo_em && <span className="mono"> · {formatarDia(n.proximo_passo_em)}</span>}
      </div>
    </li>
  );
}

function Grupo({ titulo, itens, vazio }: { titulo: string; itens: Negocio[]; vazio?: string }) {
  if (itens.length === 0 && !vazio) return null;
  return (
    <section className="painel com-grupo">
      <h3 className="com-grupo-titulo">
        {titulo} <span className="mono texto-secundario">{itens.length}</span>
      </h3>
      {itens.length === 0 ? <p className="texto-secundario">{vazio}</p> : <ul className="com-lista">{itens.map((n) => <LinhaNegocio key={n.id} n={n} />)}</ul>}
    </section>
  );
}

export default function ComercialPage() {
  const [aba, setAba] = useState<Aba>("hoje");
  const [resumo, setResumo] = useState<ResumoFunil | null>(null);
  const [hoje, setHoje] = useState<Hoje | null>(null);
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [organizacoes, setOrganizacoes] = useState<Organizacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [novoAberto, setNovoAberto] = useState(false);
  const [orgNovaAberta, setOrgNovaAberta] = useState(false);
  const [perda, setPerda] = useState<Negocio | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroModal, setErroModal] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [r, h, n, o] = await Promise.all([
        obter<ResumoFunil>("/comercial/resumo"),
        obter<Hoje>("/comercial/hoje"),
        obter<Negocio[]>("/comercial/negocios"),
        obter<Organizacao[]>("/comercial/organizacoes"),
      ]);
      setResumo(r);
      setHoje(h);
      setNegocios(n);
      setOrganizacoes(o);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o Comercial.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mover(n: Negocio, etapa: Etapa, motivoPerda?: string) {
    if (etapa === "perdido" && !motivoPerda) {
      setMotivo("");
      setErroModal(null);
      setPerda(n);
      return;
    }
    try {
      await enviar(`/comercial/negocios/${n.id}/etapa`, { etapa, motivo_perda: motivoPerda ?? null });
      setPerda(null);
      await carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível mover o negócio.";
      if (perda) setErroModal(msg);
      else setErro(msg);
    }
  }

  async function criarNegocio(dados: DadosNegocio) {
    await enviar("/comercial/negocios", dados);
    setNovoAberto(false);
    await carregar();
  }

  const indicadores = [
    { rotulo: "Em aberto", valor: resumo ? String(resumo.abertos) : "—" },
    { rotulo: "Potencial/mês", valor: resumo ? formatarReais(resumo.valor_mensal_potencial) : "—" },
    { rotulo: "Ganhos em 30 dias", valor: resumo ? String(resumo.ganhos_30d) : "—" },
    { rotulo: "Conversão (90 dias)", valor: resumo ? porcentagem(resumo.conversao_90d) : "—" },
    { rotulo: "Vencidos", valor: resumo ? String(resumo.vencidos) : "—", alerta: (resumo?.vencidos ?? 0) > 0 },
  ];

  return (
    <div className="docs-pagina">
      <div className="com-topo">
        <h1 className="titulo-pixel com-titulo">Comercial</h1>
        <div className="com-acoes">
          <button type="button" className="botao" onClick={() => setOrgNovaAberta(true)}>
            Nova organização
          </button>
          <button type="button" className="botao botao-destaque" onClick={() => setNovoAberto(true)}>
            Novo negócio
          </button>
        </div>
      </div>

      <div className="com-indicadores">
        {indicadores.map((i) => (
          <div key={i.rotulo} className={`painel com-indicador${i.alerta ? " alerta" : ""}`}>
            <div className="com-indicador-valor mono">{i.valor}</div>
            <div className="texto-secundario">{i.rotulo}</div>
          </div>
        ))}
      </div>

      <div className="com-abas" role="tablist">
        {(
          [
            ["hoje", "Hoje"],
            ["funil", "Funil"],
            ["organizacoes", "Organizações"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            className={`com-aba${aba === id ? " ativa" : ""}`}
            onClick={() => setAba(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      {carregando && <p className="texto-secundario">Carregando…</p>}

      {!carregando && aba === "hoje" && hoje && (
        <div className="com-grupos">
          <Grupo titulo="Vencidos" itens={hoje.vencidos} />
          <Grupo titulo="Hoje" itens={hoje.hoje} vazio="Nada marcado para hoje." />
          <Grupo titulo="Próximos 7 dias" itens={hoje.proximos} vazio="Nada nos próximos 7 dias." />
          <Grupo titulo="Sem próximo passo" itens={hoje.sem_passo} />
          {negocios.length === 0 && (
            <p className="texto-secundario">
              Ainda não há negócios. Comece com “Novo negócio” ou peça no chat para o Negócios propor um.
            </p>
          )}
        </div>
      )}

      {!carregando && aba === "funil" && <Funil negocios={negocios} onMover={(n, e) => mover(n, e)} />}

      {!carregando && aba === "organizacoes" && (
        <div className="com-orgs">
          {organizacoes.length === 0 && <p className="texto-secundario">Nenhuma organização cadastrada.</p>}
          {organizacoes.map((o) => (
            <Link key={o.id} href={`/comercial/organizacoes/${o.id}`} className="painel com-org">
              <div className="com-item-titulo">{o.nome}</div>
              <div className="texto-secundario">
                {ROTULO_TIPO_ORG[o.tipo] ?? o.tipo}
                {o.area ? ` · ${ROTULO_AREA[o.area] ?? o.area}` : ""}
                {o.cidade ? ` · ${o.cidade}` : ""}
              </div>
              <div className="mono texto-secundario">
                {o.negocios_abertos ?? 0} negócio(s) · {o.total_contatos ?? 0} contato(s)
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal titulo="Novo negócio" aberto={novoAberto} onFechar={() => setNovoAberto(false)}>
        <NegocioForm
          organizacoes={organizacoes}
          rotuloSalvar="Criar negócio"
          onSalvar={criarNegocio}
          onCancelar={() => setNovoAberto(false)}
        />
      </Modal>

      <Modal titulo="Nova organização" aberto={orgNovaAberta} onFechar={() => setOrgNovaAberta(false)}>
        <OrganizacaoNova
          onCriada={async () => {
            setOrgNovaAberta(false);
            await carregar();
          }}
          onCancelar={() => setOrgNovaAberta(false)}
        />
      </Modal>

      <Modal titulo="Marcar como perdido" aberto={perda !== null} onFechar={() => setPerda(null)}>
        <form
          className="com-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (perda) mover(perda, "perdido", motivo.trim());
          }}
        >
          <p className="texto-secundario">{perda?.titulo}</p>
          <div className="com-campo">
            <label htmlFor="motivo">Motivo da perda</label>
            <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={500} autoFocus />
          </div>
          {erroModal && (
            <p role="alert" className="com-erro">
              {erroModal}
            </p>
          )}
          <div className="com-acoes">
            <button type="button" className="botao" onClick={() => setPerda(null)}>
              Cancelar
            </button>
            <button type="submit" className="botao botao-destaque">
              Confirmar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function OrganizacaoNova({ onCriada, onCancelar }: { onCriada: () => Promise<void>; onCancelar: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("clinica");
  const [cidade, setCidade] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  return (
    <form
      className="com-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
          await enviar("/comercial/organizacoes", { nome: nome.trim(), tipo, cidade: cidade.trim() || null });
          await onCriada();
        } catch (e2) {
          setErro(e2 instanceof Error ? e2.message : "Não foi possível criar.");
        } finally {
          setSalvando(false);
        }
      }}
    >
      <div className="com-campo">
        <label htmlFor="on-nome">Nome</label>
        <input id="on-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={200} />
      </div>
      <div className="com-linha">
        <div className="com-campo">
          <label htmlFor="on-tipo">Tipo</label>
          <select id="on-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_ORG.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_ORG[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="com-campo">
          <label htmlFor="on-cidade">Cidade</label>
          <input id="on-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} />
        </div>
      </div>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      <div className="com-acoes">
        <button type="button" className="botao" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="botao botao-destaque" disabled={salvando}>
          {salvando ? "Salvando…" : "Criar organização"}
        </button>
      </div>
    </form>
  );
}
