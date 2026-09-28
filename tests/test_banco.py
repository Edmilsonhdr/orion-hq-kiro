"""Testes da fixture de banco (task 2.3).

Provam que o Postgres efêmero do `pgserver` sobe, aplica o schema e o
checkpointer, e que a limpeza entre testes de fato isola um teste do outro.
Estes testes usam a fixture opt-in `banco`; sem ela, nenhum Postgres sobe.
"""

from _orion import db


def test_salvar_e_ler_mensagem(banco):
    """A fixture aplica o schema: dá para inserir e ler uma mensagem."""
    linha = db.salvar_mensagem("dimi", "Oi, Orion", run_id="run-1")

    assert linha["id"] == 1  # restart identity zera a sequência a cada teste
    assert linha["autor"] == "dimi"
    assert linha["texto"] == "Oi, Orion"
    assert linha["run_id"] == "run-1"

    historico = db.historico_recente()
    assert historico == "dimi: Oi, Orion"


def test_isolamento_entre_testes(banco):
    """Este teste roda depois do anterior e deve ver a tabela vazia.

    Se a limpeza entre testes não funcionasse, a mensagem inserida em
    `test_salvar_e_ler_mensagem` ainda estaria aqui.
    """
    linhas = db.consultar("select count(*) as n from mensagens")
    assert linhas[0]["n"] == 0
    assert db.historico_recente() == ""


def test_truncate_cobre_todas_as_tabelas_do_dominio(banco):
    """Insere em cada tabela do domínio; o próximo teste deve vê-las vazias."""
    db.executar(
        "insert into atividades (agente, tipo) values (%s, %s)", ("tech", "inicio")
    )
    db.executar(
        "insert into changelog (fonte, titulo, resumo) values (%s, %s, %s)",
        ("nota", "t", "r"),
    )
    db.executar(
        """
        insert into aprovacoes (run_id, chave, tipo, proposta)
        values (%s, %s, %s, %s)
        """,
        ("run-x", "run-x:0", "criar_reuniao", "{}"),
    )
    db.executar(
        "insert into reunioes (titulo, inicio, fim) values (%s, now(), now())",
        ("Sync",),
    )

    for tabela in ("atividades", "changelog", "aprovacoes", "reunioes"):
        n = db.um(f"select count(*) as n from {tabela}")["n"]
        assert n == 1, f"{tabela} deveria ter 1 linha"


def test_dominio_limpo_apos_insercoes(banco):
    """Roda após o teste que inseriu em várias tabelas: tudo zerado."""
    for tabela in ("mensagens", "atividades", "changelog", "aprovacoes", "reunioes"):
        n = db.um(f"select count(*) as n from {tabela}")["n"]
        assert n == 0, f"{tabela} deveria estar vazia por causa do truncate"


def test_checkpointer_foi_preparado(banco):
    """`PostgresSaver.setup()` cria as tabelas do checkpointer no mesmo banco."""
    linha = db.um(
        """
        select to_regclass('public.checkpoints') as tabela
        """
    )
    assert linha["tabela"] == "checkpoints"
