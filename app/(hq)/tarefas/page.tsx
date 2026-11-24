"use client";

// Tarefas: quadro Kanban por pessoa, com visão em lista. Cada sócia tem o seu quadro (abas); "Todos" mostra o de
// todas. As colunas são personalizáveis. Arrastar o cartão muda a coluna (e a posição); o menu "⋯" do cartão faz o
// mesmo pelo teclado e no celular. Busca e filtros (prazo e prioridade) valem para as duas visões; os números do
// topo também filtram. Atalhos: N cria tarefa, / vai para a busca. Atualiza sozinho para enxergar o que as outras
// mexeram.

import { nomeUsuario } from "../../../lib/exibicao";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ColunasTarefas from "../../../components/ColunasTarefas";
import Icone, { Avatar, IconePrioridade } from "../../../components/IconesTarefa";
import Modal from "../../../components/Modal";
import BacklogTarefas from "../../../components/BacklogTarefas";
import EpicosTarefas from "../../../components/EpicosTarefas";
import TarefaDetalhe, { IconeTipo } from "../../../components/TarefaDetalhe";
import { semImagens } from "../../../components/TextoComImagens";
import TarefaPainel, { type DadosTarefa, type OpcaoDocumento, type OpcaoNegocio } from "../../../components/TarefaPainel";
import { atualizar, enviar, excluir, obter } from "../../../lib/api";
import { hojeISO } from "../../../lib/comercial";
import {
  AGRUPAMENTOS,
  corPessoa,
  etiquetasDe,
  FILTROS_RAPIDOS,
  progresso,
  raias,
  ROTULO_AGRUPAMENTO,
  ROTULO_FILTRO_RAPIDO,
  ROTULO_TIPO_TAREFA,
  TIPOS_TAREFA,
  type Agrupamento,
  type FiltroRapido,
  type Sprint,
  type TipoTarefa,
  filtrarTarefas,
  filtrosAtivos,
  FILTROS_PRAZO,
  FILTROS_VAZIOS,
  moverLocal,
  porColuna,
  posicaoAntesDe,
  PRIORIDADES,
  resumoQuadro,
  ROTULO_FILTRO_PRAZO,
  ROTULO_PRIORIDADE,
  rotuloPrazo,
  situacaoPrazo,
  type ColunaTarefa,
  type Filtros,
  type FiltroPrazo,
  type Prioridade,
  type ResumoPessoa,
  type Tarefa,
} from "../../../lib/tarefas";

const INTERVALO_MS = 15000;
const CHAVE_VISAO = "orion-hq:tarefas-visao";
const maiuscula = (s: string) => nomeUsuario(s);

type Visao = "quadro" | "lista" | "backlog" | "epicos";
type Painel = { modo: "novo"; status: string } | { modo: "editar"; id: number } | null;
type FiltroSalvo = { id: number; nome: string; filtros: Partial<Filtros> & { agrupar?: Agrupamento } };
const CHAVE_AGRUPAR = "orion-hq:tarefas-raias";

export default function TarefasPage() {
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [eu, setEu] = useState("");
  const [vista, setVista] = useState<string>("");
  const [colunas, setColunas] = useState<ColunaTarefa[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [resumo, setResumo] = useState<Record<string, ResumoPessoa>>({});
  const [negocios, setNegocios] = useState<OpcaoNegocio[]>([]);
  const [documentos, setDocumentos] = useState<OpcaoDocumento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState<Visao>("quadro");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [painel, setPainel] = useState<Painel>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [soSprint, setSoSprint] = useState(true); // com sprint ativa, o quadro mostra só ela (como no Jira)
  const [agrupar, setAgrupar] = useState<Agrupamento>("nenhum");
  const [salvos, setSalvos] = useState<FiltroSalvo[]>([]);
  const [versao, setVersao] = useState(0);
  const [compondo, setCompondo] = useState<string | null>(null); // coluna com o campo de nova tarefa aberto
  const [novoTitulo, setNovoTitulo] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [gerindo, setGerindo] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null); // cartão sobre o qual se vai soltar (entra antes dele)
  const buscaRef = useRef<HTMLInputElement>(null);
  const donoRef = useRef(""); // de quem são as colunas exibidas (a aba aberta; em "Todos", as minhas)
  const ocupado = useRef(false); // arrastando ou editando: não sobrescrever o estado local

  const carregar = useCallback(async () => {
    try {
      const [c, l, r, sp] = await Promise.all([
        obter<ColunaTarefa[]>(`/tarefas/colunas${donoRef.current ? `?dono=${encodeURIComponent(donoRef.current)}` : ""}`),
        obter<Tarefa[]>("/tarefas"),
        obter<Record<string, ResumoPessoa>>("/tarefas/resumo"),
        obter<Sprint[]>("/tarefas/sprints"),
      ]);
      setColunas(c);
      if (!ocupado.current) setTarefas(l);
      setResumo(r);
      setSprints(sp);
      setVersao((v) => v + 1);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar as tarefas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const dono = vista && vista !== "todos" ? vista : eu;
  useEffect(() => {
    donoRef.current = dono;
    if (dono) carregar();
  }, [dono, carregar]);

  useEffect(() => {
    ocupado.current = arrastando !== null || painel?.modo === "novo";
  }, [arrastando, painel]);

  // O sino pede para abrir uma tarefa sem recarregar a página.
  useEffect(() => {
    const abrirPeloSino = (e: Event) => setPainel({ modo: "editar", id: Number((e as CustomEvent).detail) });
    window.addEventListener("orion:abrir-tarefa", abrirPeloSino);
    return () => window.removeEventListener("orion:abrir-tarefa", abrirPeloSino);
  }, []);

  useEffect(() => {
    const salva = window.localStorage.getItem(CHAVE_VISAO);
    if (salva === "lista" || salva === "quadro" || salva === "backlog" || salva === "epicos") setVisao(salva);
    const raia = window.localStorage.getItem(CHAVE_AGRUPAR);
    if (raia === "pessoa" || raia === "epico") setAgrupar(raia);
    // ?tarefa=ID abre a tarefa (link copiado do painel)
    const aberta = Number(new URLSearchParams(window.location.search).get("tarefa"));
    if (aberta > 0) setPainel({ modo: "editar", id: aberta });
    obter<FiltroSalvo[]>("/tarefas/filtros").then(setSalvos).catch(() => {});
    obter<string[]>("/usuarios").then(setUsuarios).catch(() => {});
    obter<{ usuario: string }>("/me")
      .then((m) => {
        setEu(m.usuario);
        // ?pessoa=nome abre o quadro de outra pessoa; senão, o meu
        const pedida = new URLSearchParams(window.location.search).get("pessoa");
        setVista(pedida ?? m.usuario);
      })
      .catch(() => {});
    // listas para vincular a tarefa (só opções; sem elas o vínculo fica indisponível)
    obter<(OpcaoNegocio & { etapa: string })[]>("/comercial/negocios")
      .then((l) => setNegocios(l.filter((n) => n.etapa !== "perdido")))
      .catch(() => {});
    obter<OpcaoDocumento[]>("/documentos/arvore").then(setDocumentos).catch(() => {});
    carregar();
    const timer = setInterval(() => {
      if (!document.hidden) carregar();
    }, INTERVALO_MS);
    return () => clearInterval(timer);
  }, [carregar]);

  const primeira = colunas[0]?.chave ?? "";

  // Atalhos: N cria tarefa, / vai para a busca (fora de campos de texto e com nada aberto).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvoTecla = e.target as HTMLElement | null;
      if (painel || gerindo || e.ctrlKey || e.metaKey || e.altKey) return;
      if (alvoTecla && (alvoTecla.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvoTecla.tagName))) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        if (primeira) setPainel({ modo: "novo", status: primeira });
      } else if (e.key === "/") {
        e.preventDefault();
        buscaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [painel, gerindo, primeira]);

  // Menu do cartão fecha com clique fora ou Esc.
  useEffect(() => {
    if (menu === null) return;
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest?.(".tar-menu, .tar-menu-botao")) setMenu(null);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", fechar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", fechar);
    };
  }, [menu]);

  function trocarVisao(v: Visao) {
    setVisao(v);
    window.localStorage.setItem(CHAVE_VISAO, v);
  }

  const hoje = hojeISO();
  const ativa = sprints.find((s) => s.estado === "ativa") ?? null;
  const epicos = useMemo(() => tarefas.filter((t) => t.tipo === "epico"), [tarefas]);
  const semEpicos = useMemo(() => tarefas.filter((t) => t.tipo !== "epico"), [tarefas]);
  const daVista = useMemo(() => {
    let l = vista === "todos" ? semEpicos : semEpicos.filter((t) => t.responsavel === vista);
    if (ativa && soSprint) l = l.filter((t) => t.sprint_id === ativa.id);
    return l;
  }, [semEpicos, vista, ativa, soSprint]);
  const etiquetas = useMemo(() => etiquetasDe(semEpicos), [semEpicos]);
  const visiveis = useMemo(() => filtrarTarefas(daVista, filtros, hoje), [daVista, filtros, hoje]);
  const porCol = useMemo(() => porColuna(visiveis, colunas), [visiveis, colunas]);
  const numeros = useMemo(() => resumoQuadro(daVista, hoje), [daVista, hoje]);
  const contagem = useMemo(
    () => Object.fromEntries(Object.entries(porColuna(tarefas.filter((t) => t.responsavel === dono), colunas)).map(([k, v]) => [k, v.length])),
    [tarefas, colunas, dono],
  );
  const nFiltros = filtrosAtivos(filtros);
  const responsavelNovo = vista === "todos" || !vista ? eu : vista;
  const colunaFeita = colunas.find((c) => c.concluida);

  async function mover(id: number, coluna: ColunaTarefa, posicao?: number) {
    const antes = tarefas;
    setTarefas((l) => moverLocal(l, id, coluna, posicao));
    try {
      await enviar(`/tarefas/${id}/mover`, { status: coluna.chave, posicao: posicao ?? null });
      await carregar();
    } catch (e) {
      setTarefas(antes);
      setErro(e instanceof Error ? e.message : "Não foi possível mover a tarefa.");
    }
  }

  // Concluir manda para a primeira coluna "de concluídas"; reabrir volta para a primeira coluna.
  function alternarConclusao(t: Tarefa) {
    const destino = t.coluna_concluida ? colunas[0] : colunaFeita;
    if (destino) mover(t.id, destino);
  }

  async function criarNaColuna(e: FormEvent, coluna: ColunaTarefa) {
    e.preventDefault();
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    try {
      const nova = await enviar<Tarefa>("/tarefas", { titulo, responsavel: responsavelNovo, sprint_id: ativa && soSprint ? ativa.id : null });
      if (coluna.chave !== primeira) await enviar(`/tarefas/${nova.id}/mover`, { status: coluna.chave, posicao: null });
      setNovoTitulo("");
      setCompondo(null);
      await carregar();
      setPainel({ modo: "editar", id: nova.id }); // como no Jira: criou, abre para completar
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível criar a tarefa.");
    }
  }

  async function salvar(dados: DadosTarefa) {
    if (!painel || painel.modo !== "novo") return;
    const { status, ...campos } = dados;
    const nova = await enviar<Tarefa>("/tarefas", campos);
    if (status !== primeira) await enviar(`/tarefas/${nova.id}/mover`, { status, posicao: null });
    await carregar();
    setPainel({ modo: "editar", id: nova.id });
  }

  function trocarAgrupar(a: Agrupamento) {
    setAgrupar(a);
    window.localStorage.setItem(CHAVE_AGRUPAR, a);
  }

  function alternarRapido(r: FiltroRapido) {
    setFiltros((f) => {
      const atuais = f.rapidos ?? [];
      return { ...f, rapidos: atuais.includes(r) ? atuais.filter((x) => x !== r) : [...atuais, r] };
    });
  }

  async function salvarFiltro() {
    const nome = window.prompt("Nome do filtro (ex.: Bugs da semana)");
    if (!nome?.trim()) return;
    try {
      const novo = await enviar<FiltroSalvo>("/tarefas/filtros", { nome: nome.trim(), filtros: { ...filtros, agrupar } });
      setSalvos((l) => [...l, novo]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o filtro.");
    }
  }

  function aplicarSalvo(id: string) {
    const f = salvos.find((x) => String(x.id) === id);
    if (!f) return;
    const { agrupar: raia, ...resto } = f.filtros;
    setFiltros({ ...FILTROS_VAZIOS, ...resto });
    if (raia) trocarAgrupar(raia);
  }

  async function apagarSalvo(id: number) {
    try {
      await excluir(`/tarefas/filtros/${id}`);
      setSalvos((l) => l.filter((x) => x.id !== id));
    } catch {
      setErro("Não foi possível apagar o filtro.");
    }
  }

  async function apagar(t: Tarefa) {
    await excluir(`/tarefas/${t.id}`);
    setPainel(null);
    setMenu(null);
    await carregar();
  }

  const abrir = (id: number) => setPainel({ modo: "editar", id });

  const abas = [...usuarios, "todos"];
  const filtrarPrazo = (prazo: FiltroPrazo) => setFiltros((f) => ({ ...f, prazo: f.prazo === prazo ? "todos" : prazo }));

  function cartao(t: Tarefa, coluna: ColunaTarefa) {
    const prazo = situacaoPrazo(t, hoje);
    const menuAberto = menu === t.id;
    return (
      <article
        key={t.id}
        className={`tar-cartao${t.coluna_concluida ? " feito" : ""}${arrastando === t.id ? " arrastando" : ""}${alvo === t.id ? " tar-alvo" : ""}${menuAberto ? " com-menu" : ""}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          setArrastando(t.id);
          setMenu(null);
        }}
        onDragEnd={() => {
          setArrastando(null);
          setSobre(null);
          setAlvo(null);
        }}
        onDragOver={(e) => {
          if (arrastando === null || arrastando === t.id) return;
          e.preventDefault();
          setAlvo(t.id);
        }}
        onDragLeave={() => setAlvo((a) => (a === t.id ? null : a))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSobre(null);
          setAlvo(null);
          const id = arrastando;
          setArrastando(null);
          if (id !== null && id !== t.id) mover(id, coluna, posicaoAntesDe(tarefas, id, t.id));
        }}
        onClick={(e) => {
          // O cartão inteiro abre a tarefa; botões, links e o menu têm ação própria.
          if ((e.target as HTMLElement).closest("button, a, .tar-menu, input, select")) return;
          abrir(t.id);
        }}
      >
        {t.capa_id && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tar-capa" src={`/api/anexos/${t.capa_id}`} alt="" loading="lazy" draggable={false} />
        )}
        <div className="tar-cartao-chave">
          <IconeTipo tipo={(t.tipo ?? "tarefa") as TipoTarefa} tamanho={14} />
          <span>{t.chave ?? `ORI-${t.id}`}</span>
          {t.epico_titulo && <span className="tar-cartao-epico">{t.epico_titulo}</span>}
          {(t.bloqueios_abertos ?? 0) > 0 && <span className="tar-cartao-bloqueio" title="Bloqueada por outra tarefa aberta">Bloqueada</span>}
        </div>
        <div className="tar-cartao-linha">
          <button
            type="button"
            className={`tar-concluir${t.coluna_concluida ? " feito" : ""}`}
            onClick={() => alternarConclusao(t)}
            disabled={!colunaFeita}
            aria-label={t.coluna_concluida ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
            title={t.coluna_concluida ? "Reabrir" : `Concluir (vai para ${colunaFeita?.nome ?? "a coluna de concluídas"})`}
          >
            <Icone nome="check" tamanho={12} />
          </button>
          {/* span com papel de botão: <button> não inicia arrasto do cartão */}
          <span
            role="button"
            tabIndex={0}
            className="tar-titulo"
            onClick={() => abrir(t.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                abrir(t.id);
              }
            }}
          >
            {t.titulo}
          </span>
          <button
            type="button"
            className="tar-menu-botao"
            aria-label={`Ações de ${t.titulo}`}
            aria-haspopup="menu"
            aria-expanded={menuAberto}
            onClick={() => setMenu(menuAberto ? null : t.id)}
          >
            <Icone nome="mais_opcoes" />
          </button>
        </div>

        {t.descricao && semImagens(t.descricao) && <p className="tar-descricao">{semImagens(t.descricao)}</p>}

        <div className="tar-rodape">
          {t.prioridade !== "normal" && (
            <span className={`tar-etiqueta prio-${t.prioridade}`} title={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade].toLowerCase()}`}>
              <IconePrioridade prioridade={t.prioridade} tamanho={12} />
              {ROTULO_PRIORIDADE[t.prioridade]}
            </span>
          )}
          {t.prazo && (
            <span className={`tar-etiqueta prazo-${prazo ?? "feito"}`} title={`Prazo: ${t.prazo.slice(8, 10)}/${t.prazo.slice(5, 7)}/${t.prazo.slice(0, 4)}`}>
              <Icone nome="calendario" tamanho={12} />
              {prazo === "vencida" ? `Venceu · ${rotuloPrazo(t.prazo, hoje)}` : rotuloPrazo(t.prazo, hoje)}
            </span>
          )}
          {t.negocio_id && (
            <Link href={`/comercial/negocios/${t.negocio_id}`} className="tar-etiqueta tar-vinculo" draggable={false} title={`Negócio: ${t.organizacao_nome ?? ""} · ${t.negocio_titulo ?? ""}`}>
              <Icone nome="negocio" tamanho={12} />
              <span>{t.organizacao_nome ?? t.negocio_titulo}</span>
            </Link>
          )}
          {t.documento_id && (
            <Link href={`/docs/${t.documento_id}`} className="tar-etiqueta tar-vinculo" draggable={false} title={`Documento: ${t.documento_titulo ?? ""}`}>
              <Icone nome="documento" tamanho={12} />
              <span>{t.documento_titulo}</span>
            </Link>
          )}
          {(t.etiquetas ?? []).slice(0, 3).map((e) => (
            <span key={e} className="tar-etiqueta tar-rotulo">
              {e}
            </span>
          ))}
          {(t.subtarefas_total ?? 0) > 0 && (
            <span className="tar-etiqueta tar-sub" title={`${t.subtarefas_feitas} de ${t.subtarefas_total} subtarefas feitas`}>
              <span className="tar-sub-barra" aria-hidden>
                <span style={{ width: `${progresso(t.subtarefas_feitas ?? 0, t.subtarefas_total ?? 0)}%` }} />
              </span>
              {t.subtarefas_feitas}/{t.subtarefas_total}
            </span>
          )}
          {(t.comentarios_total ?? 0) > 0 && (
            <span className="tar-etiqueta tar-meta" title={`${t.comentarios_total} comentário(s)`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M4 5h16v10H9l-5 4z" /></svg>
              {t.comentarios_total}
            </span>
          )}
          {(t.anexos_total ?? 0) > 0 && (
            <span className="tar-etiqueta tar-meta" title={`${t.anexos_total} anexo(s)`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14.5 7" /></svg>
              {t.anexos_total}
            </span>
          )}
          {t.pontos != null && (
            <span className="tar-pontos" title={`${t.pontos} ponto(s)`}>
              {t.pontos}
            </span>
          )}
          <span className="tar-rodape-fim" title={`Responsável: ${maiuscula(t.responsavel)}`}>
            <Avatar nome={t.responsavel} cor={corPessoa(t.responsavel)} />
          </span>
        </div>

        {menuAberto && (
          <div className="tar-menu" role="menu" aria-label={`Ações de ${t.titulo}`}>
            <button type="button" role="menuitem" onClick={() => (setMenu(null), abrir(t.id))}>
              Abrir
            </button>
            <p className="tar-menu-titulo">Mover para</p>
            {colunas.map((c, i) => (
              <button key={c.chave} type="button" role="menuitem" disabled={c.chave === t.status} onClick={() => (setMenu(null), mover(t.id, c))}>
                <span className={`tar-ponto tar-cor-${c.concluida ? "feita" : i % 6}`} aria-hidden />
                {c.nome}
                {c.chave === t.status && <span className="tar-menu-atual">atual</span>}
              </button>
            ))}
            <hr />
            <button
              type="button"
              role="menuitem"
              className="perigo"
              onClick={() => {
                if (window.confirm(`Excluir "${t.titulo}"?`)) apagar(t).catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível excluir."));
              }}
            >
              <Icone nome="lixeira" tamanho={14} /> Excluir
            </button>
          </div>
        )}
      </article>
    );
  }

  const indicadores: { chave: FiltroPrazo | null; rotulo: string; valor: number; tom: string; dica: string }[] = [
    { chave: null, rotulo: "Abertas", valor: numeros.abertas, tom: "neutro", dica: "Tarefas fora das colunas de concluídas" },
    { chave: "vencidas", rotulo: "Vencidas", valor: numeros.vencidas, tom: "perigo", dica: "Mostrar só as vencidas" },
    { chave: "hoje", rotulo: "Para hoje", valor: numeros.paraHoje, tom: "alerta", dica: "Mostrar só as que vencem hoje" },
    { chave: null, rotulo: "Feitas em 7 dias", valor: numeros.feitas7, tom: "sucesso", dica: "Concluídas nos últimos 7 dias" },
  ];

  return (
    <div className="docs-pagina tar-pagina">
      <div className="tar-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">Tarefas</h1>
          <p className="texto-secundario tar-subtitulo">
            {vista === "todos" ? "O quadro de toda a equipe." : vista === eu ? "O seu quadro." : `O quadro de ${maiuscula(vista)}.`} Arraste os cartões entre as colunas.
          </p>
        </div>
        <div className="tar-acoes">
          <button type="button" className="botao tar-botao-icone" onClick={() => setGerindo(true)} title={`Colunas do quadro de ${maiuscula(dono)}`}>
            <Icone nome="colunas" /> Colunas
          </button>
          <button type="button" className="botao botao-destaque tar-botao-icone" onClick={() => primeira && setPainel({ modo: "novo", status: primeira })} disabled={!primeira}>
            <Icone nome="mais" /> Nova tarefa <kbd className="tar-kbd">N</kbd>
          </button>
        </div>
      </div>

      <div className="tar-linha">
      <div className="tar-pessoas" role="tablist" aria-label="Quadro de quem">
        {abas.map((a) => {
          const r = a === "todos" ? null : resumo[a];
          return (
            <button key={a} type="button" role="tab" aria-selected={vista === a} className={`tar-pessoa${vista === a ? " ativa" : ""}`} onClick={() => setVista(a)}>
              {a === "todos" ? (
                <span className="tar-pessoa-grupo" aria-hidden>
                  {usuarios.slice(0, 3).map((u) => (
                    <Avatar key={u} nome={u} cor={corPessoa(u)} tamanho={18} />
                  ))}
                </span>
              ) : (
                <Avatar nome={a} cor={corPessoa(a)} tamanho={22} />
              )}
              <span>
                {a === "todos" ? "Todos" : maiuscula(a)}
                {a === eu && <span className="texto-secundario"> (você)</span>}
              </span>
              {r && r.abertas > 0 && <span className="tar-pessoa-contagem mono">{r.abertas}</span>}
              {r && r.vencidas > 0 && (
                <span className="tar-pessoa-vencidas" title={`${r.vencidas} vencida(s)`}>
                  {r.vencidas}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="tar-indicadores">
        {indicadores.map((i) => {
          const ativo = i.chave !== null && filtros.prazo === i.chave;
          const conteudo = (
            <>
              <span className="tar-indicador-valor">{i.valor}</span>
              <span className="tar-indicador-rotulo">{i.rotulo}</span>
            </>
          );
          return i.chave ? (
            <button key={i.rotulo} type="button" className={`tar-indicador tom-${i.tom}${ativo ? " ativo" : ""}${i.valor === 0 ? " zerado" : ""}`} aria-pressed={ativo} title={ativo ? "Tirar o filtro" : i.dica} onClick={() => filtrarPrazo(i.chave as FiltroPrazo)}>
              {conteudo}
            </button>
          ) : (
            <div key={i.rotulo} className={`tar-indicador tom-${i.tom}`} title={i.dica}>
              {conteudo}
            </div>
          );
        })}
      </div>

      </div>

      <div className="tar-barra">
        <label className="tar-busca">
          <Icone nome="busca" />
          <input
            ref={buscaRef}
            type="search"
            aria-label="Buscar tarefas"
            placeholder="Buscar por título, detalhes, negócio ou documento"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setFiltros((f) => ({ ...f, busca: "" }));
                e.currentTarget.blur();
              }
            }}
          />
          {!filtros.busca && <kbd className="tar-kbd">/</kbd>}
        </label>
        <select aria-label="Filtrar por prazo" className={`tar-filtro${filtros.prazo !== "todos" ? " ativo" : ""}`} value={filtros.prazo} onChange={(e) => setFiltros((f) => ({ ...f, prazo: e.target.value as FiltroPrazo }))}>
          {FILTROS_PRAZO.map((p) => (
            <option key={p} value={p}>
              {ROTULO_FILTRO_PRAZO[p]}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por prioridade" className={`tar-filtro${filtros.prioridade !== "todas" ? " ativo" : ""}`} value={filtros.prioridade} onChange={(e) => setFiltros((f) => ({ ...f, prioridade: e.target.value as Prioridade | "todas" }))}>
          <option value="todas">Qualquer prioridade</option>
          {[...PRIORIDADES].reverse().map((p) => (
            <option key={p} value={p}>
              Prioridade {ROTULO_PRIORIDADE[p].toLowerCase()}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por tipo" className={`tar-filtro${filtros.tipo && filtros.tipo !== "todos" ? " ativo" : ""}`} value={filtros.tipo ?? "todos"} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value as TipoTarefa | "todos" }))}>
          <option value="todos">Qualquer tipo</option>
          {TIPOS_TAREFA.filter((t) => t !== "epico").map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_TAREFA[t]}
            </option>
          ))}
        </select>
        {epicos.length > 0 && (
          <select
            aria-label="Filtrar por épico"
            className={`tar-filtro${filtros.epico != null ? " ativo" : ""}`}
            value={filtros.epico == null ? "" : String(filtros.epico)}
            onChange={(e) => setFiltros((f) => ({ ...f, epico: e.target.value === "" ? null : e.target.value === "sem" ? "sem" : Number(e.target.value) }))}
          >
            <option value="">Qualquer épico</option>
            <option value="sem">Sem épico</option>
            {epicos.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.titulo}
              </option>
            ))}
          </select>
        )}
        {etiquetas.length > 0 && (
          <select aria-label="Filtrar por etiqueta" className={`tar-filtro${filtros.etiqueta ? " ativo" : ""}`} value={filtros.etiqueta ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, etiqueta: e.target.value }))}>
            <option value="">Qualquer etiqueta</option>
            {etiquetas.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        )}
        {nFiltros > 0 && (
          <button type="button" className="tar-link-botao" onClick={() => setFiltros(FILTROS_VAZIOS)}>
            Limpar filtros ({visiveis.length} de {daVista.length})
          </button>
        )}
        <span className="tar-barra-espaco" />
        <div className="tar-alternar" role="group" aria-label="Visão">
          <button type="button" aria-pressed={visao === "quadro"} className={visao === "quadro" ? "ativo" : ""} onClick={() => trocarVisao("quadro")}>
            <Icone nome="quadro" /> Quadro
          </button>
          <button type="button" aria-pressed={visao === "lista"} className={visao === "lista" ? "ativo" : ""} onClick={() => trocarVisao("lista")}>
            <Icone nome="lista" /> Lista
          </button>
          <button type="button" aria-pressed={visao === "backlog"} className={visao === "backlog" ? "ativo" : ""} onClick={() => trocarVisao("backlog")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h10" /></svg> Backlog
          </button>
          <button type="button" aria-pressed={visao === "epicos"} className={visao === "epicos" ? "ativo" : ""} onClick={() => trocarVisao("epicos")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13 3 6 14h5l-1 7 7-11h-5z" /></svg> Épicos
          </button>
        </div>
      </div>

      {(visao === "quadro" || visao === "lista") && (
        <div className="tar-rapidos">
          <span className="tar-rapidos-rotulo">Filtros rápidos</span>
          {FILTROS_RAPIDOS.map((r) => (
            <button key={r} type="button" className={`tar-rapido${filtros.rapidos?.includes(r) ? " ativo" : ""}`} aria-pressed={!!filtros.rapidos?.includes(r)} onClick={() => alternarRapido(r)}>
              {ROTULO_FILTRO_RAPIDO[r]}
            </button>
          ))}
          <span className="tar-rapidos-sep" />
          {salvos.map((f) => (
            <span key={f.id} className="tar-salvo">
              <button type="button" onClick={() => aplicarSalvo(String(f.id))} title="Aplicar este filtro salvo">
                {f.nome}
              </button>
              <button type="button" className="tar-salvo-x" aria-label={`Apagar o filtro ${f.nome}`} onClick={() => window.confirm(`Apagar o filtro "${f.nome}"?`) && apagarSalvo(f.id)}>
                ×
              </button>
            </span>
          ))}
          {nFiltros > 0 && (
            <button type="button" className="tar-rapido tar-salvar" onClick={salvarFiltro}>
              + Salvar filtro
            </button>
          )}
          <span className="tar-barra-espaco" />
          {visao === "quadro" && (
            <label className="tar-agrupar">
              Raias
              <select value={agrupar} onChange={(e) => trocarAgrupar(e.target.value as Agrupamento)} aria-label="Agrupar o quadro">
                {AGRUPAMENTOS.map((a) => (
                  <option key={a} value={a}>
                    {ROTULO_AGRUPAMENTO[a]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {ativa && (visao === "quadro" || visao === "lista") && (
        <div className="tar-sprint">
          <span className="tar-sprint-icone" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
          </span>
          <div className="tar-sprint-texto">
            <strong>{ativa.nome}</strong>
            <span>
              {ativa.tarefas_feitas} de {ativa.tarefas_total} feitas
              {ativa.pontos_total > 0 && ` · ${ativa.pontos_feitos}/${ativa.pontos_total} pontos`}
              {ativa.fim && ` · termina ${rotuloPrazo(ativa.fim, hoje).toLowerCase()}`}
              {ativa.objetivo && ` · ${ativa.objetivo}`}
            </span>
          </div>
          <span className="tar-sprint-barra" aria-hidden>
            <span style={{ width: `${progresso(ativa.tarefas_feitas, ativa.tarefas_total)}%` }} />
          </span>
          <div className="tar-alternar pequeno" role="group" aria-label="O que o quadro mostra">
            <button type="button" className={soSprint ? "ativo" : ""} aria-pressed={soSprint} onClick={() => setSoSprint(true)}>
              Só a sprint
            </button>
            <button type="button" className={!soSprint ? "ativo" : ""} aria-pressed={!soSprint} onClick={() => setSoSprint(false)}>
              Tudo
            </button>
          </div>
          <button type="button" className="tar-link-botao" onClick={() => trocarVisao("backlog")}>
            Abrir backlog
          </button>
        </div>
      )}

      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}

      {visao === "quadro" ? (
        <div className={`tar-raias${agrupar !== "nenhum" ? " com-raias" : ""}`}>
          {raias(visiveis, agrupar).map((raia, nRaia) => {
            const porColRaia = porColuna(raia.tarefas, colunas);
            const primeiraRaia = nRaia === 0;
            return (
              <div key={raia.chave} className="tar-raia">
                {agrupar !== "nenhum" && (
                  <h3 className="tar-raia-titulo">
                    {agrupar === "pessoa" ? <Avatar nome={raia.titulo} cor={corPessoa(raia.titulo)} tamanho={20} /> : <IconeTipo tipo="epico" tamanho={16} />}
                    {agrupar === "pessoa" ? maiuscula(raia.titulo) : raia.titulo}
                    <span className="tar-coluna-contagem">{raia.tarefas.length}</span>
                  </h3>
                )}
                <div className="tar-quadro" role="group" aria-label="Quadro de tarefas" aria-busy={carregando} style={{ ["--tar-colunas" as string]: colunas.length || 4 }}>
                  {colunas.map((coluna, indice) => {
                    const lista = porColRaia[coluna.chave] ?? [];
                    const cor = coluna.concluida ? "feita" : String(indice % 6);
                    return (
                      <section
                        key={coluna.chave}
                        className={`tar-coluna${coluna.concluida ? " tar-concluida" : ""}${sobre === coluna.chave ? " tar-sobre" : ""}`}
                        aria-label={`${coluna.nome}: ${lista.length} tarefas`}
                        onDragOver={(e) => {
                          if (arrastando === null) return;
                          e.preventDefault();
                          setSobre(coluna.chave);
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre((s) => (s === coluna.chave ? null : s));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setSobre(null);
                          setAlvo(null);
                          const id = arrastando;
                          setArrastando(null);
                          if (id !== null) mover(id, coluna);
                        }}
                      >
                        <header className="tar-coluna-topo">
                          <span className={`tar-ponto tar-cor-${cor}`} aria-hidden />
                          <span className="tar-coluna-nome">{coluna.nome}</span>
                          <span className="tar-coluna-contagem mono">{lista.length}</span>
                          <button
                            type="button"
                            className="tar-icone-botao"
                            aria-label={`Nova tarefa em ${coluna.nome}`}
                            title={`Nova tarefa em ${coluna.nome}`}
                            onClick={() => {
                              setCompondo(coluna.chave);
                              setNovoTitulo("");
                            }}
                          >
                            <Icone nome="mais" />
                          </button>
                        </header>

                        <div className="tar-cartoes">
                          {primeiraRaia && compondo === coluna.chave && (
                            <form className="tar-compor" onSubmit={(e) => criarNaColuna(e, coluna)}>
                              <input
                                autoFocus
                                aria-label={`Título da nova tarefa em ${coluna.nome}`}
                                placeholder={`Nova tarefa${responsavelNovo !== eu ? ` para ${maiuscula(responsavelNovo)}` : ""}…`}
                                value={novoTitulo}
                                maxLength={200}
                                onChange={(e) => setNovoTitulo(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setCompondo(null);
                                }}
                                onBlur={() => {
                                  if (!novoTitulo.trim()) setCompondo(null);
                                }}
                              />
                              <span className="tar-compor-dica">
                                <kbd>Enter</kbd> cria · <kbd>Esc</kbd> fecha
                              </span>
                            </form>
                          )}
                          {lista.map((t) => cartao(t, coluna))}
                          {lista.length === 0 && compondo !== coluna.chave && (
                            <p className="tar-vazio">{nFiltros > 0 ? "Nada com esses filtros" : arrastando !== null ? "Solte aqui" : "Sem tarefas"}</p>
                          )}
                        </div>

                        {primeiraRaia && compondo !== coluna.chave && (
                          <button
                            type="button"
                            className="tar-adicionar"
                            onClick={() => {
                              setCompondo(coluna.chave);
                              setNovoTitulo("");
                            }}
                          >
                            <Icone nome="mais" tamanho={14} /> Adicionar tarefa
                          </button>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {agrupar !== "nenhum" && visiveis.length === 0 && <p className="tar-vazio">Nada com esses filtros.</p>}
        </div>
      ) : visao === "backlog" ? (
        <BacklogTarefas tarefas={semEpicos} sprints={sprints} eu={eu} onAbrir={abrir} onMudou={carregar} />
      ) : visao === "epicos" ? (
        <EpicosTarefas eu={eu} hoje={hoje} versao={versao} onAbrir={abrir} onMudou={carregar} />
      ) : (
        <div className="tar-lista-caixa" aria-busy={carregando}>
          <table className="tar-lista">
            <thead>
              <tr>
                <th scope="col" className="tar-col-check">
                  <span className="sr-only">Concluída</span>
                </th>
                <th scope="col">Tarefa</th>
                <th scope="col">Responsável</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Prazo</th>
                <th scope="col">Vínculos</th>
              </tr>
            </thead>
            {colunas.map((coluna, indice) => {
              const lista = porCol[coluna.chave] ?? [];
              return (
                <tbody key={coluna.chave}>
                  <tr className="tar-lista-grupo">
                    <th colSpan={6} scope="colgroup">
                      <span className={`tar-ponto tar-cor-${coluna.concluida ? "feita" : indice % 6}`} aria-hidden />
                      {coluna.nome}
                      <span className="tar-coluna-contagem mono">{lista.length}</span>
                    </th>
                  </tr>
                  {lista.length === 0 && (
                    <tr>
                      <td colSpan={6} className="tar-lista-vazio">
                        {nFiltros > 0 ? "Nada com esses filtros" : "Sem tarefas"}
                      </td>
                    </tr>
                  )}
                  {lista.map((t) => {
                    const prazo = situacaoPrazo(t, hoje);
                    return (
                      <tr key={t.id} className={`tar-lista-linha${t.coluna_concluida ? " feito" : ""}`} onClick={() => abrir(t.id)}>
                        <td className="tar-col-check" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`tar-concluir visivel${t.coluna_concluida ? " feito" : ""}`}
                            onClick={() => alternarConclusao(t)}
                            disabled={!colunaFeita}
                            aria-label={t.coluna_concluida ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
                          >
                            <Icone nome="check" tamanho={12} />
                          </button>
                        </td>
                        <td>
                          <button type="button" className="tar-lista-titulo" onClick={(e) => (e.stopPropagation(), abrir(t.id))}>
                            {t.titulo}
                          </button>
                          {t.descricao && semImagens(t.descricao) && <span className="tar-lista-descricao">{semImagens(t.descricao)}</span>}
                        </td>
                        <td>
                          <span className="tar-lista-pessoa">
                            <Avatar nome={t.responsavel} cor={corPessoa(t.responsavel)} tamanho={20} /> {maiuscula(t.responsavel)}
                          </span>
                        </td>
                        <td>
                          <span className={`tar-lista-prio prio-${t.prioridade}`}>
                            <IconePrioridade prioridade={t.prioridade} /> {ROTULO_PRIORIDADE[t.prioridade]}
                          </span>
                        </td>
                        <td>{t.prazo ? <span className={`tar-etiqueta prazo-${prazo ?? "feito"}`}>{prazo === "vencida" ? `Venceu · ${rotuloPrazo(t.prazo, hoje)}` : rotuloPrazo(t.prazo, hoje)}</span> : <span className="texto-secundario">—</span>}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className="tar-lista-vinculos">
                            {t.negocio_id && (
                              <Link href={`/comercial/negocios/${t.negocio_id}`} className="tar-etiqueta tar-vinculo">
                                <Icone nome="negocio" tamanho={12} />
                                <span>{t.organizacao_nome ?? t.negocio_titulo}</span>
                              </Link>
                            )}
                            {t.documento_id && (
                              <Link href={`/docs/${t.documento_id}`} className="tar-etiqueta tar-vinculo">
                                <Icone nome="documento" tamanho={12} />
                                <span>{t.documento_titulo}</span>
                              </Link>
                            )}
                            {!t.negocio_id && !t.documento_id && <span className="texto-secundario">—</span>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {painel?.modo === "editar" && (
        <TarefaDetalhe
          tarefaId={painel.id}
          hoje={hoje}
          usuarios={usuarios}
          eu={eu}
          negocios={negocios}
          documentos={documentos}
          epicos={epicos}
          sprints={sprints}
          todas={tarefas}
          onMudou={carregar}
          onAbrir={abrir}
          onFechar={() => {
            setPainel(null);
            if (window.location.search.includes("tarefa=")) window.history.replaceState(null, "", "/tarefas");
          }}
        />
      )}

      {painel?.modo === "novo" && (
        <TarefaPainel
          key="nova"
          tarefa={null}
          epicos={epicos}
          sprints={sprints}
          sprintPadrao={ativa && soSprint ? ativa.id : null}
          padrao={{ responsavel: responsavelNovo, status: painel.status }}
          hoje={hoje}
          usuarios={usuarios}
          colunas={colunas}
          negocios={negocios}
          documentos={documentos}
          onSalvar={salvar}
          onFechar={() => setPainel(null)}
        />
      )}

      <Modal titulo="Colunas do quadro" aberto={gerindo} onFechar={() => setGerindo(false)}>
        {gerindo && <ColunasTarefas dono={dono} colunas={colunas} contagem={contagem} onMudou={carregar} />}
      </Modal>
    </div>
  );
}
