"use client";

// GMUD (gestão de mudanças): lista com números do topo e filtro por etapa; clicar abre a janela da mudança,
// no mesmo formato da tarefa (conteúdo à esquerda, etapa, ações e informações à direita).
// Ciclo: rascunho → em aprovação → aprovada → em execução → concluída | revertida (+ reprovada e cancelada).

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Escolha from "../../../components/Escolha";
import CampoData from "../../../components/CampoData";
import { Avatar } from "../../../components/IconesTarefa";
import { atualizar, enviar, obter } from "../../../lib/api";
import { nomeUsuario } from "../../../lib/exibicao";
import { usePessoas } from "../../../lib/pessoas";
import { corPessoa } from "../../../lib/tarefas";

type Aprovador = { usuario: string; decisao: "aprovada" | "reprovada" | null; comentario: string | null; decidido_em: string | null };
type Evento = { id: number; autor: string; tipo: string; texto: string | null; criado_em: string };
type Gmud = {
  id: number; chave: string; titulo: string; descricao: string | null; justificativa: string | null;
  tipo: "normal" | "padrao" | "emergencial"; ambiente: string; sistemas: string[];
  impacto: string; probabilidade: string; risco: "baixo" | "medio" | "alto";
  inicio: string | null; fim: string | null; executor: string | null; criado_por: string; status: string;
  plano_implantacao: string | null; plano_rollback: string | null; plano_testes: string | null;
  resultado: string | null; resultado_obs: string | null; aprovadores: Aprovador[];
  criado_em: string; atualizado_em: string; eventos?: Evento[]; conflitos?: { id: number; chave: string; titulo: string; inicio: string; fim: string }[];
};
type Resumo = { em_aprovacao: number; proximos_7: number; em_execucao: number; encerradas_30: number; sucesso_30: number };

const STATUS: Record<string, { rotulo: string; tom: string }> = {
  rascunho: { rotulo: "Rascunho", tom: "neutro" },
  em_aprovacao: { rotulo: "Em aprovação", tom: "alerta" },
  aprovada: { rotulo: "Aprovada", tom: "info" },
  reprovada: { rotulo: "Reprovada", tom: "perigo" },
  em_execucao: { rotulo: "Em execução", tom: "destaque" },
  concluida: { rotulo: "Concluída", tom: "sucesso" },
  revertida: { rotulo: "Revertida", tom: "perigo" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
};
const TIPOS = [
  { valor: "normal", rotulo: "Normal", dica: "Precisa de aprovação" },
  { valor: "padrao", rotulo: "Padrão", dica: "Pré-aprovada, rotineira" },
  { valor: "emergencial", rotulo: "Emergencial", dica: "Executa antes, aprova depois" },
];
const AMBIENTES = [
  { valor: "producao", rotulo: "Produção" },
  { valor: "homologacao", rotulo: "Homologação" },
  { valor: "desenvolvimento", rotulo: "Desenvolvimento" },
];
const IMPACTOS = [
  { valor: "baixo", rotulo: "Baixo" },
  { valor: "medio", rotulo: "Médio" },
  { valor: "alto", rotulo: "Alto" },
];
const PROBS = [
  { valor: "baixa", rotulo: "Baixa" },
  { valor: "media", rotulo: "Média" },
  { valor: "alta", rotulo: "Alta" },
];
const HORAS = Array.from({ length: 48 }, (_, i) => {
  const h = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
  return { valor: h, rotulo: h };
});
const FILTROS = [
  { chave: "", rotulo: "Todas" },
  { chave: "em_aprovacao", rotulo: "Em aprovação" },
  { chave: "aprovada", rotulo: "Agendadas" },
  { chave: "em_execucao", rotulo: "Em execução" },
  { chave: "rascunho", rotulo: "Rascunhos" },
  { chave: "encerradas", rotulo: "Encerradas" },
];
const CAMPO_DO_AVISO: Record<string, string> = {
  "início da janela": "inicio",
  "fim da janela": "fim",
  "plano de implantação": "plano_implantacao",
  "plano de volta (rollback)": "plano_rollback",
  "sistemas afetados": "sistemas",
  "pelo menos um aprovador": "aprovadores",
};
const ROTULO_RISCO = { baixo: "Baixo", medio: "Médio", alto: "Alto" };

// Datas: o back guarda timestamptz; a tela trabalha no horário de São Paulo.
const partesSP = (iso: string) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return { dia, hora };
};
const juntarSP = (dia: string, hora: string) => `${dia}T${hora}:00-03:00`;
const quando = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const janela = (g: Gmud) => {
  if (!g.inicio) return "Sem janela";
  const a = partesSP(g.inicio);
  const b = g.fim ? partesSP(g.fim) : null;
  const dia = a.dia.split("-").reverse().join("/");
  if (!b) return `${dia} ${a.hora}`;
  return a.dia === b.dia ? `${dia} · ${a.hora}–${b.hora}` : `${dia} ${a.hora} → ${b.dia.split("-").reverse().join("/")} ${b.hora}`;
};

function Selo({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, tom: "neutro" };
  return <span className={`gm-selo tom-${s.tom}`}>{s.rotulo}</span>;
}

function Risco({ risco }: { risco: Gmud["risco"] }) {
  return <span className={`gm-risco r-${risco}`}><i aria-hidden />{ROTULO_RISCO[risco]}</span>;
}

export default function GmudPage() {
  const [itens, setItens] = useState<Gmud[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [filtro, setFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);
  const [criando, setCriando] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [eu, setEu] = useState("");
  const [erro, setErro] = useState("");
  const pessoas = usePessoas();

  const carregar = useCallback(async () => {
    try {
      const r = await obter<{ itens: Gmud[]; resumo: Resumo }>("/gmud");
      setItens(r.itens);
      setResumo(r.resumo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para carregar as GMUDs.");
    }
  }, []);

  useEffect(() => {
    carregar();
    obter<{ usuario: string }>("/me").then((m) => setEu(m.usuario)).catch(() => {});
    const id = new URLSearchParams(window.location.search).get("gmud");
    if (id) setAberta(Number(id));
  }, [carregar]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((g) => {
      if (filtro === "encerradas" ? !["concluida", "revertida", "cancelada", "reprovada"].includes(g.status) : filtro && g.status !== filtro) return false;
      if (!q) return true;
      return [g.chave, g.titulo, ...g.sistemas].some((t) => t.toLowerCase().includes(q));
    });
  }, [itens, filtro, busca]);

  const minhasAprovacoes = itens.filter((g) => g.status === "em_aprovacao" && g.aprovadores.some((a) => a.usuario === eu && !a.decisao)).length;

  async function criar(e: FormEvent) {
    e.preventDefault();
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    try {
      const g = await enviar<Gmud>("/gmud", { titulo, executor: eu || null });
      setNovoTitulo("");
      setCriando(false);
      await carregar();
      setAberta(g.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para criar.");
    }
  }

  const taxa = resumo && resumo.encerradas_30 ? Math.round((resumo.sucesso_30 / resumo.encerradas_30) * 100) : null;

  return (
    <div className="docs-pagina gm-pagina">
      <div className="tar-topo">
        <div>
          <h1 className="titulo-pixel com-titulo">GMUD</h1>
          <p className="texto-secundario tar-subtitulo">Gestão de mudanças: planeje, aprove, execute e registre cada mudança em produção.</p>
        </div>
        <div className="tar-acoes">
          <button type="button" className="botao botao-destaque" onClick={() => setCriando(true)}>
            + Nova GMUD
          </button>
        </div>
      </div>

      <div className="gm-numeros">
        <button type="button" className="gm-numero" onClick={() => setFiltro("em_aprovacao")}>
          <strong>{resumo?.em_aprovacao ?? "–"}</strong>
          <span>Esperando aprovação{minhasAprovacoes ? ` · ${minhasAprovacoes} sua${minhasAprovacoes > 1 ? "s" : ""}` : ""}</span>
        </button>
        <button type="button" className="gm-numero" onClick={() => setFiltro("aprovada")}>
          <strong>{resumo?.proximos_7 ?? "–"}</strong>
          <span>Agendadas nos próximos 7 dias</span>
        </button>
        <button type="button" className="gm-numero" onClick={() => setFiltro("em_execucao")}>
          <strong>{resumo?.em_execucao ?? "–"}</strong>
          <span>Em execução agora</span>
        </button>
        <div className="gm-numero">
          <strong>{taxa === null ? "–" : `${taxa}%`}</strong>
          <span>Sucesso em 30 dias{resumo?.encerradas_30 ? ` (${resumo.sucesso_30} de ${resumo.encerradas_30})` : ""}</span>
        </div>
      </div>

      {criando && (
        <form className="gm-criar" onSubmit={criar}>
          <input autoFocus value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="O que vai mudar? Ex.: Atualizar o Postgres para a 17" maxLength={200} onKeyDown={(e) => e.key === "Escape" && setCriando(false)} />
          <button type="submit" className="botao botao-destaque" disabled={!novoTitulo.trim()}>Criar</button>
          <button type="button" className="botao" onClick={() => setCriando(false)}>Cancelar</button>
        </form>
      )}

      <div className="gm-barra">
        <div className="gm-filtros" role="tablist">
          {FILTROS.map((f) => (
            <button key={f.chave} type="button" role="tab" aria-selected={filtro === f.chave} className={`gm-filtro${filtro === f.chave ? " ativo" : ""}`} onClick={() => setFiltro(f.chave)}>
              {f.rotulo}
            </button>
          ))}
        </div>
        <input className="gm-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por chave, título ou sistema" />
      </div>

      {erro && <p className="gm-erro" role="alert">{erro}</p>}

      <div className="gm-tabela" role="table">
        <div className="gm-linha gm-cab" role="row">
          <span>Chave</span><span>Mudança</span><span>Janela</span><span>Risco</span><span>Executor</span><span>Aprovação</span><span>Etapa</span>
        </div>
        {visiveis.length === 0 && <p className="gm-vazio">{itens.length ? "Nenhuma GMUD neste filtro." : "Nenhuma GMUD ainda. Crie a primeira em “+ Nova GMUD”."}</p>}
        {visiveis.map((g) => {
          const ok = g.aprovadores.filter((a) => a.decisao === "aprovada").length;
          return (
            <button key={g.id} type="button" role="row" className="gm-linha" onClick={() => setAberta(g.id)}>
              <span className="gm-chave">{g.chave}</span>
              <span className="gm-titulo">
                <b>{g.titulo}</b>
                <small>
                  {g.tipo !== "normal" && <em className={`gm-tipo t-${g.tipo}`}>{g.tipo === "padrao" ? "Padrão" : "Emergencial"}</em>}
                  {AMBIENTES.find((a) => a.valor === g.ambiente)?.rotulo}
                  {g.sistemas.length ? ` · ${g.sistemas.join(", ")}` : ""}
                </small>
              </span>
              <span className="gm-horario">{janela(g)}</span>
              <span><Risco risco={g.risco} /></span>
              <span className="gm-pessoa">{g.executor ? <><Avatar nome={g.executor} cor={corPessoa(g.executor)} tamanho={20} /> {nomeUsuario(g.executor).split(" ")[0]}</> : "—"}</span>
              <span className="gm-aprov">{g.tipo === "padrao" ? "Pré-aprovada" : g.aprovadores.length ? `${ok}/${g.aprovadores.length}` : "—"}</span>
              <span><Selo status={g.status} /></span>
            </button>
          );
        })}
      </div>

      {aberta !== null && (
        <GmudJanela
          id={aberta}
          eu={eu}
          pessoas={pessoas.map((p) => p.usuario)}
          onMudou={carregar}
          onFechar={() => {
            setAberta(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("gmud");
            window.history.replaceState(null, "", url);
          }}
        />
      )}
    </div>
  );
}

function CampoTexto({ rotulo, valor, editavel, onSalvar, dica, campo }: { rotulo: string; valor: string | null; editavel: boolean; onSalvar: (v: string) => void; dica: string; campo?: string }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => setTexto(valor ?? ""), [valor]);
  return (
    <section className="gm-secao" data-campo={campo}>
      <h3>{rotulo}</h3>
      {editando ? (
        <div className="gm-edicao">
          <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={dica} rows={5}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setEditando(false); setTexto(valor ?? ""); }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { onSalvar(texto); setEditando(false); }
            }} />
          <div className="gm-edicao-acoes">
            <button type="button" className="botao botao-destaque" onClick={() => { onSalvar(texto); setEditando(false); }}>Salvar</button>
            <button type="button" className="botao" onClick={() => { setEditando(false); setTexto(valor ?? ""); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div role={editavel ? "button" : undefined} tabIndex={editavel ? 0 : undefined} className={`gm-texto${valor ? "" : " vazio"}${editavel ? " editavel" : ""}`}
          onClick={() => editavel && setEditando(true)} onKeyDown={(e) => editavel && e.key === "Enter" && setEditando(true)}>
          {valor || (editavel ? dica : "Não preenchido.")}
        </div>
      )}
    </section>
  );
}

function GmudJanela({ id, eu, pessoas, onMudou, onFechar }: { id: number; eu: string; pessoas: string[]; onMudou: () => void; onFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [g, setG] = useState<Gmud | null>(null);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState<null | "reprovar" | "aprovar" | "sucesso" | "com_problemas" | "revertida" | "cancelar">(null);
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [titulo, setTitulo] = useState("");
  const [sistema, setSistema] = useState("");

  const carregar = useCallback(async () => {
    try {
      const d = await obter<Gmud>(`/gmud/${id}`);
      setG(d);
      setTitulo(d.titulo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "GMUD não encontrada.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
    const url = new URL(window.location.href);
    url.searchParams.set("gmud", String(id));
    window.history.replaceState(null, "", url);
  }, [carregar, id]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function rodar(fn: () => Promise<unknown>) {
    setErro("");
    try {
      await fn();
      await carregar();
      onMudou();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
      return false;
    }
  }
  const salvar = (campos: Record<string, unknown>) => rodar(() => atualizar(`/gmud/${id}`, campos));

  function adicionarSistema() {
    const nome = sistema.trim().replace(/,$/, "").trim();
    if (!nome || !g) return;
    setSistema("");
    if (g.sistemas.some((x) => x.toLowerCase() === nome.toLowerCase())) return;
    salvar({ sistemas: [...g.sistemas, nome] });
  }

  // Leva até o campo que falta: rola, pisca e põe o foco nele.
  function irPara(campo: string) {
    const alvo = ref.current?.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    alvo.classList.remove("gm-destacar");
    void alvo.offsetWidth;
    alvo.classList.add("gm-destacar");
    window.setTimeout(() => alvo.classList.remove("gm-destacar"), 1800);
    const foco = alvo.querySelector<HTMLElement>("input, .gm-texto.editavel, button.esc-botao, button.cd-botao");
    window.setTimeout(() => foco?.focus(), 250);
  }
  const postar = (rota: string, corpo?: unknown) => rodar(() => enviar(`/gmud/${id}/${rota}`, corpo ?? {}));

  if (!g) {
    return (
      <dialog ref={ref} className="td-janela gm-janela" onClose={onFechar}>
        <p className="td-carregando">{erro || "Carregando…"}</p>
      </dialog>
    );
  }

  const editavel = ["rascunho", "reprovada", "em_aprovacao"].includes(g.status);
  const souAprovador = g.aprovadores.find((a) => a.usuario === eu);
  const posso = {
    enviar: ["rascunho", "reprovada"].includes(g.status),
    decidir: g.status === "em_aprovacao" && souAprovador && !souAprovador.decisao,
    iniciar: g.status === "aprovada" || (g.tipo === "emergencial" && ["rascunho", "em_aprovacao"].includes(g.status)),
    encerrar: g.status === "em_execucao",
    cancelar: !["concluida", "revertida", "cancelada"].includes(g.status),
  };
  const ini = g.inicio ? partesSP(g.inicio) : null;
  const fim = g.fim ? partesSP(g.fim) : null;

  function mudarJanela(qual: "inicio" | "fim", dia: string | null, hora: string | null) {
    const atual = qual === "inicio" ? ini : fim;
    const d = dia === undefined ? atual?.dia : dia;
    if (!d) return salvar({ [qual]: null });
    const h = hora ?? atual?.hora ?? (qual === "inicio" ? "22:00" : "23:00");
    const campos: Record<string, string> = { [qual]: juntarSP(d, h) };
    // Ao escolher o início sem fim, sugere 1 h de janela.
    if (qual === "inicio" && !g!.fim) {
      const [hh, mm] = h.split(":").map(Number);
      campos.fim = hh < 23 ? juntarSP(d, `${String(hh + 1).padStart(2, "0")}:${String(mm).padStart(2, "0")}`) : juntarSP(d, "23:30");
    }
    return salvar(campos);
  }

  async function confirmar() {
    if (!acao) return;
    let ok = false;
    if (acao === "aprovar" || acao === "reprovar") ok = await postar("decidir", { decisao: acao === "aprovar" ? "aprovada" : "reprovada", comentario: motivo });
    else if (acao === "cancelar") ok = await postar("cancelar", { texto: motivo });
    else ok = await postar("encerrar", { resultado: acao, obs: motivo });
    if (ok) { setAcao(null); setMotivo(""); }
  }

  const textosAcao: Record<string, { titulo: string; dica: string; botao: string; obrigatorio: boolean }> = {
    aprovar: { titulo: "Aprovar a mudança", dica: "Comentário (opcional)", botao: "Aprovar", obrigatorio: false },
    reprovar: { titulo: "Reprovar a mudança", dica: "Por que está reprovando? O que precisa mudar?", botao: "Reprovar", obrigatorio: true },
    sucesso: { titulo: "Concluir com sucesso", dica: "Observações (opcional)", botao: "Concluir", obrigatorio: false },
    com_problemas: { titulo: "Concluir com problemas", dica: "Quais problemas aconteceram?", botao: "Concluir com problemas", obrigatorio: true },
    revertida: { titulo: "Reverter (rollback)", dica: "Por que foi preciso voltar?", botao: "Registrar rollback", obrigatorio: true },
    cancelar: { titulo: "Cancelar a GMUD", dica: "Motivo (opcional)", botao: "Cancelar GMUD", obrigatorio: false },
  };

  return (
    <dialog ref={ref} className="td-janela gm-janela" onClose={onFechar} onCancel={(e) => { if (acao) { e.preventDefault(); setAcao(null); } }}>
      <div className="td-topo">
        <div className="td-trilha">
          <span className="td-trilha-item">GMUD</span>
          <span aria-hidden>/</span>
          <span className="td-trilha-item atual">{g.chave}</span>
        </div>
        <div className="td-topo-acoes">
        <button type="button" className="td-icone" aria-label="Copiar link" title="Copiar link" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/gmud?gmud=${g.id}`)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
        </button>
        <button type="button" className="td-icone" aria-label="Fechar" title="Fechar" onClick={() => ref.current?.close()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        </div>
      </div>

      <div className="td-corpo">
        <div className="td-principal">
          {editavel ? (
            <input className="gm-titulo-campo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200}
              onBlur={() => titulo.trim() && titulo.trim() !== g.titulo && salvar({ titulo: titulo.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} aria-label="Título" />
          ) : (
            <h2 className="gm-titulo-fixo">{g.titulo}</h2>
          )}

          {erro && (erro.startsWith("Falta preencher:") ? (
            <div className="gm-erro gm-faltando" role="alert">
              <span>Falta preencher:</span>
              {erro.replace("Falta preencher:", "").replace(/\.$/, "").split(",").map((item) => {
                const nome = item.trim();
                const campo = CAMPO_DO_AVISO[nome];
                return campo ? (
                  <button key={nome} type="button" className="gm-faltando-item" onClick={() => irPara(campo)}>{nome}</button>
                ) : <span key={nome} className="gm-faltando-item">{nome}</span>;
              })}
            </div>
          ) : <p className="gm-erro" role="alert">{erro}</p>)}

          {g.conflitos && g.conflitos.length > 0 && (
            <div className="gm-alerta" role="status">
              <strong>Choque de janela</strong>
              {g.conflitos.map((c) => (
                <a key={c.id} href={`/gmud?gmud=${c.id}`}>{c.chave} · {c.titulo} ({quando(c.inicio)})</a>
              ))}
            </div>
          )}

          {g.status === "reprovada" && (
            <div className="gm-alerta perigo">
              <strong>Reprovada</strong>
              {g.aprovadores.filter((a) => a.decisao === "reprovada").map((a) => <span key={a.usuario}>{nomeUsuario(a.usuario)}: {a.comentario}</span>)}
              <span>Ajuste o que foi pedido e envie de novo.</span>
            </div>
          )}

          {(g.status === "concluida" || g.status === "revertida") && (
            <div className={`gm-alerta ${g.status === "revertida" || g.resultado === "com_problemas" ? "perigo" : "sucesso"}`}>
              <strong>{g.status === "revertida" ? "Revertida" : g.resultado === "sucesso" ? "Concluída com sucesso" : "Concluída com problemas"}</strong>
              {g.resultado_obs && <span>{g.resultado_obs}</span>}
            </div>
          )}

          <CampoTexto rotulo="Descrição" valor={g.descricao} editavel={editavel} onSalvar={(v) => salvar({ descricao: v })} dica="O que vai mudar, em poucas linhas." />
          <CampoTexto rotulo="Justificativa" valor={g.justificativa} editavel={editavel} onSalvar={(v) => salvar({ justificativa: v })} dica="Por que a mudança é necessária e o que acontece se não for feita." />
          <CampoTexto rotulo="Plano de implantação" valor={g.plano_implantacao} editavel={editavel} campo="plano_implantacao" onSalvar={(v) => salvar({ plano_implantacao: v })} dica="Passo a passo da execução, com comandos e responsáveis." />
          <CampoTexto rotulo="Plano de volta (rollback)" valor={g.plano_rollback} editavel={editavel} campo="plano_rollback" onSalvar={(v) => salvar({ plano_rollback: v })} dica="Como desfazer se der errado, e em quanto tempo." />
          <CampoTexto rotulo="Testes e validação" valor={g.plano_testes} editavel={editavel} onSalvar={(v) => salvar({ plano_testes: v })} dica="Como confirmar que deu certo depois da mudança." />

          <section className="gm-secao">
            <h3>Atividade</h3>
            <form className="gm-comentar" onSubmit={async (e) => { e.preventDefault(); if (comentario.trim() && (await postar("comentarios", { texto: comentario }))) setComentario(""); }}>
              <Avatar nome={eu || "?"} cor={corPessoa(eu)} tamanho={28} />
              <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Adicionar um comentário…" />
              <button type="submit" className="botao" disabled={!comentario.trim()}>Comentar</button>
            </form>
            <ol className="gm-eventos">
              {[...(g.eventos ?? [])].reverse().map((ev) => (
                <li key={ev.id} className={`ev-${ev.tipo}`}>
                  <Avatar nome={ev.autor} cor={corPessoa(ev.autor)} tamanho={24} />
                  <div>
                    <p><b>{nomeUsuario(ev.autor)}</b> {ev.tipo === "comentario" ? "comentou" : ev.tipo === "edicao" ? "editou" : ev.tipo === "decisao" ? "decidiu" : ""} <time>{quando(ev.criado_em)}</time></p>
                    {ev.texto && <p className={ev.tipo === "comentario" ? "gm-coment" : "gm-ev-texto"}>{ev.tipo === "edicao" ? ev.texto.split(",").map((c) => c.replace(/_/g, " ")).join(", ") : ev.texto}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="td-lateral">
          <div className="gm-etapa">
            <Selo status={g.status} />
            <Risco risco={g.risco} />
          </div>

          <div className="gm-acoes">
            {posso.enviar && <button type="button" className="botao botao-destaque" onClick={() => postar("enviar")}>{g.tipo === "padrao" ? "Enviar (pré-aprovada)" : "Enviar para aprovação"}</button>}
            {posso.decidir && <>
              <button type="button" className="botao botao-destaque" onClick={() => { setAcao("aprovar"); setMotivo(""); }}>Aprovar</button>
              <button type="button" className="botao gm-perigo" onClick={() => { setAcao("reprovar"); setMotivo(""); }}>Reprovar</button>
            </>}
            {posso.iniciar && <button type="button" className="botao botao-destaque" onClick={() => postar("iniciar")}>Iniciar execução</button>}
            {posso.encerrar && <>
              <button type="button" className="botao botao-destaque" onClick={() => { setAcao("sucesso"); setMotivo(""); }}>Concluir</button>
              <button type="button" className="botao" onClick={() => { setAcao("com_problemas"); setMotivo(""); }}>Com problemas</button>
              <button type="button" className="botao gm-perigo" onClick={() => { setAcao("revertida"); setMotivo(""); }}>Rollback</button>
            </>}
            {posso.cancelar && <button type="button" className="botao gm-lisa" onClick={() => { setAcao("cancelar"); setMotivo(""); }}>Cancelar GMUD</button>}
          </div>

          {acao && (
            <div className="gm-confirmar">
              <strong>{textosAcao[acao].titulo}</strong>
              <textarea autoFocus rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={textosAcao[acao].dica} />
              <div className="gm-edicao-acoes">
                <button type="button" className={`botao ${["reprovar", "revertida", "cancelar"].includes(acao) ? "gm-perigo" : "botao-destaque"}`} disabled={textosAcao[acao].obrigatorio && !motivo.trim()} onClick={confirmar}>{textosAcao[acao].botao}</button>
                <button type="button" className="botao" onClick={() => setAcao(null)}>Voltar</button>
              </div>
            </div>
          )}

          <section className="td-info">
            <h3>Informações</h3>
            <dl>
              <div className="td-info-linha"><dt>Tipo</dt><dd><Escolha valor={g.tipo} opcoes={TIPOS} rotulo="Tipo" disabled={!editavel} onEscolher={(v) => salvar({ tipo: v })} /></dd></div>
              <div className="td-info-linha"><dt>Ambiente</dt><dd><Escolha valor={g.ambiente} opcoes={AMBIENTES} rotulo="Ambiente" disabled={!editavel} onEscolher={(v) => salvar({ ambiente: v })} /></dd></div>
              <div className="td-info-linha"><dt>Impacto</dt><dd><Escolha valor={g.impacto} opcoes={IMPACTOS} rotulo="Impacto" disabled={!editavel} onEscolher={(v) => salvar({ impacto: v })} /></dd></div>
              <div className="td-info-linha"><dt>Probabilidade de falha</dt><dd><Escolha valor={g.probabilidade} opcoes={PROBS} rotulo="Probabilidade" disabled={!editavel} onEscolher={(v) => salvar({ probabilidade: v })} /></dd></div>
              <div className="td-info-linha" data-campo="sistemas">
                <dt>Sistemas</dt>
                <dd className="gm-sistemas">
                  {g.sistemas.map((s) => (
                    <span key={s} className="gm-chip">{s}{editavel && <button type="button" aria-label={`Tirar ${s}`} onClick={() => salvar({ sistemas: g.sistemas.filter((x) => x !== s) })}>×</button>}</span>
                  ))}
                  {editavel && (
                    <span className="gm-sistema-novo">
                      <input value={sistema} onChange={(e) => setSistema(e.target.value)} placeholder="Ex.: API" className="gm-chip-novo" aria-label="Novo sistema afetado"
                        onBlur={adicionarSistema}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); adicionarSistema(); } }} />
                      <button type="button" className="gm-sistema-botao" disabled={!sistema.trim()} onMouseDown={(e) => e.preventDefault()} onClick={adicionarSistema}>Adicionar</button>
                    </span>
                  )}
                </dd>
              </div>
              <div className="td-info-linha" data-campo="inicio">
                <dt>Início</dt>
                <dd className="gm-quando">
                  {editavel ? <>
                    <CampoData valor={ini?.dia ?? null} rotulo="Dia do início" vazio="Escolher dia" onEscolher={(d) => mudarJanela("inicio", d, null)} />
                    {ini && <Escolha valor={ini.hora} opcoes={HORAS} rotulo="Hora do início" buscaDesde={99} onEscolher={(h) => mudarJanela("inicio", ini.dia, h)} />}
                  </> : quando(g.inicio)}
                </dd>
              </div>
              <div className="td-info-linha" data-campo="fim">
                <dt>Fim</dt>
                <dd className="gm-quando">
                  {editavel ? <>
                    <CampoData valor={fim?.dia ?? null} rotulo="Dia do fim" vazio="Escolher dia" onEscolher={(d) => mudarJanela("fim", d, null)} />
                    {fim && <Escolha valor={fim.hora} opcoes={HORAS} rotulo="Hora do fim" buscaDesde={99} onEscolher={(h) => mudarJanela("fim", fim.dia, h)} />}
                  </> : quando(g.fim)}
                </dd>
              </div>
              <div className="td-info-linha">
                <dt>Executor</dt>
                <dd><Escolha valor={g.executor ?? ""} rotulo="Executor" vazio="Ninguém" disabled={!editavel}
                  opcoes={pessoas.map((p) => ({ valor: p, rotulo: nomeUsuario(p), icone: <Avatar nome={p} cor={corPessoa(p)} tamanho={20} /> }))}
                  onEscolher={(v) => salvar({ executor: v || null })} /></dd>
              </div>
              <div className="td-info-linha" data-campo="aprovadores">
                <dt>Aprovadores</dt>
                <dd className="gm-aprovadores">
                  {g.tipo === "padrao" && <span className="texto-secundario">Mudança padrão: já é pré-aprovada.</span>}
                  {g.aprovadores.map((a) => (
                    <span key={a.usuario} className={`gm-aprovador d-${a.decisao ?? "pendente"}`} title={a.comentario ?? undefined}>
                      <Avatar nome={a.usuario} cor={corPessoa(a.usuario)} tamanho={22} />
                      <span>{nomeUsuario(a.usuario)}<small>{a.decisao === "aprovada" ? "Aprovou" : a.decisao === "reprovada" ? "Reprovou" : "Pendente"}</small></span>
                      {editavel && <button type="button" aria-label={`Tirar ${a.usuario}`} onClick={() => salvar({ aprovadores: g.aprovadores.map((x) => x.usuario).filter((x) => x !== a.usuario) })}>×</button>}
                    </span>
                  ))}
                  {editavel && pessoas.some((p) => !g.aprovadores.some((a) => a.usuario === p)) && (
                    <Escolha valor="" rotulo="Adicionar aprovador" vazio="+ Aprovador"
                      opcoes={pessoas.filter((p) => !g.aprovadores.some((a) => a.usuario === p)).map((p) => ({ valor: p, rotulo: nomeUsuario(p), icone: <Avatar nome={p} cor={corPessoa(p)} tamanho={20} /> }))}
                      onEscolher={(v) => salvar({ aprovadores: [...g.aprovadores.map((x) => x.usuario), v] })} />
                  )}
                </dd>
              </div>
              <div className="td-info-linha"><dt>Criada por</dt><dd>{nomeUsuario(g.criado_por)}</dd></div>
            </dl>
          </section>
          <p className="td-datas">Criada {quando(g.criado_em)}<br />Atualizada {quando(g.atualizado_em)}</p>
        </aside>
      </div>
    </dialog>
  );
}
