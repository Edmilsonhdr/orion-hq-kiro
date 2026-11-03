"use client";

// Métricas de uso do piloto, registradas à mão: só contagens (nunca dado de saúde de paciente).
// Mostra a evolução e a taxa de ativação (pacientes registrando ÷ cadastrados).

import { FormEvent, useCallback, useEffect, useState } from "react";
import { enviar, obter } from "../lib/api";
import { formatarDia, hojeISO } from "../lib/comercial";

type Metrica = {
  id: number;
  medido_em: string;
  profissionais_ativos: number | null;
  pacientes_cadastrados: number | null;
  pacientes_registrando: number | null;
  observacao: string | null;
  autor: string;
  taxa_ativacao: number | null;
};

const dash = (n: number | null) => (n === null ? "—" : String(n));

export default function MetricasPiloto({ negocioId }: { negocioId: number }) {
  const [lista, setLista] = useState<Metrica[] | null>(null);
  const [data, setData] = useState(() => hojeISO());
  const [prof, setProf] = useState("");
  const [cad, setCad] = useState("");
  const [reg, setReg] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    obter<Metrica[]>(`/comercial/negocios/${negocioId}/metricas`)
      .then((l) => setLista(Array.isArray(l) ? l : []))
      .catch(() => setLista([]));
  }, [negocioId]);

  useEffect(carregar, [carregar]);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    try {
      await enviar(`/comercial/negocios/${negocioId}/metricas`, {
        medido_em: data,
        profissionais_ativos: num(prof),
        pacientes_cadastrados: num(cad),
        pacientes_registrando: num(reg),
        observacao: obs.trim() || undefined,
      });
      setProf("");
      setCad("");
      setReg("");
      setObs("");
      carregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível registrar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    if (!window.confirm("Apagar esta medição?")) return;
    await fetch(`/api/comercial/metricas/${id}`, { method: "DELETE" });
    carregar();
  }

  const ultima = lista?.[0];
  const anterior = lista?.[1];
  const variacao =
    ultima?.taxa_ativacao != null && anterior?.taxa_ativacao != null ? ultima.taxa_ativacao - anterior.taxa_ativacao : null;

  return (
    <section className="painel com-bloco" aria-label="Uso do piloto">
      <h2 className="com-grupo-titulo">Uso do piloto</h2>
      <p className="texto-secundario" style={{ margin: "0 0 10px" }}>
        Registre à mão como o piloto está indo. Só números: nunca dados de pacientes.
      </p>
      {ultima && (
        <div className="uso-numeros">
          <div>
            <strong className="mono">{dash(ultima.profissionais_ativos)}</strong>
            <span className="texto-secundario">profissionais ativos</span>
          </div>
          <div>
            <strong className="mono">
              {dash(ultima.pacientes_registrando)}/{dash(ultima.pacientes_cadastrados)}
            </strong>
            <span className="texto-secundario">pacientes registrando</span>
          </div>
          <div>
            <strong className="mono">{ultima.taxa_ativacao === null ? "—" : `${ultima.taxa_ativacao}%`}</strong>
            <span className="texto-secundario">
              ativação{variacao !== null && variacao !== 0 ? ` (${variacao > 0 ? "+" : ""}${variacao} pontos)` : ""}
            </span>
          </div>
        </div>
      )}
      <form className="com-form" onSubmit={registrar}>
        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label>
          Profissionais ativos
          <input type="number" min={0} value={prof} onChange={(e) => setProf(e.target.value)} />
        </label>
        <label>
          Pacientes cadastrados
          <input type="number" min={0} value={cad} onChange={(e) => setCad(e.target.value)} />
        </label>
        <label>
          Pacientes registrando
          <input type="number" min={0} value={reg} onChange={(e) => setReg(e.target.value)} />
        </label>
        <label>
          Observação
          <input value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} />
        </label>
        <button type="submit" className="botao-destaque" disabled={salvando}>
          {salvando ? "Salvando…" : "Registrar medição"}
        </button>
      </form>
      {erro && (
        <p role="alert" className="doc-erro">
          {erro}
        </p>
      )}
      {lista && lista.length > 0 && (
        <ul className="uso-execucoes" style={{ marginTop: 12 }}>
          {lista.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{formatarDia(m.medido_em)}</strong> · {dash(m.profissionais_ativos)} prof. · {dash(m.pacientes_registrando)}/
                {dash(m.pacientes_cadastrados)} pacientes{m.taxa_ativacao !== null ? ` · ${m.taxa_ativacao}%` : ""}
                {m.observacao ? ` · ${m.observacao}` : ""}
              </span>
              <button type="button" className="botao" onClick={() => excluir(m.id)} aria-label="Apagar medição">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
