"""Prepara o Postgres (Neon) do Orion HQ.

Aplica `db/schema.sql` e roda `PostgresSaver.setup()` no mesmo banco. É
idempotente: pode ser executado quantas vezes for preciso.

Uso:
    python scripts/setup_db.py

Requer a variável de ambiente `DATABASE_URL` (Neon). Ver `.env.example`.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_API = str(Path(__file__).resolve().parent.parent / "api")
if _API not in sys.path:
    sys.path.insert(0, _API)


def _url() -> str:
    """Lê a URL do banco de dentro da função (não no import)."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print(
            "DATABASE_URL não definida. Configure a URL do Neon "
            "(veja .env.example) antes de rodar o setup.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return url


def _caminho_schema() -> Path:
    """Caminho de `db/schema.sql` relativo à raiz do projeto."""
    return Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def aplicar_schema(url: str) -> None:
    """Aplica `db/schema.sql`. Idempotente (create ... if not exists)."""
    from _orion import db

    sql = _caminho_schema().read_text(encoding="utf-8")
    with db.conexao(url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    print("schema.sql aplicado.")


def preparar_checkpointer(url: str) -> None:
    """Cria/atualiza as tabelas do PostgresSaver. Idempotente."""
    from _orion import db

    with db.checkpointer(url) as cp:
        cp.setup()
    print("PostgresSaver.setup() concluído.")


def main() -> None:
    url = _url()
    aplicar_schema(url)
    preparar_checkpointer(url)
    print("Banco pronto.")


if __name__ == "__main__":
    main()
