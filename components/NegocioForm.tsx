"use client";

// Formulário de negócio (criar e editar). Na criação, escolhe uma organização existente ou cria uma
// nova no mesmo formulário. Erros da API aparecem sem perder o que foi digitado.

import { useState, type FormEvent } from "react";
import {
  PLANOS,
  ROTULO_TIPO_ORG,
  TIPOS_ORG,
  numeroOuNulo,
  type Negocio,
  type Organizacao,
} from "../lib/comercial";

export type DadosNegocio = {
  organizacao_id?: number;
  organizacao_nome?: string;
  organizacao_tipo?: string;
  titulo: string;
  valor_mensal: number | null;
  pacientes_ativos: number | null;
  plano_interesse: string | null;
  usa_hoje: string | null;
  origem: string | null;
  proximo_passo: string | null;
  proximo_passo_em: string | null;
};

type Props = {
  inicial?: Negocio;
  organizacoes?: Organizacao[];
  organizacaoFixaId?: number;
  rotuloSalvar?: string;
  onSalvar: (dados: DadosNegocio) => Promise<void>;
  onCancelar: () => void;
};

const NOVA = "nova";

export default function NegocioForm({
  inicial,
  organizacoes = [],
  organizacaoFixaId,
  rotuloSalvar = "Salvar",
  onSalvar,
  onCancelar,
}: Props) {
  const editando = Boolean(inicial);
  const [organizacao, setOrganizacao] = useState<string>(
    organizacaoFixaId ? String(organizacaoFixaId) : organizacoes.length ? String(organizacoes[0].id) : NOVA,
  );
  const [orgNome, setOrgNome] = useState("");
  const [orgTipo, setOrgTipo] = useState<string>("clinica");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [valor, setValor] = useState(inicial?.valor_mensal?.toString().replace(".", ",") ?? "");
  const [pacientes, setPacientes] = useState(inicial?.pacientes_ativos?.toString() ?? "");
  const [plano, setPlano] = useState(inicial?.plano_interesse ?? "");
  const [usaHoje, setUsaHoje] = useState(inicial?.usa_hoje ?? "");
  const [origem, setOrigem] = useState(inicial?.origem ?? "");
  const [passo, setPasso] = useState(inicial?.proximo_passo ?? "");
  const [passoEm, setPassoEm] = useState(inicial?.proximo_passo_em?.slice(0, 10) ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const valorNum = numeroOuNulo(valor);
    const pacientesNum = numeroOuNulo(pacientes);
    if (Number.isNaN(valorNum)) return setErro("O valor mensal precisa ser um número.");
    if (Number.isNaN(pacientesNum) || (pacientesNum !== null && !Number.isInteger(pacientesNum)))
      return setErro("O número de pacientes/alunos precisa ser inteiro.");
    const dados: DadosNegocio = {
      titulo: titulo.trim(),
      valor_mensal: valorNum,
      pacientes_ativos: pacientesNum,
      plano_interesse: plano || null,
      usa_hoje: usaHoje.trim() || null,
      origem: origem.trim() || null,
      proximo_passo: passo.trim() || null,
      proximo_passo_em: passoEm || null,
    };
    if (!editando && !organizacaoFixaId) {
      if (organizacao === NOVA) {
        dados.organizacao_nome = orgNome.trim();
        dados.organizacao_tipo = orgTipo;
      } else {
        dados.organizacao_id = Number(organizacao);
      }
    }
    if (organizacaoFixaId) dados.organizacao_id = organizacaoFixaId;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(dados);
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="com-form" onSubmit={enviar}>
      {!editando && !organizacaoFixaId && (
        <div className="com-campo">
          <label htmlFor="nf-org">Organização</label>
          <select id="nf-org" value={organizacao} onChange={(e) => setOrganizacao(e.target.value)}>
            {organizacoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
            <option value={NOVA}>+ Nova organização</option>
          </select>
        </div>
      )}
      {!editando && !organizacaoFixaId && organizacao === NOVA && (
        <div className="com-linha">
          <div className="com-campo">
            <label htmlFor="nf-org-nome">Nome da organização</label>
            <input id="nf-org-nome" value={orgNome} onChange={(e) => setOrgNome(e.target.value)} maxLength={200} required />
          </div>
          <div className="com-campo">
            <label htmlFor="nf-org-tipo">Tipo</label>
            <select id="nf-org-tipo" value={orgTipo} onChange={(e) => setOrgTipo(e.target.value)}>
              {TIPOS_ORG.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_ORG[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="com-campo">
        <label htmlFor="nf-titulo">Título do negócio</label>
        <input id="nf-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required placeholder="Ex.: Piloto de 4 semanas" />
      </div>

      <div className="com-linha">
        <div className="com-campo">
          <label htmlFor="nf-valor">Valor mensal estimado (R$)</label>
          <input id="nf-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </div>
        <div className="com-campo">
          <label htmlFor="nf-pacientes">Pacientes/alunos ativos</label>
          <input id="nf-pacientes" value={pacientes} onChange={(e) => setPacientes(e.target.value)} inputMode="numeric" />
        </div>
        <div className="com-campo">
          <label htmlFor="nf-plano">Pacote de interesse</label>
          <select id="nf-plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
            <option value="">Ainda não definido</option>
            {PLANOS.map((p) => (
              <option key={p} value={p}>
                {p === "essencial" ? "Essencial" : "Completo"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="com-linha">
        <div className="com-campo">
          <label htmlFor="nf-usa">O que usa hoje</label>
          <input id="nf-usa" value={usaHoje} onChange={(e) => setUsaHoje(e.target.value)} maxLength={500} placeholder="Dietbox, Nutrium, MFIT, planilha…" />
        </div>
        <div className="com-campo">
          <label htmlFor="nf-origem">Origem</label>
          <input id="nf-origem" value={origem} onChange={(e) => setOrigem(e.target.value)} maxLength={500} placeholder="Indicação, Instagram, evento…" />
        </div>
      </div>

      <div className="com-linha">
        <div className="com-campo com-campo-largo">
          <label htmlFor="nf-passo">Próximo passo</label>
          <input id="nf-passo" value={passo} onChange={(e) => setPasso(e.target.value)} maxLength={500} placeholder="Ex.: Agendar a demonstração" />
        </div>
        <div className="com-campo">
          <label htmlFor="nf-passo-em">Para quando</label>
          <input id="nf-passo-em" type="date" value={passoEm} onChange={(e) => setPassoEm(e.target.value)} />
        </div>
      </div>

      <p className="com-aviso texto-secundario">
        Registre só dados comerciais. Não coloque dados de saúde de pessoas (pacientes, alunos) aqui.
      </p>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      <div className="com-acoes">
        <button type="button" className="botao" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" className="botao botao-destaque" disabled={salvando}>
          {salvando ? "Salvando…" : rotuloSalvar}
        </button>
      </div>
    </form>
  );
}
