"use client";

// Início: painel do dia. No topo, o cartão "Seu dia" (o que precisa de você, com atalhos) e os números; embaixo,
// a semana (tarefas, Comercial e reuniões), o que espera aprovação, a atividade dos agentes e os docs recentes.
// Só lê endpoints que as outras telas já usam; nada é alterado aqui.

import { semImagens } from "../../../components/TextoComImagens";
import { useEffect, useState } from "react";
import Link from "next/link";
import { obter } from "../../../lib/api";
import { formatarDia, formatarReais, hojeISO, type Hoje, type Negocio, type ResumoFunil } from "../../../lib/comercial";
import { tempoRelativo, type DocumentoResumo } from "../../../lib/docs";
import { agentePorId } from "../../../lib/agents";
import { diaPorExtenso, type AgendaResumo, type ItemCal } from "../../../lib/calendario";
import { resumoDoDia } from "../../../lib/resumoDia";
import { situacaoPrazo, type Tarefa } from "../../../lib/tarefas";
import { nomeUsuario } from "../../../lib/exibicao";

type AprovacaoItem = { id: number; tipo: string; proposta: Record<string, unknown>; pedido_por: string | null };
type Mencao = { id: number | string; documento_id: number | null; documento_titulo: string | null; tarefa_id?: number | null; tarefa_titulo?: string | null; autor: string; texto: string };
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

const ROTULO_ITEM: Record<ItemCal["tipo"], string> = { tarefa: "Tarefa", negocio: "Comercial", reuniao: "Reunião" };

// Dia da semana em palavras para a lista da semana: "Hoje", "Amanhã" ou "Quarta, 25".
function rotuloDia(data: string, hoje: string): string {
  const n = Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  if (n === 0) return "Hoje";
  if (n === 1) return "Amanhã";
  const nome = diaPorExtenso(data).split(",")[0];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${Number(data.slice(8))}`;
}

function dataDeHoje(): string {
  const t = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Icone({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ATALHOS = [
  { href: "/tarefas", rotulo: "Tarefa", d: "M12 5v14M5 12h14" },
  { href: "/chat", rotulo: "Perguntar", d: "M4 5h16v10H9l-5 4V5z" },
  { href: "/calendario", rotulo: "Agenda", d: "M3.5 5h17v15h-17zM3.5 10h17M8 3v4M16 3v4" },
  { href: "/comercial", rotulo: "Negócio", d: "M3 8h18v11H3zM9 8V5h6v3M3 13h18" },
];

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
  const [agenda, setAgenda] = useState<AgendaResumo | null>(null);

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
    pegar<AgendaResumo>("/calendario/agenda", setAgenda);
    pegar<Mencao[]>("/mencoes", (l) => setMencoes(Array.isArray(l) ? l : []));
    pegar<DocumentoResumo[]>("/documentos", (l) => setDocs(Array.isArray(l) ? l.slice(0, 5) : []));
    return () => {
      ativo = false;
    };
  }, []);

  const nome = nomeUsuario(usuario);
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

  const hojeData = hojeISO();
  const tarefasAbertas = minhasTarefas.filter((t) => !t.coluna_concluida);
  const tarefasVencidas = tarefasAbertas.filter((t) => situacaoPrazo(t, hojeData) === "vencida").length;
  const semana = agenda ? [...agenda.atrasados.filter((i) => !i.feito), ...agenda.de_hoje, ...agenda.proximos] : [];
  const porDia = semana.reduce<Record<string, ItemCal[]>>((acc, i) => {
    const chave = i.data < hojeData ? "atrasados" : i.data;
    (acc[chave] ??= []).push(i);
    return acc;
  }, {});
  const dias = Object.keys(porDia).sort((x, y) => (x === "atrasados" ? -1 : y === "atrasados" ? 1 : x.localeCompare(y)));

  const numeros = [
    { href: "/aprovacoes", rotulo: "Para aprovar", valor: String(aprovacoes.length), nota: aprovacoes.length ? "esperando decisão" : "nada pendente", tom: aprovacoes.length ? "alerta" : "" },
    { href: "/tarefas", rotulo: "Suas tarefas abertas", valor: String(tarefasAbertas.length), nota: tarefasVencidas ? `${tarefasVencidas} vencida${tarefasVencidas > 1 ? "s" : ""}` : "nenhuma vencida", tom: tarefasVencidas ? "perigo" : "" },
    { href: "/comercial", rotulo: "Negócios em aberto", valor: resumo ? String(resumo.abertos) : "—", nota: resumo ? `${formatarReais(resumo.valor_mensal_potencial)}/mês em potencial` : "", tom: "" },
    { href: "/incidentes", rotulo: "Incidentes abertos", valor: String(incidentes), nota: incidentes ? "o Vigia achou falhas" : "tudo funcionando", tom: incidentes ? "perigo" : "sucesso" },
  ];

  return (
    <div className="docs-pagina ini-pagina">
      <div className="com-topo">
        <div>
          <p className="ini-data">{dataDeHoje()}</p>
          <h1 className="titulo-pixel com-titulo">
            {saudacao()}
            {nome ? `, ${nome}` : ""}
          </h1>
        </div>
        <div className="com-acoes">
          <Link href="/calendario" className="botao">
            Abrir agenda
          </Link>
          <Link href="/chat" className="botao botao-destaque">
            Perguntar ao Orquestrador
          </Link>
        </div>
      </div>

      <div className="ini-topo">
        <section className="ini-heroi" aria-label="Seu dia">
          <div className="ini-heroi-cabeca">
            <span className="ini-heroi-rotulo">Seu dia</span>
            <span className="ini-heroi-numero">{seuDia.length === 0 ? "Tudo em dia" : `${seuDia.length} ${seuDia.length === 1 ? "coisa precisa" : "coisas precisam"} de você`}</span>
          </div>
          {seuDia.length === 0 ? (
            <p className="ini-heroi-vazio">Nada vencido, parado ou esperando você.</p>
          ) : (
            <ul className="ini-heroi-lista">
              {seuDia.slice(0, 4).map((i) => (
                <li key={i.chave}>
                  <Link href={i.href} className={i.alerta ? "alerta" : undefined}>
                    <span className="ini-heroi-ponto" aria-hidden="true" />
                    <span>
                      <strong>{i.texto}</strong>
                      {i.detalhes.length > 0 && <span> · {i.detalhes.join(", ")}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <nav className="ini-atalhos" aria-label="Atalhos">
            {ATALHOS.map((a) => (
              <Link key={a.href} href={a.href} className="ini-atalho">
                <Icone d={a.d} />
                {a.rotulo}
              </Link>
            ))}
          </nav>
        </section>

        <div className="ini-numeros">
          {numeros.map((n) => (
            <Link key={n.rotulo} href={n.href} className={`ini-numero${n.tom ? ` tom-${n.tom}` : ""}`}>
              <span className="ini-numero-rotulo">{n.rotulo}</span>
              <span className="ini-numero-valor">{n.valor}</span>
              <span className="ini-numero-nota">{n.nota}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="ini-colunas">
        <section className="painel ini-cartao ini-semana" aria-label="Próximos 7 dias">
          <header className="ini-cartao-topo">
            <div>
              <h2 className="com-grupo-titulo">Próximos 7 dias</h2>
              <p className="ini-cartao-sub">Tarefas com prazo, passos do Comercial e reuniões</p>
            </div>
            <Link href="/calendario" className="ini-ver">
              Calendário
            </Link>
          </header>
          {dias.length === 0 ? (
            <p className="ini-vazio">Nada marcado para esta semana.</p>
          ) : (
            dias.map((dia) => (
              <div key={dia} className="ini-dia-grupo">
                <h3 className={`ini-dia-rotulo${dia === "atrasados" ? " perigo" : ""}`}>{dia === "atrasados" ? "Atrasados" : rotuloDia(dia, hojeData)}</h3>
                <ul className="ini-itens">
                  {porDia[dia].map((i) => {
                    const conteudo = (
                      <>
                        <span className={`ini-tipo tipo-${i.tipo}`}>{ROTULO_ITEM[i.tipo]}</span>
                        <span className="ini-item-titulo">{i.titulo}</span>
                        <span className="ini-item-meta">
                          {i.hora ? i.hora.slice(0, 5) : ""}
                          {i.responsavel ? `${i.hora ? " · " : ""}${nomeUsuario(i.responsavel)}` : ""}
                        </span>
                      </>
                    );
                    return (
                      <li key={`${i.tipo}-${i.id}`}>
                        {i.href ? (
                          <Link href={i.href} className="ini-item">
                            {conteudo}
                          </Link>
                        ) : (
                          <span className="ini-item">{conteudo}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>

        <div className="ini-lateral">
          <section className="painel ini-cartao" aria-label="Para aprovar">
            <header className="ini-cartao-topo">
              <h2 className="com-grupo-titulo">Para aprovar</h2>
              {aprovacoes.length > 0 && (
                <Link href="/aprovacoes" className="ini-ver">
                  Ver todas
                </Link>
              )}
            </header>
            {aprovacoes.length === 0 ? (
              <p className="ini-vazio">Nada pendente. Os agentes aguardam novos pedidos.</p>
            ) : (
              <ul className="ini-itens">
                {aprovacoes.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <Link href="/aprovacoes" className="ini-item">
                      <span className="ini-item-titulo">{tituloAprovacao(a)}</span>
                      {a.pedido_por && <span className="ini-item-meta">pedido por {nomeUsuario(a.pedido_por)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {mencoes.length > 0 && (
            <section className="painel ini-cartao" aria-label="Menções">
              <header className="ini-cartao-topo">
                <h2 className="com-grupo-titulo">Citaram você</h2>
              </header>
              <ul className="ini-itens">
                {mencoes.slice(0, 4).map((m) => (
                  <li key={m.id}>
                    <Link href={m.tarefa_id ? `/tarefas?tarefa=${m.tarefa_id}` : `/docs/${m.documento_id}`} className="ini-item">
                      <span className="ini-item-titulo">{m.tarefa_id ? `ORI-${m.tarefa_id} · ${m.tarefa_titulo}` : m.documento_titulo}</span>
                      <span className="ini-item-meta">
                        {nomeUsuario(m.autor)}: {(() => {
                          const t = semImagens(m.texto);
                          return t.length > 70 ? `${t.slice(0, 70)}…` : t;
                        })()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {passos.length > 0 && (
            <section className="painel ini-cartao" aria-label="Comercial hoje">
              <header className="ini-cartao-topo">
                <h2 className="com-grupo-titulo">Comercial hoje</h2>
                <Link href="/comercial" className="ini-ver">
                  Comercial
                </Link>
              </header>
              <ul className="ini-itens">
                {passos.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <Link href={`/comercial/negocios/${n.id}`} className="ini-item">
                      <span className="ini-item-titulo">{n.organizacao_nome}</span>
                      <span className="ini-item-meta">
                        {n.proximo_passo ?? "sem descrição"} · {formatarDia(n.proximo_passo_em)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="painel ini-cartao" aria-label="Atividade dos agentes">
            <header className="ini-cartao-topo">
              <h2 className="com-grupo-titulo">Agentes agora</h2>
              <Link href="/escritorio" className="ini-ver">
                Escritório
              </Link>
            </header>
            {atividades.length === 0 ? (
              <p className="ini-vazio">Sem atividade recente.</p>
            ) : (
              <ul className="ini-feed">
                {atividades.slice(0, 6).map((a) => {
                  const ag = agentePorId(a.agente);
                  return (
                    <li key={a.id}>
                      <span className="ini-feed-ponto" style={{ background: ag?.cor }} aria-hidden="true" />
                      <span>
                        <strong>{ag?.papel ?? a.agente}</strong> {a.detalhe || a.tipo}
                        <span className="ini-item-meta"> · {tempoRelativo(a.criado_em)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="painel ini-cartao" aria-label="Documentos recentes">
            <header className="ini-cartao-topo">
              <h2 className="com-grupo-titulo">Docs recentes</h2>
              <Link href="/docs" className="ini-ver">
                Docs
              </Link>
            </header>
            {docs.length === 0 ? (
              <p className="ini-vazio">Nenhum documento ainda.</p>
            ) : (
              <ul className="ini-itens">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/docs/${d.id}`} className="ini-item">
                      <span className="ini-item-titulo">{d.titulo}</span>
                      <span className="ini-item-meta">{tempoRelativo(d.atualizado_em)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
