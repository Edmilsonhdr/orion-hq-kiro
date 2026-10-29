"use client";

// Início: resumo do dia (aprovações, Comercial, incidentes, atividade dos agentes e documentos recentes).
// Só lê endpoints que as outras telas já usam; nada é alterado aqui.

import { useEffect, useState } from "react";
import Link from "next/link";
import { obter } from "../../../lib/api";
import { formatarDia, hojeISO, type Hoje, type Negocio, type ResumoFunil } from "../../../lib/comercial";
import { tempoRelativo, type DocumentoResumo } from "../../../lib/docs";
import { agentePorId } from "../../../lib/agents";
import { resumoDoDia } from "../../../lib/resumoDia";
import { situacaoPrazo, type Tarefa } from "../../../lib/tarefas";

type AprovacaoItem = { id: number; tipo: string; proposta: Record<string, unknown>; pedido_por: string | null };
type Mencao = { id: number; documento_id: number; documento_titulo: string; autor: string; texto: string };
type AtividadeItem = { id: number; agente: string; tipo: string; detalhe: string | null; criado_em: string };

const ROTULO_TIPO: Record<string, string> = {
  criar_documento: "Criar documento",
  editar_documento: "Editar documento",
  comercial_novo_negocio: "Novo negócio",
  comercial_atualizar_negocio: "Atualizar negócio",
  comercial_interacao: "Registrar interação",
};

function saudacao(): string {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date())
  );
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function tituloAprovacao(a: AprovacaoItem): string {
  const p = a.proposta as Record<string, unknown> & { campos?: Record<string, unknown> };
  const nome = (p.titulo ?? p.documento_titulo ?? p.negocio_titulo ?? p.campos?.titulo) as string | undefined;
  return nome ? `${ROTULO_TIPO[a.tipo] ?? "Proposta"}: ${nome}` : (ROTULO_TIPO[a.tipo] ?? "Proposta de reunião");
}

export default function InicioPage() {
  const [usuario, setUsuario] = useState("");
  const [aprovacoes, setAprovacoes] = useState<AprovacaoItem[]>([]);
  const [hoje, setHoje] = useState<Hoje | null>(null);
  const [resumo, setResumo] = useState<ResumoFunil | null>(null);
  const [incidentes, setIncidentes] = useState<number>(0);
  const [atividades, setAtividades] = useState<AtividadeItem[]>([]);
  const [docs, setDocs] = useState<DocumentoResumo[]>([]);
  const [mencoes, setMencoes] = useState<Mencao[]>([]);
  const [minhasTarefas, setMinhasTarefas] = useState<Tarefa[]>([]);
  const [parados, setParados] = useState<(Negocio & { dias_parado?: number })[]>([]);
  const [pilotos, setPilotos] = useState<(Negocio & { dias_no_piloto: number })[]>([]);

  useEffect(() => {
    let ativo = true;
    const pegar = <T,>(caminho: string, aplicar: (v: T) => void) =>
      obter<T>(caminho)
        .then((v) => ativo && aplicar(v))
        .catch(() => {});
    pegar<{ usuario: string }>("/me", (m) => {
      setUsuario(m.usuario);
      pegar<Tarefa[]>(`/tarefas?responsavel=${encodeURIComponent(m.usuario)}`, (l) => setMinhasTarefas(Array.isArray(l) ? l : []));
    });
    pegar<AprovacaoItem[]>("/aprovacoes?status=pendente", (l) => setAprovacoes(Array.isArray(l) ? l : []));
    pegar<Hoje>("/comercial/hoje", setHoje);
    pegar<ResumoFunil>("/comercial/resumo", setResumo);
    pegar<{ abertos: number }>("/incidentes/resumo", (r) => setIncidentes(r.abertos ?? 0));
    pegar<AtividadeItem[]>("/atividades", (l) => setAtividades(Array.isArray(l) ? l.slice(-8).reverse() : []));
    pegar<typeof parados>("/comercial/parados", (l) => setParados(Array.isArray(l) ? l : []));
    pegar<typeof pilotos>("/comercial/pilotos", (l) => setPilotos(Array.isArray(l) ? l : []));
    pegar<Mencao[]>("/mencoes", (l) => setMencoes(Array.isArray(l) ? l : []));
    pegar<DocumentoResumo[]>("/documentos", (l) => setDocs(Array.isArray(l) ? l.slice(0, 5) : []));
    return () => {
      ativo = false;
    };
  }, []);

  const nome = usuario ? usuario[0].toUpperCase() + usuario.slice(1) : "";
  const passos = hoje ? [...hoje.vencidos, ...hoje.hoje] : [];
  const seuDia = resumoDoDia({
    aprovacoes: aprovacoes.length,
    vencidos: hoje?.vencidos ?? [],
    hoje: hoje?.hoje ?? [],
    parados,
    pilotos,
    mencoes: mencoes.length,
    incidentes,
    tarefasVencidas: minhasTarefas.filter((t) => situacaoPrazo(t, hojeISO()) === "vencida").map((t) => t.titulo),
    tarefasHoje: minhasTarefas.filter((t) => situacaoPrazo(t, hojeISO()) === "hoje").map((t) => t.titulo),
  });

  return (
    <div className="docs-pagina">
      <div className="com-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">
            {saudacao()}
            {nome ? `, ${nome}` : ""}
          </h1>
          <p className="texto-secundario" style={{ margin: "6px 0 0" }}>
            O que precisa de você hoje.
          </p>
        </div>
      </div>

      <section className="painel ini-dia" aria-label="Seu dia">
        <h2 className="com-grupo-titulo">Seu dia</h2>
        {seuDia.length === 0 ? (
          <p className="texto-secundario" style={{ margin: 0 }}>
            Tudo em dia: nada vencido, parado ou esperando você.
          </p>
        ) : (
          <ul className="ini-dia-lista">
            {seuDia.map((i) => (
              <li key={i.chave} className={i.alerta ? "alerta" : undefined}>
                <Link href={i.href}>{i.texto}</Link>
                {i.detalhes.length > 0 && <span className="texto-secundario"> · {i.detalhes.join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="com-indicadores">
        <Link href="/aprovacoes" className={`painel com-indicador esc-link${aprovacoes.length ? " alerta" : ""}`}>
          <div className="com-indicador-valor mono">{aprovacoes.length}</div>
          <div className="texto-secundario">Aprovações pendentes</div>
        </Link>
        <Link href="/comercial" className={`painel com-indicador esc-link${hoje?.vencidos.length ? " alerta" : ""}`}>
          <div className="com-indicador-valor mono">{passos.length}</div>
          <div className="texto-secundario">Passos do Comercial para hoje</div>
        </Link>
        <Link href="/comercial" className="painel com-indicador esc-link">
          <div className="com-indicador-valor mono">{resumo?.abertos ?? "—"}</div>
          <div className="texto-secundario">Negócios em aberto</div>
        </Link>
        <Link href="/incidentes" className={`painel com-indicador esc-link${incidentes ? " alerta" : ""}`}>
          <div className="com-indicador-valor mono">{incidentes}</div>
          <div className="texto-secundario">Incidentes abertos</div>
        </Link>
      </div>

      <div className="ini-grade">
        <section className="painel ini-bloco" aria-label="Aprovações pendentes">
          <h2 className="com-grupo-titulo">Para aprovar</h2>
          {aprovacoes.length === 0 ? (
            <p className="texto-secundario">Nada pendente. Os agentes aguardam novos pedidos.</p>
          ) : (
            <ul className="ini-lista">
              {aprovacoes.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link href="/aprovacoes">{tituloAprovacao(a)}</Link>
                  {a.pedido_por && <span className="texto-secundario"> · pedido por {a.pedido_por}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {mencoes.length > 0 && (
          <section className="painel ini-bloco" aria-label="Menções">
            <h2 className="com-grupo-titulo">Citaram você</h2>
            <ul className="ini-lista">
              {mencoes.map((m) => (
                <li key={m.id}>
                  <Link href={`/docs/${m.documento_id}`}>{m.documento_titulo}</Link>
                  <span className="texto-secundario">
                    {" "}
                    · {m.autor}: {m.texto.length > 90 ? `${m.texto.slice(0, 90)}…` : m.texto}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="painel ini-bloco" aria-label="Comercial hoje">
          <h2 className="com-grupo-titulo">Comercial hoje</h2>
          {passos.length === 0 ? (
            <p className="texto-secundario">Nenhum próximo passo vencido ou marcado para hoje.</p>
          ) : (
            <ul className="ini-lista">
              {passos.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <Link href={`/comercial/negocios/${n.id}`}>{n.organizacao_nome}</Link>
                  <span className="texto-secundario">
                    {" "}
                    · {n.proximo_passo ?? "sem descrição"} · {formatarDia(n.proximo_passo_em)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="painel ini-bloco" aria-label="Atividade dos agentes">
          <h2 className="com-grupo-titulo">Agentes agora</h2>
          {atividades.length === 0 ? (
            <p className="texto-secundario">Sem atividade recente.</p>
          ) : (
            <ul className="ini-lista">
              {atividades.map((a) => (
                <li key={a.id}>
                  <strong style={{ color: agentePorId(a.agente)?.cor }}>{agentePorId(a.agente)?.papel ?? a.agente}</strong>
                  <span className="texto-secundario"> · {a.detalhe || a.tipo}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/escritorio" className="ini-mais">
            Ver o escritório
          </Link>
        </section>

        <section className="painel ini-bloco" aria-label="Documentos recentes">
          <h2 className="com-grupo-titulo">Docs recentes</h2>
          {docs.length === 0 ? (
            <p className="texto-secundario">Nenhum documento ainda.</p>
          ) : (
            <ul className="ini-lista">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`/docs/${d.id}`}>{d.titulo}</Link>
                  <span className="texto-secundario"> · {tempoRelativo(d.atualizado_em)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/docs" className="ini-mais">
            Abrir Docs
          </Link>
        </section>

        <section className="painel ini-bloco" aria-label="Backup">
          <h2 className="com-grupo-titulo">Backup</h2>
          <p className="texto-secundario" style={{ marginTop: 0 }}>
            Baixe tudo o que vocês escreveram (Docs, Comercial, conversas e anexos) num arquivo só. Guarde uma cópia
            fora deste computador de vez em quando.
          </p>
          <div className="com-acoes">
            <a className="botao botao-destaque" href="/api/backup" download>
              Baixar backup completo
            </a>
            <a className="botao" href="/api/backup?anexos_incluidos=false" download>
              Sem anexos (menor)
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
