"""Popula o Postgres com uma sequência de atividades de exemplo (demo).

Objetivo: testar visualmente o escritório virtual (`/escritorio`) — mesas
ativas, envelope voando entre elas, painel "Tokens hoje", estado "espera"
(âmbar) na mesa da Agenda quando há aprovação pendente — SEM chamar a API da
Anthropic e SEM gastar tokens de modelo.

O que o script insere (tudo com timestamps recentes, via `now()` do Postgres,
para as mesas aparecerem ATIVAS — o front considera ativo idade < 30 s):

- uma sequência de atividades num `run_id` de demonstração exercitando os tipos
  `inicio`, `pensando`, `delegou` (com `dados.de`/`dados.para` para animar o
  envelope entre as mesas: orq→tech, tech→orq, orq→agenda), `ferramenta`,
  `aguardando_aprovacao` (com `dados.aprovacao_id`), `concluiu` e `resposta`;
- `tokens` variados em alguns agentes, para popular o painel "Tokens hoje"
  (o endpoint `/atividades/tokens` soma os de hoje, fuso America/Sao_Paulo);
- uma aprovação pendente (tabela `aprovacoes`) — deixa a mesa da Agenda em
  âmbar — cuja `proposta` descreve uma reunião coerente;
- uma reunião futura de exemplo (tabela `reunioes`), para as "próximas reuniões".

Reaproveita os helpers de `_orion` (`atividades.emitir`, `db.um`/`db.executar`)
em vez de reabrir conexão à mão. `DATABASE_URL` é lido do ambiente dentro de
função (nunca no import).

Cada execução usa um `run_id` novo (com carimbo de tempo), então dá para rodar
de novo para "reanimar" o escritório — as mesas voltam a ficar ativas e um novo
envelope volta a voar.

Como rodar (Windows + WSL, ver ambiente.md):

    wsl.exe -d Ubuntu-22.04 -- bash -c "cd /home/edmilsonh/projects/orion-hq/orion-hq-kiro && \
        .venv/bin/python scripts/seed_demo.py"

Requer `DATABASE_URL` apontando para um Postgres com o schema já aplicado
(rode antes `scripts/setup_db.py` se necessário). Ver `.env.example`.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Optional

# O pacote `_orion` vive em `api/_orion/`. Em produção, `api/index.py` adiciona
# `api/` ao sys.path; aqui fazemos o mesmo para importar `from _orion import ...`
# do mesmo jeito que o app (e como os testes fazem em tests/conftest.py).
_RAIZ = Path(__file__).resolve().parent.parent
_API = _RAIZ / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))


def _exigir_database_url() -> str:
    """Lê `DATABASE_URL` do ambiente (dentro da função, não no import)."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print(
            "DATABASE_URL não definida. Configure a URL do Postgres/Neon "
            "(veja .env.example) e rode antes o scripts/setup_db.py.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return url


def _run_id_demo() -> str:
    """Gera um `run_id` de demonstração único por execução.

    Usar um id novo a cada rodada permite "reanimar" o escritório rodando o
    script de novo, sem colidir com a `chave` única de aprovações anteriores.
    """
    return f"demo-{int(time.time())}"


def criar_aprovacao_pendente(run_id: str) -> Optional[int]:
    """Insere uma aprovação pendente (mesa da Agenda fica em âmbar).

    A `proposta` (jsonb) descreve uma reunião coerente com a sequência de
    atividades. `chave` é única (run_id:passo) — como o run_id muda a cada
    execução, rodar de novo não colide. Devolve o id inserido (ou None se, por
    algum motivo, o insert não retornar linha).
    """
    from _orion import db
    from psycopg.types.json import Json

    proposta = {
        "titulo": "Alinhamento do copiloto de IA do Orion",
        "inicio": "2026-01-15T14:00:00-03:00",
        "fim": "2026-01-15T14:30:00-03:00",
        "participantes": ["dimi", "jullyana"],
        "pauta": [
            "Revisar o PR do copiloto de IA",
            "Definir métricas de acompanhamento",
            "Próximos passos da fase B2C",
        ],
    }
    linha = db.um(
        """
        insert into aprovacoes (run_id, chave, tipo, proposta, pedido_por, status)
        values (%s, %s, %s, %s, %s, 'pendente')
        returning id
        """,
        (
            run_id,
            f"{run_id}:aprovacao",
            "reuniao",
            Json(proposta),
            "agenda",
        ),
    )
    return int(linha["id"]) if linha else None


def criar_reuniao_futura(run_id: str) -> None:
    """Insere uma reunião futura de exemplo (para "próximas reuniões").

    Coerente com a proposta da aprovação. `participantes` e `pauta` são
    `text[]`; passamos listas Python, que o driver mapeia para arrays.
    """
    from _orion import db

    db.executar(
        """
        insert into reunioes
            (titulo, inicio, fim, participantes, pauta, criado_por, run_id)
        values (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            "Alinhamento do copiloto de IA do Orion",
            "2026-01-15T14:00:00-03:00",
            "2026-01-15T14:30:00-03:00",
            ["dimi", "jullyana"],
            [
                "Revisar o PR do copiloto de IA",
                "Definir métricas de acompanhamento",
                "Próximos passos da fase B2C",
            ],
            "dimi",
            run_id,
        ),
    )


def semear_atividades(run_id: str, aprovacao_id: Optional[int]) -> int:
    """Emite a sequência de atividades de demonstração e devolve quantas gravou.

    Usa `atividades.emitir` (mesmo caminho do app), que grava `criado_em` como
    `now()` — timestamps recentes, então as mesas aparecem ATIVAS. Um pequeno
    `sleep` entre passos deixa a ordem/animação mais natural, sem tornar o
    script lento.

    Cobre os tipos: inicio, pensando, delegou (orq→tech, tech→orq, orq→agenda),
    ferramenta, aguardando_aprovacao (com dados.aprovacao_id), concluiu,
    resposta. `tokens` variados alimentam o painel "Tokens hoje".
    """
    from _orion import atividades

    # Cada passo: (agente, tipo, detalhe, dados, tokens).
    passos: list[tuple[str, str, Optional[str], Optional[dict], int]] = [
        ("orq", "inicio", "Recebi o pedido dos sócios", None, 0),
        ("orq", "pensando", "Entendendo o que foi pedido", None, 320),
        (
            "orq",
            "delegou",
            "Delegando ao Tech: o que mudou no Orion?",
            {"de": "orq", "para": "tech"},
            0,
        ),
        ("tech", "inicio", "Assumindo a tarefa técnica", None, 0),
        ("tech", "pensando", "Consultando o histórico do projeto", None, 540),
        (
            "tech",
            "ferramenta",
            "buscar_changelog('copiloto de IA')",
            {"ferramenta": "buscar_changelog", "consulta": "copiloto de IA"},
            210,
        ),
        (
            "tech",
            "concluiu",
            "Resumo técnico pronto (2 PRs recentes)",
            None,
            180,
        ),
        (
            "tech",
            "delegou",
            "Devolvendo o resultado ao Orquestrador",
            {"de": "tech", "para": "orq"},
            0,
        ),
        (
            "orq",
            "delegou",
            "Delegando à Agenda: propor uma reunião",
            {"de": "orq", "para": "agenda"},
            0,
        ),
        ("agenda", "inicio", "Montando proposta de reunião", None, 0),
        ("agenda", "pensando", "Escolhendo horário e pauta", None, 410),
        (
            "agenda",
            "aguardando_aprovacao",
            "Aguardando Dimi ou Jullyana aprovar a reunião",
            {"aprovacao_id": aprovacao_id},
            0,
        ),
        (
            "orq",
            "resposta",
            "Consolidei o técnico e deixei a reunião para aprovação",
            None,
            260,
        ),
    ]

    gravadas = 0
    for agente, tipo, detalhe, dados, tokens in passos:
        linha = atividades.emitir(
            run_id, agente, tipo, detalhe=detalhe, dados=dados, tokens=tokens
        )
        if linha is not None:
            gravadas += 1
        # Pequena pausa para uma ordem/animação mais natural (não trava o script).
        time.sleep(0.15)
    return gravadas


def main() -> None:
    _exigir_database_url()
    run_id = _run_id_demo()

    aprovacao_id = criar_aprovacao_pendente(run_id)
    criar_reuniao_futura(run_id)
    gravadas = semear_atividades(run_id, aprovacao_id)

    print(f"run_id de demonstração: {run_id}")
    print(f"atividades gravadas: {gravadas}")
    print(f"aprovação pendente: id={aprovacao_id}")
    print("Reunião futura de exemplo inserida.")
    print("Abra /escritorio para ver as mesas ativas e o envelope voando.")
    print("Rode de novo para reanimar o escritório.")


if __name__ == "__main__":
    main()
