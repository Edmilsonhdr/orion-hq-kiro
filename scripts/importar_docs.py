"""Importa documentos em markdown (export do Notion, pasta de .md ou .zip) para o Docs.

Por padrão só SIMULA: mostra o que entraria. Para gravar de verdade, passe `--aplicar`.

    .venv/bin/python scripts/importar_docs.py caminho/para/export.zip
    .venv/bin/python scripts/importar_docs.py caminho/para/pasta --aplicar --autor dimi

Usa a `DATABASE_URL` do ambiente (como `scripts/setup_db.py`).
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api"))

from _orion import config, importacao  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("origem", type=Path, help="pasta ou .zip com arquivos .md")
    p.add_argument("--aplicar", action="store_true", help="grava no banco (sem isso, só simula)")
    p.add_argument("--autor", default="importação", help="autor dos documentos criados")
    p.add_argument("--tag", default="importado", help="tag aplicada a todos ('' para nenhuma)")
    args = p.parse_args()

    if not config.database_url():
        print("DATABASE_URL não definida. Configure-a (veja .env.example) antes de importar.")
        return 1

    relatorio = importacao.importar(args.origem, args.aplicar, args.autor, args.tag or None)

    verbo = "Importados" if args.aplicar else "Entrariam (simulação)"
    print(f"\n{verbo}: {len(relatorio['novos'])}")
    for d in relatorio["novos"]:
        print(f"  + {d['pasta'] + ' / ' if d['pasta'] else ''}{d['titulo']}")
    print(f"Já existiam (pulados): {len(relatorio['pulados'])}")
    print(f"Ignorados (não são markdown/texto ou estão vazios): {len(relatorio['ignorados'])}")
    for e in relatorio["erros"]:
        print(f"  ! {e['arquivo']}: {e['motivo']}")
    if not args.aplicar:
        print("\nNada foi gravado. Rode de novo com --aplicar para importar.")
    return 0 if not relatorio["erros"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
