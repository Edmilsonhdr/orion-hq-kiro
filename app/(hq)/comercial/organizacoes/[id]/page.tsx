"use client";

// Organização: dados, contatos e negócios (spec comercial, Requirements 1.5 e 5).

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Modal from "../../../../../components/Modal";
import NegocioForm, { type DadosNegocio } from "../../../../../components/NegocioForm";
import { ErroApi, atualizar, enviar, obter } from "../../../../../lib/api";
import {
  AREAS,
  ROTULO_AREA,
  ROTULO_ETAPA,
  ROTULO_TIPO_ORG,
  TIPOS_ORG,
  formatarReais,
  type OrganizacaoDetalhe,
} from "../../../../../lib/comercial";

export default function OrganizacaoPage() {
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<OrganizacaoDetalhe | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNegocio, setNovoNegocio] = useState(false);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("clinica");
  const [area, setArea] = useState("");
  const [cidade, setCidade] = useState("");
  const [site, setSite] = useState("");
  const [obs, setObs] = useState("");
  const [salvou, setSalvou] = useState(false);

  const [cNome, setCNome] = useState("");
  const [cCargo, setCCargo] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cTel, setCTel] = useState("");

  const carregar = useCallback(async () => {
    try {
      const o = await obter<OrganizacaoDetalhe>(`/comercial/organizacoes/${id}`);
      setOrg(o);
      setNome(o.nome);
      setTipo(o.tipo);
      setArea(o.area ?? "");
      setCidade(o.cidade ?? "");
      setSite(o.site ?? "");
      setObs(o.observacoes ?? "");
      setErro(null);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 404) setNaoEncontrada(true);
      else setErro(e instanceof Error ? e.message : "Erro ao carregar a organização.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await atualizar(`/comercial/organizacoes/${id}`, {
        nome: nome.trim(),
        tipo,
        area: area || null,
        cidade: cidade.trim() || null,
        site: site.trim() || null,
        observacoes: obs.trim() || null,
      });
      setSalvou(true);
      setTimeout(() => setSalvou(false), 2000);
      await carregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
    }
  }

  async function adicionarContato(e: FormEvent) {
    e.preventDefault();
    try {
      await enviar(`/comercial/organizacoes/${id}/contatos`, {
        nome: cNome.trim(),
        cargo: cCargo.trim() || null,
        email: cEmail.trim() || null,
        telefone: cTel.trim() || null,
      });
      setCNome(""); setCCargo(""); setCEmail(""); setCTel("");
      await carregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível adicionar o contato.");
    }
  }

  async function removerContato(contatoId: number) {
    if (!window.confirm("Excluir este contato?")) return;
    await fetch(`/api/comercial/contatos/${contatoId}`, { method: "DELETE" });
    await carregar();
  }

  async function arquivar() {
    if (!org || !window.confirm(`Arquivar “${org.nome}”? Ela some das listas, mas os negócios continuam salvos.`)) return;
    try {
      await enviar(`/comercial/organizacoes/${id}/arquivar`, { arquivada: true });
      window.location.href = "/comercial";
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível arquivar.");
    }
  }

  async function criarNegocio(dados: DadosNegocio) {
    await enviar("/comercial/negocios", { ...dados, organizacao_id: Number(id) });
    setNovoNegocio(false);
    await carregar();
  }

  if (naoEncontrada)
    return (
      <div className="docs-pagina">
        <p>Organização não encontrada.</p>
        <Link href="/comercial">← Voltar ao Comercial</Link>
      </div>
    );
  if (!org)
    return (
      <div className="docs-pagina">
        {erro ? <p role="alert" className="com-erro">{erro}</p> : <p className="texto-secundario">Carregando…</p>}
      </div>
    );

  return (
    <div className="docs-pagina">
      <nav className="doc-migalhas" aria-label="Você está em">
        <Link href="/comercial">Comercial</Link> <span aria-hidden="true">/</span> {org.nome}
      </nav>
      <div className="com-topo">
        <h1 className="com-titulo-negocio">{org.nome}</h1>
        <div className="com-acoes">
          <button type="button" className="botao" onClick={arquivar}>Arquivar</button>
          <button type="button" className="botao botao-destaque" onClick={() => setNovoNegocio(true)}>Novo negócio</button>
        </div>
      </div>
      {erro && <p role="alert" className="com-erro">{erro}</p>}

      <div className="com-detalhe">
        <section className="painel com-bloco">
          <h2 className="com-grupo-titulo">Dados</h2>
          <form className="com-form" onSubmit={salvar}>
            <div className="com-campo">
              <label htmlFor="o-nome">Nome</label>
              <input id="o-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={200} />
            </div>
            <div className="com-linha">
              <div className="com-campo">
                <label htmlFor="o-tipo">Tipo</label>
                <select id="o-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_ORG.map((t) => <option key={t} value={t}>{ROTULO_TIPO_ORG[t]}</option>)}
                </select>
              </div>
              <div className="com-campo">
                <label htmlFor="o-area">Área</label>
                <select id="o-area" value={area} onChange={(e) => setArea(e.target.value)}>
                  <option value="">Não informada</option>
                  {AREAS.map((a) => <option key={a} value={a}>{ROTULO_AREA[a]}</option>)}
                </select>
              </div>
            </div>
            <div className="com-linha">
              <div className="com-campo">
                <label htmlFor="o-cidade">Cidade</label>
                <input id="o-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} />
              </div>
              <div className="com-campo">
                <label htmlFor="o-site">Site</label>
                <input id="o-site" value={site} onChange={(e) => setSite(e.target.value)} maxLength={500} />
              </div>
            </div>
            <div className="com-campo">
              <label htmlFor="o-obs">Observações</label>
              <textarea id="o-obs" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={5000} />
            </div>
            <div className="com-acoes">
              {salvou && <span className="texto-secundario" role="status">Salvo</span>}
              <button type="submit" className="botao botao-destaque">Salvar</button>
            </div>
          </form>
        </section>

        <div className="com-coluna">
          <section className="painel com-bloco">
            <h2 className="com-grupo-titulo">Contatos</h2>
            {org.contatos.length === 0 && <p className="texto-secundario">Nenhum contato ainda.</p>}
            <ul className="com-lista">
              {org.contatos.map((c) => (
                <li key={c.id} className="com-item">
                  <div>
                    {c.nome}{c.cargo ? ` · ${c.cargo}` : ""}
                    <div className="texto-secundario">{[c.email, c.telefone].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button type="button" className="botao com-excluir" onClick={() => removerContato(c.id)} aria-label={`Excluir ${c.nome}`}>
                    Excluir
                  </button>
                </li>
              ))}
            </ul>
            <form className="com-form" onSubmit={adicionarContato}>
              <div className="com-linha">
                <div className="com-campo"><label htmlFor="c-nome">Nome</label><input id="c-nome" value={cNome} onChange={(e) => setCNome(e.target.value)} required maxLength={200} /></div>
                <div className="com-campo"><label htmlFor="c-cargo">Cargo</label><input id="c-cargo" value={cCargo} onChange={(e) => setCCargo(e.target.value)} maxLength={100} /></div>
              </div>
              <div className="com-linha">
                <div className="com-campo"><label htmlFor="c-email">E-mail</label><input id="c-email" type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} /></div>
                <div className="com-campo"><label htmlFor="c-tel">Telefone</label><input id="c-tel" value={cTel} onChange={(e) => setCTel(e.target.value)} maxLength={40} /></div>
              </div>
              <div className="com-acoes"><button type="submit" className="botao">Adicionar contato</button></div>
            </form>
          </section>

          <section className="painel com-bloco">
            <h2 className="com-grupo-titulo">Negócios</h2>
            {org.negocios.length === 0 && <p className="texto-secundario">Nenhum negócio.</p>}
            <ul className="com-lista">
              {org.negocios.map((n) => (
                <li key={n.id} className="com-item">
                  <Link href={`/comercial/negocios/${n.id}`} className="com-item-titulo">{n.titulo}</Link>
                  <span className="texto-secundario">{ROTULO_ETAPA[n.etapa]} · {formatarReais(n.valor_mensal)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <Modal titulo="Novo negócio" aberto={novoNegocio} onFechar={() => setNovoNegocio(false)}>
        <NegocioForm organizacaoFixaId={Number(id)} rotuloSalvar="Criar negócio" onSalvar={criarNegocio} onCancelar={() => setNovoNegocio(false)} />
      </Modal>
    </div>
  );
}
