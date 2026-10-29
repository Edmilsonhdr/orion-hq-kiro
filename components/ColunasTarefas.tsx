"use client";

// Gerenciar as colunas do quadro de tarefas: renomear, reordenar, marcar como "de concluídas", criar e excluir.
// As colunas são as mesmas para todas as pessoas. Cada ação grava na hora e pede ao quadro para recarregar.

import { useState, type FormEvent } from "react";
import { atualizar, enviar, excluir } from "../lib/api";
import type { ColunaTarefa } from "../lib/tarefas";

type Props = {
  colunas: ColunaTarefa[];
  contagem: Record<string, number>; // tarefas por coluna (para avisar ao excluir)
  onMudou: () => Promise<void>;
};

export default function ColunasTarefas({ colunas, contagem, onMudou }: Props) {
  const [novo, setNovo] = useState("");
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function rodar(acao: () => Promise<unknown>) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setOcupado(false);
    }
  }

  async function renomear(c: ColunaTarefa) {
    const nome = (nomes[c.chave] ?? c.nome).trim();
    if (nome === c.nome) return;
    await rodar(() => atualizar(`/tarefas/colunas/${c.chave}`, { nome }));
    setNomes((n) => {
      const { [c.chave]: _, ...resto } = n;
      return resto;
    });
  }

  async function apagar(c: ColunaTarefa) {
    const tarefas = contagem[c.chave] ?? 0;
    let destino = "";
    if (tarefas > 0) {
      const outras = colunas.filter((o) => o.chave !== c.chave);
      const resposta = window.prompt(
        `A coluna “${c.nome}” tem ${tarefas} tarefa(s). Para qual coluna elas vão?\n${outras.map((o, i) => `${i + 1} = ${o.nome}`).join("\n")}`,
        "1"
      );
      const escolhida = outras[Number(resposta) - 1];
      if (!escolhida) return;
      destino = `?mover_para=${encodeURIComponent(escolhida.chave)}`;
    } else if (!window.confirm(`Excluir a coluna “${c.nome}”?`)) {
      return;
    }
    await rodar(() => excluir(`/tarefas/colunas/${c.chave}${destino}`));
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    await rodar(() => enviar("/tarefas/colunas", { nome: novo.trim() }));
    setNovo("");
  }

  return (
    <div className="tar-colunas-gestao">
      <p className="texto-secundario" style={{ marginTop: 0 }}>
        As colunas valem para todas. Tarefas novas entram na primeira coluna; colunas marcadas como “de concluídas”
        registram a data de conclusão e somem do quadro depois de 14 dias.
      </p>
      <ul className="tar-colunas-lista">
        {colunas.map((c, i) => (
          <li key={c.chave}>
            <input
              aria-label={`Nome da coluna ${c.nome}`}
              value={nomes[c.chave] ?? c.nome}
              maxLength={30}
              onChange={(e) => setNomes((n) => ({ ...n, [c.chave]: e.target.value }))}
              onBlur={() => renomear(c)}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), e.preventDefault())}
            />
            <label className="tar-colunas-concluida" title="Tarefas aqui contam como concluídas">
              <input
                type="checkbox"
                checked={c.concluida}
                onChange={(e) => rodar(() => atualizar(`/tarefas/colunas/${c.chave}`, { concluida: e.target.checked }))}
              />
              concluída
            </label>
            <span className="mono texto-secundario tar-colunas-n">{contagem[c.chave] ?? 0}</span>
            <button type="button" className="botao" disabled={i === 0 || ocupado} aria-label={`Mover ${c.nome} para a esquerda`} onClick={() => rodar(() => enviar(`/tarefas/colunas/${c.chave}/mover`, { posicao: i - 1 }))}>
              ←
            </button>
            <button type="button" className="botao" disabled={i === colunas.length - 1 || ocupado} aria-label={`Mover ${c.nome} para a direita`} onClick={() => rodar(() => enviar(`/tarefas/colunas/${c.chave}/mover`, { posicao: i + 1 }))}>
              →
            </button>
            <button type="button" className="botao com-excluir" disabled={colunas.length <= 1 || ocupado} aria-label={`Excluir ${c.nome}`} onClick={() => apagar(c)}>
              Excluir
            </button>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="com-erro">
          {erro}
        </p>
      )}
      <form onSubmit={criar} className="com-piloto-novo">
        <input aria-label="Nome da nova coluna" placeholder="Nova coluna (ex.: Em revisão)" value={novo} maxLength={30} onChange={(e) => setNovo(e.target.value)} />
        <button type="submit" className="botao botao-destaque" disabled={!novo.trim() || ocupado}>
          Adicionar coluna
        </button>
      </form>
    </div>
  );
}
