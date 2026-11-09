"use client";

// Calendário (só leitura): prazos de tarefas, próximos passos do Comercial e reuniões num lugar só.
// Os dados vêm de /api/calendario; clicar num item abre a tela de origem (a reunião baixa o .ics).
// Visão (?visao=mes|semana) e dia de referência (?data=AAAA-MM-DD) ficam na URL.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enviar, excluir, obter } from "../../../lib/api";
import Modal from "../../../components/Modal";
import { hojeISO } from "../../../lib/comercial";
import {
  DIAS_SEMANA,
  ROTULO_TIPO,
  agruparPorDia,
  atrasado,
  deslocar,
  diaPorExtenso,
  diasVisiveis,
  filtrar,
  mesDe,
  tituloPeriodo,
  type ItemCal,
  type TipoItem,
  type Visao,
} from "../../../lib/calendario";

const TIPOS: TipoItem[] = ["tarefa", "negocio", "reuniao"];
const MAX_POR_CELULA = 3;

function Item({ item, hoje }: { item: ItemCal; hoje: string }) {
  const classe = `cal-item cal-${item.tipo}${item.feito ? " feito" : ""}${atrasado(item, hoje) ? " atrasado" : ""}`;
  const dica = [item.titulo, item.hora, item.detalhe].filter(Boolean).join(" · ");
  const conteudo = (
    <>
      <span className="cal-ponto" aria-hidden="true" />
      <span className="cal-item-txt">
        {item.hora && <span className="mono cal-hora">{item.hora.slice(0, 5)} </span>}
        {item.titulo}
      </span>
    </>
  );
  if (item.href) {
    return (
      <Link href={item.href} className={classe} title={dica}>
        {conteudo}
      </Link>
    );
  }
  return (
    <a href={item.ics ?? undefined} className={classe} title={`${dica} (baixa o arquivo .ics)`} download>
      {conteudo}
    </a>
  );
}

export default function CalendarioPage() {
  const router = useRouter();
  const [feed, setFeed] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [criandoAta, setCriandoAta] = useState<number | null>(null);
  const [hoje, setHoje] = useState(() => hojeISO());
  const [ref, setRef] = useState(() => hojeISO());
  const [visao, setVisao] = useState<Visao>("mes");
  const [tipos, setTipos] = useState<Set<TipoItem>>(new Set(TIPOS));
  const [somenteMeus, setSomenteMeus] = useState(false);
  const [usuario, setUsuario] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemCal[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const [form, setForm] = useState({ titulo: "", data: "", inicio: "09:00", fim: "10:00", participantes: "", pauta: "" });
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  // Estado inicial a partir da URL (depois da montagem, para não divergir do HTML do servidor).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const data = p.get("data");
    if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) setRef(data);
    if (p.get("visao") === "semana") setVisao("semana");
    setHoje(hojeISO());
    obter<{ usuario: string }>("/me").then((m) => setUsuario(m.usuario)).catch(() => {});
  }, []);

  useEffect(() => {
    const p = new URLSearchParams({ visao, data: ref });
    window.history.replaceState(null, "", `/calendario?${p.toString()}`);
  }, [visao, ref]);

  async function mostrarFeed() {
    try {
      setFeed((await obter<{ url: string }>("/calendario/feed")).url);
    } catch {
      setErro("Não foi possível gerar o link de assinatura.");
    }
  }

  async function copiarFeed() {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // o campo continua selecionável para copiar à mão
    }
  }

  async function criarAta(reuniaoId: number) {
    if (criandoAta !== null) return;
    setCriandoAta(reuniaoId);
    try {
      const ata = await enviar<{ id: number }>(`/reunioes/${reuniaoId}/ata`, {});
      router.push(`/docs/${ata.id}`);
    } catch {
      setErro("Não foi possível criar a ata.");
      setCriandoAta(null);
    }
  }

  function abrirNovo(data?: string) {
    setForm({ titulo: "", data: data ?? diaAberto ?? hoje, inicio: "09:00", fim: "10:00", participantes: "", pauta: "" });
    setErroForm(null);
    setNovo(true);
  }

  async function salvarNovo(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErroForm(null);
    try {
      await enviar("/reunioes", {
        titulo: form.titulo,
        data: form.data,
        hora_inicio: form.inicio,
        hora_fim: form.fim,
        participantes: form.participantes,
        pauta: form.pauta.split("\n"),
      });
      setNovo(false);
      setRef(form.data);
      setRecarregar((n) => n + 1);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirReuniao(id: number) {
    if (!window.confirm("Excluir este compromisso?")) return;
    try {
      await excluir(`/reunioes/${id}`);
      setRecarregar((n) => n + 1);
    } catch {
      setErro("Não foi possível excluir o compromisso.");
    }
  }

  const dias = useMemo(() => diasVisiveis(ref, visao), [ref, visao]);

  useEffect(() => {
    let ativo = true;
    setItens(null);
    obter<ItemCal[]>(`/calendario?de=${dias[0]}&ate=${dias[dias.length - 1]}`)
      .then((l) => {
        if (!ativo) return;
        setItens(Array.isArray(l) ? l : []);
        setErro(null);
      })
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Erro ao carregar o calendário."));
    return () => {
      ativo = false;
    };
  }, [dias, recarregar]);

  const visiveis = useMemo(() => filtrar(itens ?? [], tipos, somenteMeus ? usuario : null), [itens, tipos, somenteMeus, usuario]);
  const porDia = useMemo(() => agruparPorDia(visiveis), [visiveis]);
  const doDiaAberto = diaAberto ? (porDia.get(diaAberto) ?? []) : [];

  function alternarTipo(t: TipoItem) {
    setTipos((atual) => {
      const novo = new Set(atual);
      if (novo.has(t)) novo.delete(t);
      else novo.add(t);
      return novo;
    });
  }

  return (
    <div className="docs-pagina docs-pagina-larga">
      <div className="com-topo">
        <h1 className="titulo-pixel com-titulo">Calendário</h1>
        <p className="texto-secundario" style={{ margin: "6px 0 0" }}>
          Prazos de tarefas, próximos passos do Comercial e reuniões. Crie compromissos aqui ou abra um item para mudar a data.
        </p>
      </div>

      <div className="cal-barra">
        <div className="cal-nav">
          <button type="button" aria-label="Anterior" onClick={() => setRef(deslocar(ref, visao, -1))}>
            ‹
          </button>
          <button type="button" onClick={() => setRef(hoje)}>
            Hoje
          </button>
          <button type="button" aria-label="Próximo" onClick={() => setRef(deslocar(ref, visao, 1))}>
            ›
          </button>
          <h2 className="cal-titulo">{tituloPeriodo(ref, visao)}</h2>
        </div>
        <div className="cal-controles">
          <div className="cal-visao" role="group" aria-label="Visão">
            {(["mes", "semana"] as Visao[]).map((v) => (
              <button key={v} type="button" aria-pressed={visao === v} onClick={() => setVisao(v)}>
                {v === "mes" ? "Mês" : "Semana"}
              </button>
            ))}
          </div>
          {TIPOS.map((t) => (
            <button key={t} type="button" className={`cal-filtro cal-${t}`} aria-pressed={tipos.has(t)} onClick={() => alternarTipo(t)}>
              <span className="cal-ponto" aria-hidden="true" />
              {ROTULO_TIPO[t]}
            </button>
          ))}
          <button type="button" className="botao botao-destaque" onClick={() => abrirNovo()}>
            + Novo compromisso
          </button>
          <button type="button" className="cal-filtro" onClick={feed ? () => setFeed(null) : mostrarFeed} aria-expanded={feed !== null}>
            Assinar no Google Agenda
          </button>
          <label className="cal-meus">
            <input type="checkbox" checked={somenteMeus} onChange={(e) => setSomenteMeus(e.target.checked)} />
            Só meus
          </label>
        </div>
      </div>

      {feed && (
        <section className="painel cal-feed" aria-label="Assinar o calendário">
          <p style={{ margin: 0 }}>
            No Google Agenda: <strong>Outras agendas → Por URL</strong>, e cole o endereço abaixo. As reuniões, os prazos e os
            próximos passos passam a aparecer lá (a atualização do Google pode levar algumas horas).
          </p>
          <div className="cal-feed-linha">
            <input readOnly value={feed} onFocus={(e) => e.currentTarget.select()} aria-label="Endereço do calendário" />
            <button type="button" className="botao" onClick={copiarFeed}>
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="texto-secundario" style={{ margin: 0, fontSize: 13 }}>
            Este endereço é pessoal e dá acesso de leitura: não compartilhe fora do time.
          </p>
        </section>
      )}

      {erro && (
        <p role="alert" className="doc-erro">
          {erro}
        </p>
      )}

      <div className={`cal-grade ${visao}`} aria-busy={itens === null} role="grid" aria-label={tituloPeriodo(ref, visao)}>
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="cal-cabeca" role="columnheader">
            {d}
          </div>
        ))}
        {dias.map((dia) => {
          const doDia = porDia.get(dia) ?? [];
          const fora = visao === "mes" && mesDe(dia) !== mesDe(ref);
          const limite = visao === "mes" ? MAX_POR_CELULA : doDia.length;
          return (
            <div
              key={dia}
              role="gridcell"
              className={`cal-dia${fora ? " fora" : ""}${dia === hoje ? " hoje" : ""}${diaAberto === dia ? " aberto" : ""}`}
            >
              <button type="button" className="cal-dia-num" onClick={() => setDiaAberto(diaAberto === dia ? null : dia)} aria-label={`${diaPorExtenso(dia)}: ${doDia.length} item(ns)`}>
                {Number(dia.slice(8))}
                {doDia.length > 0 && <span className="cal-contagem mono">{doDia.length}</span>}
              </button>
              <div className="cal-itens">
                {doDia.slice(0, limite).map((i) => (
                  <Item key={`${i.tipo}-${i.id}`} item={i} hoje={hoje} />
                ))}
                {doDia.length > limite && (
                  <button type="button" className="cal-mais" onClick={() => setDiaAberto(dia)}>
                    +{doDia.length - limite}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {itens !== null && visiveis.length === 0 && (
        <p className="texto-secundario" style={{ marginTop: 14 }}>
          Nada neste período{tipos.size < TIPOS.length || somenteMeus ? " com os filtros escolhidos" : ""}.
        </p>
      )}

      <Modal titulo="Novo compromisso" aberto={novo} onFechar={() => setNovo(false)}>
        <form className="com-form" onSubmit={salvarNovo}>
          <div className="com-campo">
            <label htmlFor="cn-titulo">Título</label>
            <input id="cn-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} maxLength={120} required autoFocus />
          </div>
          <div className="com-linha">
            <div className="com-campo">
              <label htmlFor="cn-data">Data</label>
              <input id="cn-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required />
            </div>
            <div className="com-campo">
              <label htmlFor="cn-ini">Início</label>
              <input id="cn-ini" type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} required />
            </div>
            <div className="com-campo">
              <label htmlFor="cn-fim">Fim</label>
              <input id="cn-fim" type="time" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} required />
            </div>
          </div>
          <div className="com-campo">
            <label htmlFor="cn-part">Participantes (separe por vírgula)</label>
            <input id="cn-part" value={form.participantes} onChange={(e) => setForm({ ...form, participantes: e.target.value })} />
          </div>
          <div className="com-campo">
            <label htmlFor="cn-pauta">Pauta (um item por linha)</label>
            <textarea id="cn-pauta" rows={3} value={form.pauta} onChange={(e) => setForm({ ...form, pauta: e.target.value })} />
          </div>
          {erroForm && (
            <p role="alert" className="com-erro">
              {erroForm}
            </p>
          )}
          <div className="com-acoes">
            <span style={{ flex: 1 }} />
            <button type="button" className="botao" onClick={() => setNovo(false)}>
              Cancelar
            </button>
            <button type="submit" className="botao botao-destaque" disabled={salvando || !form.titulo.trim()}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>

      {diaAberto && (
        <section className="painel cal-detalhe" aria-label={`Itens de ${diaPorExtenso(diaAberto)}`}>
          <h2 className="com-grupo-titulo">{diaPorExtenso(diaAberto)}</h2>
          {doDiaAberto.length === 0 ? (
            <p className="texto-secundario" style={{ margin: 0 }}>
              Sem itens neste dia.
            </p>
          ) : (
            <ul>
              {doDiaAberto.map((i) => (
                <li key={`${i.tipo}-${i.id}`}>
                  <Item item={i} hoje={hoje} />
                  {i.tipo === "reuniao" && (
                    <button type="button" className="botao" onClick={() => excluirReuniao(i.id)}>
                      Excluir
                    </button>
                  )}
                  {i.tipo === "reuniao" && (
                    <button type="button" className="botao cal-ata" disabled={criandoAta === i.id} onClick={() => criarAta(i.id)}>
                      {criandoAta === i.id ? "Criando…" : "Criar ata"}
                    </button>
                  )}
                  {(i.detalhe || i.responsavel) && (
                    <span className="texto-secundario cal-sub">{[i.responsavel, i.detalhe].filter(Boolean).join(" · ")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
