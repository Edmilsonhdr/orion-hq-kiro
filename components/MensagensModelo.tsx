"use client";

// Modelos de mensagem para copiar (ou abrir no WhatsApp). O texto vem de lib/comercial.ts.

import { useMemo, useState } from "react";
import { modelosDeMensagem, type Contato, type Negocio } from "../lib/comercial";

function soDigitos(telefone: string | null): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

export default function MensagensModelo({
  negocio,
  contatos,
  usuario,
}: {
  negocio: Negocio;
  contatos: Contato[];
  usuario: string;
}) {
  const [contatoId, setContatoId] = useState<number | null>(contatos[0]?.id ?? null);
  const [modeloId, setModeloId] = useState("primeiro");
  const [copiado, setCopiado] = useState(false);
  const contato = contatos.find((c) => c.id === contatoId) ?? null;
  const modelos = useMemo(
    () => modelosDeMensagem(negocio, contato?.nome ?? null, usuario ? usuario[0].toUpperCase() + usuario.slice(1) : "a equipe"),
    [negocio, contato, usuario]
  );
  const modelo = modelos.find((m) => m.id === modeloId) ?? modelos[0];
  const [texto, setTexto] = useState<string | null>(null);
  const atual = texto ?? modelo.texto;
  const fone = soDigitos(contato?.telefone ?? null);
  const email = contato?.email?.trim() || null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(atual);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // sem permissão de área de transferência: o texto continua selecionável
    }
  }

  return (
    <section className="painel com-mensagens" aria-label="Modelos de mensagem">
      <h2 className="com-grafico-titulo">Modelos de mensagem</h2>
      <div className="com-mensagens-campos">
        <select
          aria-label="Modelo"
          value={modeloId}
          onChange={(e) => {
            setModeloId(e.target.value);
            setTexto(null);
          }}
        >
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
        </select>
        {contatos.length > 0 && (
          <select
            aria-label="Contato"
            value={contatoId ?? ""}
            onChange={(e) => {
              setContatoId(Number(e.target.value));
              setTexto(null);
            }}
          >
            {contatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="texto-secundario com-mensagens-assunto">
        Assunto (e-mail): <strong>{modelo.assunto}</strong>
      </p>
      <textarea aria-label="Texto da mensagem" rows={4} value={atual} onChange={(e) => setTexto(e.target.value)} />
      <div className="com-mensagens-acoes">
        <button type="button" className="botao-destaque" onClick={copiar}>
          {copiado ? "Copiado!" : "Copiar"}
        </button>
        {email && (
          <a className="botao" href={`mailto:${email}?subject=${encodeURIComponent(modelo.assunto)}&body=${encodeURIComponent(atual)}`}>
            Abrir no e-mail
          </a>
        )}
        {fone && (
          <a className="botao" href={`https://wa.me/${fone}?text=${encodeURIComponent(atual)}`} target="_blank" rel="noopener noreferrer">
            Abrir no WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
