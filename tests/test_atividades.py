"""Testes de `_orion/atividades.py` (task 4.1).

Cobre:
- `emitir()` insere e devolve a linha; nunca lança mesmo com o banco fora
  (DATABASE_URL inválida → None, sem exceção).
- `listar(desde)` filtra por id e ordena crescente; `desde=0` devolve as
  últimas 80 em ordem crescente.
- `tokens_hoje()` soma por agente no dia (fuso de São Paulo).

Os testes de banco usam a fixture opt-in `banco` (Postgres efêmero do
conftest). O teste de robustez de `emitir()` não usa banco: aponta
DATABASE_URL para um destino inválido e verifica que não estoura.
"""

import os

from _orion import atividades, db


def test_emitir_insere_e_devolve_linha(banco):
    linha = atividades.emitir(
        "run-1", "tech", "ferramenta",
        detalhe="buscar_changelog(onboarding)",
        dados={"consulta": "onboarding"},
        tokens=42,
    )

    assert linha is not None
    assert linha["id"] == 1
    assert linha["run_id"] == "run-1"
    assert linha["agente"] == "tech"
    assert linha["tipo"] == "ferramenta"
    assert linha["detalhe"] == "buscar_changelog(onboarding)"
    assert linha["tokens"] == 42
    # `dados` é jsonb e volta como dict.
    assert linha["dados"] == {"consulta": "onboarding"}


def test_emitir_aceita_dados_none_e_tokens_zero(banco):
    linha = atividades.emitir("run-1", "orq", "inicio")
    assert linha is not None
    assert linha["dados"] is None
    assert linha["tokens"] == 0


def test_emitir_delegou_guarda_de_e_para(banco):
    linha = atividades.emitir(
        "run-1", "orq", "delegou", dados={"de": "orq", "para": "tech"}
    )
    assert linha is not None
    assert linha["dados"] == {"de": "orq", "para": "tech"}


def test_emitir_nunca_lanca_com_banco_fora(monkeypatch):
    # Conexão que falha (DATABASE_URL inválida) não pode derrubar o fluxo:
    # emitir deve engolir a exceção e devolver None (Error Handling do design).
    # Em vez de depender de rede/timeout, forçamos db.conexao a estourar.
    def explode(*args, **kwargs):
        raise RuntimeError("banco fora")

    monkeypatch.setattr(db, "um", explode)
    resultado = atividades.emitir("run-x", "tech", "erro", detalhe="deu ruim")
    assert resultado is None


def test_emitir_tipo_desconhecido_ainda_grava(banco):
    # Tipo fora da lista não deve bloquear (apenas loga aviso).
    linha = atividades.emitir("run-1", "tech", "tipo-inventado")
    assert linha is not None
    assert linha["tipo"] == "tipo-inventado"


def test_listar_desde_filtra_e_ordena_crescente(banco):
    for i in range(5):
        atividades.emitir("run-1", "tech", "pensando", detalhe=f"passo {i}")

    # Todas: ids de 1 a 5, ordem crescente.
    todas = atividades.listar(0)
    assert [a["id"] for a in todas] == [1, 2, 3, 4, 5]

    # A partir de 2: só 3, 4, 5, em ordem crescente.
    novas = atividades.listar(2)
    assert [a["id"] for a in novas] == [3, 4, 5]


def test_listar_desde_zero_pega_janela_de_7h_em_ordem_crescente(banco):
    # 100 antigas (8 h atrás) e 30 recentes numa única conexão cada.
    db.executar(
        """
        insert into atividades (run_id, agente, tipo, detalhe, criado_em)
        select 'run-1', 'tech', 'pensando', g::text, now() - interval '8 hours'
        from generate_series(1, 100) as g
        """
    )
    db.executar(
        """
        insert into atividades (run_id, agente, tipo, detalhe)
        select 'run-2', 'tech', 'pensando', g::text
        from generate_series(1, 30) as g
        """
    )

    resultado = atividades.listar(0)
    ids = [a["id"] for a in resultado]
    assert ids == sorted(ids)
    # As 30 recentes entram pela janela; das antigas, só o bastante para 80.
    assert len(resultado) == 80
    assert ids[0] == 51
    assert ids[-1] == 130


def test_listar_desde_zero_pega_ultimas_80_em_ordem_crescente(banco):
    # Insere 100 atividades antigas numa única conexão (generate_series):
    # fora da janela de 7 h, vale o mínimo das 80 mais recentes.
    db.executar(
        """
        insert into atividades (run_id, agente, tipo, detalhe, criado_em)
        select 'run-1', 'tech', 'pensando', g::text, now() - interval '1 day'
        from generate_series(1, 100) as g
        """
    )

    resultado = atividades.listar(0)
    assert len(resultado) == 80
    # Devolvidas em ordem crescente de id; as 80 mais recentes são ids 21..100.
    ids = [a["id"] for a in resultado]
    assert ids == sorted(ids)
    assert ids[0] == 21
    assert ids[-1] == 100


def test_listar_desde_maior_que_todos_devolve_vazio(banco):
    atividades.emitir("run-1", "tech", "pensando")
    assert atividades.listar(999) == []


def test_tokens_hoje_soma_por_agente(banco):
    atividades.emitir("run-1", "tech", "pensando", tokens=10)
    atividades.emitir("run-1", "tech", "pensando", tokens=5)
    atividades.emitir("run-1", "orq", "pensando", tokens=7)
    atividades.emitir("run-1", "orq", "delegou", tokens=0)

    soma = atividades.tokens_hoje()
    assert soma == {"tech": 15, "orq": 7}


def test_tokens_hoje_ignora_dias_anteriores(banco):
    # Uma atividade de ontem (fuso de São Paulo) não deve entrar na soma de hoje.
    db.executar(
        """
        insert into atividades (run_id, agente, tipo, tokens, criado_em)
        values (%s, %s, %s, %s, (now() at time zone 'America/Sao_Paulo' - interval '1 day') at time zone 'America/Sao_Paulo')
        """,
        ("run-ontem", "tech", "pensando", 100),
    )
    atividades.emitir("run-hoje", "tech", "pensando", tokens=3)

    soma = atividades.tokens_hoje()
    assert soma == {"tech": 3}


def test_tokens_hoje_vazio_quando_sem_atividades(banco):
    assert atividades.tokens_hoje() == {}
