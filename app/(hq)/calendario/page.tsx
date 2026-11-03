"use client";

// Calendário (só leitura): prazos de tarefas, próximos passos do Comercial e reuniões num lugar só.
// Os dados vêm de /api/calendario; clicar num item abre a tela de origem (a reunião baixa o .ics).
// Visão (?visao=mes|semana) e dia de referência (?data=AAAA-MM-DD) ficam na URL.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { obter } from "../../../lib/api";
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
  const [hoje, setHoje] = useState(() => hojeISO());
  const [ref, setRef] = useState(() => hojeISO());
  const [visao, setVisao] = useState<Visao>("mes");
  const [tipos, setTipos] = useState<Set<TipoItem>>(new Set(TIPOS));
  const [somenteMeus, setSomenteMeus] = useState(false);
  const [usuario, setUsuario] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemCal[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

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
  }, [dias]);

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
          Prazos de tarefas, próximos passos do Comercial e reuniões. Para mudar uma data, abra o item.
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
          <label className="cal-meus">
            <input type="checkbox" checked={somenteMeus} onChange={(e) => setSomenteMeus(e.target.checked)} />
            Só meus
          </label>
        </div>
      </div>

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
