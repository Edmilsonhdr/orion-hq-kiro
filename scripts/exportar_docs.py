"""Exporta todos os documentos do Docs para arquivos markdown (backup / saída sem dependência).

    .venv/bin/python scripts/exportar_docs.py backup-docs.zip
    .venv/bin/python scripts/exportar_docs.py pasta-de-saida --arquivados

Um `.md` por documento, em subpastas conforme a pasta, com frontmatter. Reimportável com
`scripts/importar_docs.py`. Usa a `DATABASE_URL` do ambiente.
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api"))

from _orion import config, exportacao  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("destino", type=Path, help="pasta de saída ou arquivo .zip")
    p.add_argument("--arquivados", action="store_true", help="inclui os documentos arquivados")
    args = p.parse_args()

    if not config.database_url():
        print("DATABASE_URL não definida. Configure-a (veja .env.example) antes de exportar.")
        return 1

    total = exportacao.exportar(args.destino, args.arquivados)
    print(f"{total} documento(s) exportado(s) para {args.destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
