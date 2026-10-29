"""Backup automático do banco do Orion HQ, com rotação.

    .venv/bin/python scripts/backup_db.py                 # grava em ./backups, guarda os 14 mais recentes
    .venv/bin/python scripts/backup_db.py --pasta /mnt/backup --manter 30

Usa `pg_dump` (formato custom, restaura com `pg_restore`) quando ele existe; sem ele, grava o backup em
JSON (o mesmo do botão "Baixar backup" do Início). Para rodar todo dia às 3h, no crontab (`crontab -e`):

    0 3 * * * cd /caminho/orion-hq-kiro && .venv/bin/python scripts/backup_db.py >> backups/backup.log 2>&1

Usa a `DATABASE_URL` do ambiente. Dica: guarde a pasta em outro disco ou sincronize-a com outra máquina.
"""

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api"))

from _orion import backup, config  # noqa: E402


def gravar(pasta: Path) -> Path:
    pasta.mkdir(parents=True, exist_ok=True)
    carimbo = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    url = config.database_url()
    if shutil.which("pg_dump"):
        destino = pasta / f"orion-hq_{carimbo}.dump"
        subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--file", str(destino), url], check=True)
    else:
        destino = pasta / f"orion-hq_{carimbo}.json"
        destino.write_text(backup.como_json(), encoding="utf-8")
    return destino


def rotacionar(pasta: Path, manter: int) -> list[Path]:
    arquivos = sorted([*pasta.glob("orion-hq_*.dump"), *pasta.glob("orion-hq_*.json")], key=lambda p: p.name)
    apagar = arquivos[: max(0, len(arquivos) - manter)]
    for a in apagar:
        a.unlink()
    return apagar


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pasta", type=Path, default=Path("backups"), help="onde guardar (padrão: ./backups)")
    p.add_argument("--manter", type=int, default=14, help="quantos backups manter (padrão: 14)")
    args = p.parse_args()
    if not config.database_url():
        print("DATABASE_URL não definida. Configure-a (veja .env.example) antes do backup.")
        return 1
    destino = gravar(args.pasta)
    apagados = rotacionar(args.pasta, max(1, args.manter))
    print(f"Backup gravado: {destino} ({destino.stat().st_size / 1024:.0f} KB). Antigos removidos: {len(apagados)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
