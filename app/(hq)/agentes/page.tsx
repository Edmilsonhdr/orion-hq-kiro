"use client";

// Tela Agentes: mapa (canvas) + formulário para montar a equipe sem programar.
// - Dados reais: GET/POST/PUT/DELETE /api/agentes. Ler é liberado a qualquer sócio logado;
//   criar, editar, remover e testar são só de aprovadores (o servidor também confere).
// - Nativos (Atlas, Tobias, Lia, Bento, Rui, Pipo) têm código próprio: só nome, cor, sala, descrição,
//   instruções adicionais (quando aceitam) e ativo mudam. Os criados aqui escolhem modelo e ferramentas
//   do catálogo; ferramenta com efeito externo só propõe e exige aprovação (o servidor força).
// - Ao vivo: cada cartão mostra o que o agente faz, lido do mesmo feed do Escritório (/atividades).
// - Arrastar um cartão grava a posição (aprovadores).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { atualizar, enviar, excluir, obter, ErroApi } from "../../../lib/api";
import { usePoll } from "../../../lib/usePoll";
import { useRelogio } from "../../../lib/useRelogio";
import { estadoAoVivo, type AtividadeViva } from "../../../lib/aoVivo";
import AbasEquipe from "../../../components/AbasEquipe";
import { aplicarCadastro } from "../../../lib/agents";

type AtividadeFeed = AtividadeViva & { id: number };
type Modelo = "sonnet" | "haiku";

type Agente = {
  id: string;
  nome: string;
  papel: string;
  cor: string;
  sala: string;
  modelo: Modelo;
  descricao: string;
  instrucoes: string;
  ferramentas: string[];
  exige_aprovacao: boolean;
  ativo: boolean;
  sistema: boolean;
  pos_x: number | null;
  pos_y: number | null;
};

type Catalogo = { id: string; rotulo: string; efeito: boolean };
type Resposta = { agentes: Agente[]; catalogo: Catalogo[]; salas: string[]; limites: { max_ativos_criados: number } };

const NOVO = "__novo__";
const LARGURA_NO = 180;
const ALTURA_NO = 96;
const LARGURA_PALCO = 840;
const ALTURA_PALCO = 520;
const POSICAO_PADRAO = { x: 330, y: 300 };
// Nativos que aceitam instruções adicionais e os que não podem ser pausados (espelha o backend).
const ACEITAM_INSTRUCOES = ["tech", "agenda", "negocios"];
const FIXOS = ["orq", "work"];
const SEM_DESCRICAO = ["orq", "work"];
const SEM_TESTE = ["orq", "work", "agenda"];

const rascunhoVazio = (): Agente => ({
  id: NOVO,
  nome: "Novo agente",
  papel: "Especialista",
  cor: "#E5C07B",
  sala: "Copa",
  modelo: "sonnet",
  descricao: "",
  instrucoes: "",
  ferramentas: [],
  exige_aprovacao: true,
  ativo: true,
  sistema: false,
  pos_x: POSICAO_PADRAO.x,
  pos_y: POSICAO_PADRAO.y,
});

function formatarTokens(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export default function AgentesPage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aprovador, setAprovador] = useState(false);
  const [rascunho, setRascunho] = useState<Agente | null>(null); // agente novo ainda não salvo
  const [edicoes, setEdicoes] = useState<Record<string, Partial<Agente>>>({}); // alterações não salvas
  const [selecionado, setSelecionado] = useState<string>("orq");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ quem: "voce" | "agente" | "erro"; texto: string }[]>([]);
  const [tokens, setTokens] = useState<Record<string, number>>({});
  const [pendentes, setPendentes] = useState(0);
  const [posLocal, setPosLocal] = useState<Record<string, { x: number; y: number }>>({});
  const arrasto = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const palco = useRef<HTMLDivElement>(null);
  const atividades = usePoll<AtividadeFeed>("/atividades", 1500);
  const { agora } = useRelogio();

  const carregar = useCallback(async () => {
    try {
      const r = await obter<Resposta>("/agentes");
      setDados(r);
      setErroCarga(null);
      aplicarCadastro(r.agentes);
    } catch (e) {
      if (!(e instanceof ErroApi && e.status === 401)) setErroCarga(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    carregar();
    obter<{ aprovador: boolean }>("/me")
      .then((me) => setAprovador(Boolean(me.aprovador)))
      .catch(() => undefined);
  }, [carregar]);

  useEffect(() => {
    let ativo = true;
    async function buscar() {
      if (document.hidden) return;
      try {
        const t = await obter<Record<string, number>>("/atividades/tokens");
        if (ativo && t) setTokens(t);
      } catch {
        // sem rede/401: segue sem tokens
      }
      try {
        const l = await obter<{ id: number }[]>("/aprovacoes?status=pendente");
        if (ativo && Array.isArray(l)) setPendentes(l.length);
      } catch {
        // idem
      }
    }
    buscar();
    const timer = setInterval(buscar, 5000);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, []);

  // Lista exibida: servidor + alterações locais + rascunho novo.
  const lista: Agente[] = useMemo(() => {
    const base = (dados?.agentes ?? []).map((a) => ({ ...a, ...edicoes[a.id] }));
    return rascunho ? [...base, { ...rascunho, ...edicoes[NOVO] }] : base;
  }, [dados, edicoes, rascunho]);

  const atual = lista.find((a) => a.id === selecionado) ?? lista[0];
  const raiz = lista.find((a) => a.id === "orq");
  const catalogo = dados?.catalogo ?? [];
  const salas = dados?.salas ?? [];
  const sujo = atual ? Boolean(edicoes[atual.id]) || atual.id === NOVO : false;
  const nativo = Boolean(atual?.sistema);
  const somenteLeitura = !aprovador;

  function posicao(a: Agente): { x: number; y: number } {
    const p = posLocal[a.id];
    if (p) return p;
    return { x: a.pos_x ?? POSICAO_PADRAO.x, y: a.pos_y ?? POSICAO_PADRAO.y };
  }

  function mudar(parte: Partial<Agente>) {
    if (!atual) return;
    setAviso(null);
    if (atual.id === NOVO) setRascunho((r) => (r ? { ...r, ...parte } : r));
    else setEdicoes((e) => ({ ...e, [atual.id]: { ...e[atual.id], ...parte } }));
  }

  function selecionar(id: string) {
    setSelecionado(id);
    setTeste([]);
    setAviso(null);
  }

  function alternarFerramenta(f: string) {
    if (!atual) return;
    const tem = atual.ferramentas.includes(f);
    const novas = tem ? atual.ferramentas.filter((x) => x !== f) : [...atual.ferramentas, f];
    const efeito = catalogo.find((c) => c.id === f)?.efeito;
    mudar({ ferramentas: novas, ...(efeito && !tem ? { exige_aprovacao: true } : {}) });
  }

  function descartar() {
    if (!atual) return;
    if (atual.id === NOVO) {
      setRascunho(null);
      setSelecionado("orq");
    } else {
      setEdicoes((e) => {
        const { [atual.id]: _, ...resto } = e;
        return resto;
      });
    }
    setAviso(null);
  }

  async function salvar() {
    if (!atual || salvando) return;
    setSalvando(true);
    setAviso(null);
    try {
      if (atual.id === NOVO) {
        const { id: _id, sistema: _s, ...corpo } = atual;
        const criado = await enviar<Agente>("/agentes", corpo);
        setRascunho(null);
        await carregar();
        setSelecionado(criado.id);
        setAviso({ tipo: "ok", texto: `${criado.nome} criado.` });
      } else {
        const parte = edicoes[atual.id] ?? {};
        const salvo = await atualizar<Agente>(`/agentes/${atual.id}`, parte);
        setEdicoes((e) => {
          const { [atual.id]: _, ...resto } = e;
          return resto;
        });
        await carregar();
        setAviso({ tipo: "ok", texto: `${salvo.nome} salvo.` });
      }
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Não foi possível salvar." });
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!atual || atual.sistema || atual.id === NOVO) return;
    if (!window.confirm(`Remover ${atual.nome}? Essa ação não pode ser desfeita.`)) return;
    try {
      await excluir(`/agentes/${atual.id}`);
      setSelecionado("orq");
      await carregar();
      setAviso({ tipo: "ok", texto: "Agente removido." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Não foi possível remover." });
    }
  }

  async function gerar() {
    if (!descricao.trim() || gerando) return;
    setGerando(true);
    setAviso(null);
    try {
      const r = await enviar<Partial<Agente>>("/agentes/rascunho", { descricao });
      setRascunho({ ...rascunhoVazio(), ...r, id: NOVO });
      setSelecionado(NOVO);
      setTeste([]);
      setDescricao("");
      setAviso({ tipo: "ok", texto: "Rascunho gerado. Revise e clique em Salvar para criar o agente." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Não foi possível gerar o rascunho." });
    } finally {
      setGerando(false);
    }
  }

  async function enviarTeste() {
    const texto = pergunta.trim();
    if (!texto || !atual || testando) return;
    setTeste((t) => [...t, { quem: "voce", texto }]);
    setPergunta("");
    setTestando(true);
    try {
      const r = await enviar<{ resposta: string }>(`/agentes/${atual.id}/testar`, { pergunta: texto });
      setTeste((t) => [...t, { quem: "agente", texto: r.resposta }]);
    } catch (e) {
      setTeste((t) => [...t, { quem: "erro", texto: e instanceof Error ? e.message : "Falha no teste." }]);
    } finally {
      setTestando(false);
    }
  }

  // Arrastar os cartões; ao soltar, grava a posição (aprovadores, agente já salvo).
  function comecarArrasto(e: React.PointerEvent, a: Agente) {
    selecionar(a.id);
    if (somenteLeitura) return;
    const caixa = palco.current!.getBoundingClientRect();
    const p = posicao(a);
    arrasto.current = { id: a.id, dx: e.clientX - caixa.left - p.x, dy: e.clientY - caixa.top - p.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moverArrasto(e: React.PointerEvent) {
    const r = arrasto.current;
    if (!r) return;
    const caixa = palco.current!.getBoundingClientRect();
    const x = Math.round(Math.min(Math.max(0, e.clientX - caixa.left - r.dx), LARGURA_PALCO - LARGURA_NO));
    const y = Math.round(Math.min(Math.max(0, e.clientY - caixa.top - r.dy), ALTURA_PALCO - ALTURA_NO));
    setPosLocal((p) => ({ ...p, [r.id]: { x, y } }));
  }
  function soltarArrasto() {
    const r = arrasto.current;
    arrasto.current = null;
    if (!r) return;
    const p = posLocal[r.id];
    if (!p) return;
    if (r.id === NOVO) {
      setRascunho((d) => (d ? { ...d, pos_x: p.x, pos_y: p.y } : d));
      return;
    }
    atualizar(`/agentes/${r.id}`, { pos_x: p.x, pos_y: p.y })
      .then(carregar)
      .catch(() => undefined);
  }

  const linhas = useMemo(() => {
    if (!raiz) return [];
    const pr = posicao(raiz);
    return lista
      .filter((a) => a.id !== "orq" && a.id !== "work")
      .map((a) => {
        const p = posicao(a);
        const x1 = pr.x + LARGURA_NO / 2;
        const y1 = pr.y + ALTURA_NO / 2;
        const x2 = p.x + LARGURA_NO / 2;
        const y2 = p.y + ALTURA_NO / 2;
        const meio = (y1 + y2) / 2;
        return { id: a.id, cor: a.cor, ativo: a.ativo, d: `M${x1},${y1} C${x1},${meio} ${x2},${meio} ${x2},${y2}` };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, raiz, posLocal]);

  if (erroCarga && !dados) {
    return (
      <div className="ag-pagina">
        <AbasEquipe ativa="equipe" />
        <p role="alert" className="ag-vazio">
          Não foi possível carregar os agentes: {erroCarga}
        </p>
      </div>
    );
  }
  if (!dados || !atual) {
    return (
      <div className="ag-pagina">
        <AbasEquipe ativa="equipe" />
        <p className="ag-vazio">Carregando os agentes…</p>
      </div>
    );
  }

  const comEfeito = atual.ferramentas.some((f) => catalogo.find((c) => c.id === f)?.efeito);
  const ativosCriados = lista.filter((a) => !a.sistema && a.ativo && a.id !== NOVO).length;
  const limite = dados.limites.max_ativos_criados;
  const travado = somenteLeitura || salvando;
  const podeTestar = aprovador && atual.id !== NOVO && !SEM_TESTE.includes(atual.id);

  return (
    <div className="ag-pagina">
      <AbasEquipe ativa="equipe" />
      <header className="ag-topo">
        <div>
          <h1 className="titulo-pixel ag-titulo">Agentes</h1>
          <p className="ag-sub">Monte e ajuste a equipe de agentes sem programar. O Orquestrador envia cada pedido ao especialista certo.</p>
        </div>
        {somenteLeitura && <span className="ag-aviso mono">somente leitura: editar é com os aprovadores</span>}
      </header>

      <div className="ag-corpo">
        <section className="ag-lado-canvas" aria-label="Mapa dos agentes">
          <div className="ag-barra">
            <button
              type="button"
              className="botao"
              disabled={somenteLeitura || Boolean(rascunho) || ativosCriados >= limite}
              title={ativosCriados >= limite ? `Limite de ${limite} agentes criados ativos` : undefined}
              onClick={() => {
                setRascunho(rascunhoVazio());
                selecionar(NOVO);
              }}
            >
              + Novo agente
            </button>
            <span className="ag-dica">
              {somenteLeitura ? "Clique num cartão para ver os detalhes." : "Arraste os cartões. Clique para editar."}
            </span>
            <span className="ag-resumo mono">
              {formatarTokens(Object.values(tokens).reduce((a, b) => a + b, 0))} tokens hoje
              {" · "}
              <Link href="/aprovacoes" className={pendentes > 0 ? "ag-alerta" : undefined}>
                {pendentes} {pendentes === 1 ? "aprovação pendente" : "aprovações pendentes"}
              </Link>
            </span>
          </div>

          <div className="ag-scroll">
            <div
              className="ag-palco"
              ref={palco}
              style={{ width: LARGURA_PALCO, height: ALTURA_PALCO }}
              onPointerMove={moverArrasto}
              onPointerUp={soltarArrasto}
            >
              <svg className="ag-linhas" width={LARGURA_PALCO} height={ALTURA_PALCO} aria-hidden="true">
                {linhas.map((l) => (
                  <path
                    key={l.id}
                    d={l.d}
                    fill="none"
                    stroke={l.cor}
                    strokeWidth={selecionado === l.id ? 3 : 2}
                    strokeOpacity={l.ativo ? 0.75 : 0.25}
                    strokeDasharray={l.ativo ? undefined : "6 6"}
                  />
                ))}
              </svg>

              {lista.map((a) => {
                const vivo = agora === null || !a.ativo ? null : estadoAoVivo(atividades, a.id, agora);
                const estado = vivo?.estado ?? "ocioso";
                const p = posicao(a);
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    className={`ag-no ${estado}${selecionado === a.id ? " sel" : ""}${a.ativo ? "" : " inativo"}${a.id === "orq" ? " raiz" : ""}`}
                    style={{ left: p.x, top: p.y, width: LARGURA_NO, height: ALTURA_NO, borderColor: a.cor }}
                    onPointerDown={(e) => comecarArrasto(e, a)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") selecionar(a.id);
                    }}
                    aria-pressed={selecionado === a.id}
                  >
                    <span className="ag-no-faixa" style={{ background: a.cor }} aria-hidden="true" />
                    <strong className="ag-no-nome">
                      <span className={`ag-ponto ${estado}`} aria-hidden="true" />
                      {a.nome}
                    </strong>
                    <span className="ag-no-papel">{a.papel}</span>
                    <span className="ag-no-vivo" title={vivo?.detalhe ?? undefined}>
                      {!a.ativo && "pausado"}
                      {a.ativo && estado === "trabalhando" && (vivo?.detalhe ?? "trabalhando…")}
                      {a.ativo && estado === "aguardando" && `aguardando aprovação${vivo?.detalhe ? `: ${vivo.detalhe}` : ""}`}
                      {a.ativo && estado === "ocioso" && (tokens[a.id] ? `${formatarTokens(tokens[a.id])} tokens hoje` : "ocioso")}
                    </span>
                    <span className="ag-no-selos">
                      <span className="ag-selo mono">{a.modelo === "sonnet" ? "Sonnet" : "Haiku"}</span>
                      {a.exige_aprovacao && !a.sistema && <span className="ag-selo espera mono">aprova</span>}
                      {a.id === NOVO && <span className="ag-selo espera mono">não salvo</span>}
                      {!a.sistema && a.ferramentas.length > 0 && <span className="ag-selo mono">{a.ferramentas.length} ferr.</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="ag-painel" aria-label={`Configuração de ${atual.nome}`}>
          <div className="ag-col">
            {aprovador && (
              <div className="ag-cartao ag-gerar">
                <label htmlFor="ag-desc" className="ag-rotulo">
                  Criar a partir de uma descrição
                </label>
                <textarea
                  id="ag-desc"
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: um agente que pesquise concorrentes e resuma novidades toda semana"
                  disabled={Boolean(rascunho) || ativosCriados >= limite}
                />
                <button
                  type="button"
                  className="botao botao-destaque"
                  onClick={gerar}
                  disabled={!descricao.trim() || gerando || Boolean(rascunho) || ativosCriados >= limite}
                >
                  {gerando ? "Gerando…" : "Gerar rascunho"}
                </button>
              </div>
            )}

            <div className="ag-cartao">
              <div className="ag-cartao-topo">
                <h2 className="ag-h2" style={{ color: atual.cor }}>
                  {atual.nome}
                  {nativo && <span className="ag-selo mono ag-selo-nativo">nativo</span>}
                </h2>
                <label className="ag-interruptor">
                  <input
                    type="checkbox"
                    checked={atual.ativo}
                    disabled={travado || FIXOS.includes(atual.id)}
                    onChange={(e) => mudar({ ativo: e.target.checked })}
                  />
                  <span>{atual.ativo ? "Ativo" : "Pausado"}</span>
                </label>
              </div>

              <div className="ag-grade">
                <label>
                  <span className="ag-rotulo">Nome</span>
                  <input value={atual.nome} disabled={travado} maxLength={40} onChange={(e) => mudar({ nome: e.target.value })} />
                </label>
                <label>
                  <span className="ag-rotulo">Papel</span>
                  <input value={atual.papel} disabled={travado} maxLength={60} onChange={(e) => mudar({ papel: e.target.value })} />
                </label>
                <label>
                  <span className="ag-rotulo">Sala no escritório</span>
                  <select value={atual.sala} disabled={travado} onChange={(e) => mudar({ sala: e.target.value })}>
                    {salas.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="ag-rotulo" title={nativo ? "O modelo dos nativos é definido no código." : "Sonnet: mais capaz. Haiku: rápido e barato."}>
                    Modelo
                  </span>
                  <select value={atual.modelo} disabled={travado || nativo} onChange={(e) => mudar({ modelo: e.target.value as Modelo })}>
                    <option value="sonnet">Sonnet</option>
                    <option value="haiku">Haiku</option>
                  </select>
                </label>
              </div>

              {!SEM_DESCRICAO.includes(atual.id) && (
                <label>
                  <span className="ag-rotulo">Quando o Orquestrador deve chamar este agente</span>
                  <input
                    value={atual.descricao}
                    disabled={travado}
                    maxLength={400}
                    onChange={(e) => mudar({ descricao: e.target.value })}
                    placeholder="Ex.: pesquisa de concorrentes e tendências de mercado"
                  />
                </label>
              )}

              <label>
                <span className="ag-rotulo">{nativo ? "Instruções adicionais (somadas às do sistema)" : "Instruções"}</span>
                <textarea
                  rows={6}
                  value={atual.instrucoes}
                  disabled={travado || (nativo && !ACEITAM_INSTRUCOES.includes(atual.id))}
                  maxLength={8000}
                  onChange={(e) => mudar({ instrucoes: e.target.value })}
                  placeholder={
                    nativo && !ACEITAM_INSTRUCOES.includes(atual.id)
                      ? "Este agente não aceita instruções adicionais."
                      : "Diga quem o agente é, o que faz e o que nunca deve fazer."
                  }
                />
              </label>
            </div>
          </div>

          <div className="ag-col">
            <div className="ag-cartao">
              <fieldset className="ag-ferramentas" disabled={travado || nativo}>
                <legend className="ag-rotulo">Ferramentas {nativo && "(fixas no código do agente nativo)"}</legend>
                {catalogo.map((f) => (
                  <label key={f.id} className="ag-ferramenta">
                    <input type="checkbox" checked={atual.ferramentas.includes(f.id)} onChange={() => alternarFerramenta(f.id)} />
                    <span>{f.rotulo}</span>
                    {f.efeito && <span className="ag-selo espera mono">só propõe</span>}
                  </label>
                ))}
              </fieldset>

              {!nativo && (
                <label className="ag-interruptor ag-aprovacao">
                  <input
                    type="checkbox"
                    checked={atual.exige_aprovacao || comEfeito}
                    disabled={travado || comEfeito}
                    onChange={(e) => mudar({ exige_aprovacao: e.target.checked })}
                  />
                  <span>
                    Exige aprovação antes de agir
                    {comEfeito && <em> (obrigatório: tem ferramenta que propõe alterações)</em>}
                  </span>
                </label>
              )}

              {aviso && (
                <p role={aviso.tipo === "erro" ? "alert" : "status"} className={aviso.tipo === "erro" ? "ag-erro" : "ag-ok"}>
                  {aviso.texto}
                </p>
              )}

              {aprovador && (
                <div className="ag-acoes">
                  <button type="button" className="botao botao-destaque" onClick={salvar} disabled={!sujo || salvando}>
                    {salvando ? "Salvando…" : atual.id === NOVO ? "Criar agente" : "Salvar"}
                  </button>
                  {sujo && (
                    <button type="button" className="botao" onClick={descartar} disabled={salvando}>
                      {atual.id === NOVO ? "Cancelar" : "Descartar"}
                    </button>
                  )}
                  {!nativo && atual.id !== NOVO && (
                    <button type="button" className="botao" onClick={remover} disabled={salvando}>
                      Remover
                    </button>
                  )}
                </div>
              )}
              <p className="ag-rodape mono">
                {ativosCriados}/{limite} agentes criados ativos
              </p>
            </div>

            <div className="ag-cartao">
              <h2 className="ag-h2">Testar {atual.nome}</h2>
              {!podeTestar ? (
                <p className="ag-vazio">
                  {atual.id === NOVO
                    ? "Salve o agente para testá-lo."
                    : !aprovador
                      ? "O teste gasta tokens e é liberado só para aprovadores."
                      : "Este agente não tem teste isolado."}
                </p>
              ) : (
                <>
                  {sujo && <p className="ag-vazio">O teste usa a versão salva. Salve as alterações antes de testar.</p>}
                  <div className="ag-teste" aria-live="polite">
                    {teste.length === 0 && <p className="ag-vazio">Pergunte algo para ver como ele responde de verdade.</p>}
                    {teste.map((m, i) => (
                      <p key={i} className={`ag-msg ${m.quem}`}>
                        <strong>{m.quem === "voce" ? "Você" : m.quem === "erro" ? "Erro" : atual.nome}:</strong> {m.texto}
                      </p>
                    ))}
                    {testando && <p className="ag-vazio">{atual.nome} está pensando…</p>}
                  </div>
                  <form
                    className="ag-envio"
                    onSubmit={(e) => {
                      e.preventDefault();
                      enviarTeste();
                    }}
                  >
                    <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Escreva uma pergunta de teste" disabled={testando} />
                    <button type="submit" className="botao" disabled={!pergunta.trim() || testando}>
                      Enviar
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
