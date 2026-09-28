"""Configuração compartilhada dos testes do backend.

O pacote `_orion` vive em `api/_orion/`. Em produção, `api/index.py` adiciona o
próprio diretório ao `sys.path`; nos testes fazemos o mesmo aqui para poder
importar `import config`, `import db`, etc. da mesma forma que o app.

Este arquivo também monta a infraestrutura de banco para os testes que
precisam de um Postgres real (task 2.3):

- `servidor_pg` (escopo de sessão): sobe um Postgres efêmero com `pgserver`
  (sem Docker), aplica `db/schema.sql` e roda `PostgresSaver.setup()` uma única
  vez, e aponta `DATABASE_URL` para ele. Encerra o servidor ao final da sessão.
- `banco` (escopo de função): garante `DATABASE_URL` apontando para o servidor
  de teste e limpa (TRUNCATE) as tabelas do domínio antes e depois de cada
  teste, para isolamento.

As fixtures de banco são **opt-in**: só os testes que pedirem `banco` (ou
`servidor_pg`) sobem/usam o Postgres. Os testes que usam apenas `monkeypatch`
(config/db puros) continuam rápidos e sem banco.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.path.join(RAIZ, "api")
if API not in sys.path:
    sys.path.insert(0, API)

# `scripts/` não é um pacote; adicionamos ao path para reutilizar as funções de
# `setup_db.py` (aplicar schema + preparar checkpointer) em vez de duplicá-las.
SCRIPTS = os.path.join(RAIZ, "scripts")
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)


# Tabelas do domínio que devem ser limpas entre testes, conforme a Testing
# Strategy do design.md. As tabelas do checkpointer não precisam ser limpas,
# mas as truncamos junto (se existirem) para isolar os testes de grafo futuros.
_TABELAS_DOMINIO = (
    "mensagens",
    "atividades",
    "changelog",
    "aprovacoes",
    "reunioes",
)


def _truncar_dominio() -> None:
    """Esvazia as tabelas do domínio e reinicia os `bigserial`.

    Usa uma conexão curta via `_orion.db.conexao()` (mesmo caminho do app), que
    já respeita `autocommit=True` e `prepare_threshold=None`. `RESTART IDENTITY`
    zera os ids para que os testes possam contar com sequências previsíveis;
    `CASCADE` cobre eventuais dependências.
    """
    from _orion import db  # importado tarde: depende de API estar no sys.path

    alvos = ", ".join(_TABELAS_DOMINIO)
    with db.conexao() as conn:
        with conn.cursor() as cur:
            cur.execute(f"truncate table {alvos} restart identity cascade")


@pytest.fixture(scope="session")
def servidor_pg():
    """Sobe um Postgres efêmero para a sessão de testes.

    Usa `pgserver.get_server(pgdata, cleanup_mode="delete")`, que cria (se
    preciso) o diretório de dados, inicia o servidor e o remove ao final. A URL
    de conexão vem de `PostgresServer.get_uri()`. Aplicamos o schema e o
    checkpointer reaproveitando as funções de `scripts/setup_db.py`.

    Aponta `DATABASE_URL` para o servidor durante toda a sessão, restaurando o
    valor anterior no fim. Devolve a URL do banco.
    """
    import pgserver
    import setup_db

    original = os.environ.get("DATABASE_URL")
    tmp = tempfile.mkdtemp(prefix="orion-hq-pg-")
    servidor = pgserver.get_server(Path(tmp), cleanup_mode="delete")
    try:
        url = servidor.get_uri()
        os.environ["DATABASE_URL"] = url

        # Reaproveita a lógica do setup real (idempotente).
        setup_db.aplicar_schema(url)
        setup_db.preparar_checkpointer(url)

        yield url
    finally:
        # Restaura DATABASE_URL e derruba o servidor (o pgdata é apagado por
        # causa do cleanup_mode="delete").
        if original is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = original
        servidor.cleanup()


@pytest.fixture()
def banco(servidor_pg):
    """Banco limpo para um teste, isolado dos demais.

    Garante `DATABASE_URL` apontando para o servidor de teste e trunca as
    tabelas do domínio antes e depois do teste. Devolve a URL do banco, para os
    testes que quiserem, mas o uso comum é apenas `def test_x(banco):` e depois
    chamar `db.salvar_mensagem(...)`, `db.consultar(...)`, etc.
    """
    os.environ["DATABASE_URL"] = servidor_pg
    _truncar_dominio()
    try:
        yield servidor_pg
    finally:
        _truncar_dominio()
