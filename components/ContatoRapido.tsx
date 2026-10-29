"use client";

// "Falei com o contato": registra a interação com um clique (texto padrão ou o que a pessoa digitou)
// e logo sugere o próximo passo conforme a etapa. Escolher a sugestão grava o passo e a data no negócio.

import { useState } from "react";
import { atualizar, enviar } from "../lib/api";
import {
  ROTULO_INTERACAO,
  formatarDia,
  hojeISO,
  resumoRapido,
  somarDias,
  sugerirProximosPassos,
  type Contato,
  type Negocio,
} from "../lib/comercial";

const TIPOS = ["ligacao", "whatsapp", "email", "reuniao"] as const;
const ROTULO_BOTAO: Record<(typeof TIPOS)[number], string> = {
  ligacao: "Liguei",
  whatsapp: "Falei no WhatsApp",
  email: "Mandei e-mail",
  reuniao: "Tivemos reunião",
};

type Props = {
  negocio: Negocio;
  contatos: Contato[];
  onMudou: () => Promise<void> | void;
};

export default function ContatoRapido({ negocio, contatos, onMudou }: Props) {
  const [contatoId, setContatoId] = useState<number | null>(contatos[0]?.id ?? null);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ tipo: string } | null>(null);
  const [passoDefinido, setPassoDefinido] = useState<string | null>(null);

  const fechado = negocio.etapa === "ganho" || negocio.etapa === "perdido";
  const contato = contatos.find((c) => c.id === contatoId) ?? null;

  async function registrar(tipo: (typeof TIPOS)[number]) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    setPassoDefinido(null);
    try {
      const resumo = nota.trim() || resumoRapido(tipo, contato?.nome ?? null);
      await enviar(`/comercial/negocios/${negocio.id}/interacoes`, { tipo, resumo });
      setNota("");
      setFeito({ tipo });
      await onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setOcupado(false);
    }
  }

  async function definirPasso(texto: string, dias: number) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const data = somarDias(hojeISO(), dias);
      await atualizar(`/comercial/negocios/${negocio.id}`, { proximo_passo: texto, proximo_passo_em: data });
      setPassoDefinido(`${texto} · ${formatarDia(data)}`);
      setFeito(null);
      await onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível definir o próximo passo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="painel com-bloco com-rapido" aria-label="Falei com o contato">
      <h2 className="com-grupo-titulo">Falei com o contato</h2>
      {contatos.length > 1 && (
        <select aria-label="Com quem" value={contatoId ?? ""} onChange={(e) => setContatoId(Number(e.target.value))}>
          {contatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      )}
      <input
        aria-label="Anotação rápida (opcional)"
        placeholder="Anotação rápida (opcional): o que foi combinado?"
        value={nota}
        maxLength={5000}
        onChange={(e) => setNota(e.target.value)}
      />
      <div className="com-rapido-botoes">
        {TIPOS.map((t) => (
          <button key={t} type="button" className="botao" disabled={ocupado} onClick={() => registrar(t)}>
            {ROTULO_BOTAO[t]}
          </button>
        ))}
      </div>

      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}

      <div aria-live="polite">
        {feito && !fechado && (
          <div className="com-rapido-sugestoes">
            <p className="texto-secundario" style={{ margin: "8px 0 6px" }}>
              {ROTULO_INTERACAO[feito.tipo]} registrada. Qual o próximo passo?
            </p>
            <div className="com-rapido-botoes">
              {sugerirProximosPassos(negocio.etapa, feito.tipo).map((s) => (
                <button key={s.texto} type="button" className="botao botao-destaque" disabled={ocupado} onClick={() => definirPasso(s.texto, s.dias)}>
                  {s.texto} · {s.dias === 1 ? "amanhã" : `em ${s.dias} dias`}
                </button>
              ))}
              <button type="button" className="botao" onClick={() => setFeito(null)}>
                Deixar como está
              </button>
            </div>
          </div>
        )}
        {feito && fechado && <p className="texto-secundario">{ROTULO_INTERACAO[feito.tipo]} registrada.</p>}
        {passoDefinido && <p className="texto-secundario">Próximo passo definido: {passoDefinido}.</p>}
      </div>
    </section>
  );
}
