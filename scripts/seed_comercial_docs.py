"""Importa para o Docs os modelos comerciais (`docs/comercial/*.md`, pasta "Comercial") e o guia do módulo
(`docs/recursos/*.md`, pasta "Recursos do Orion HQ"), a documentação técnica do produto Orion
(`docs/orion/*.md`, pasta "Orion (produto)") e o guia de uso do Orion (`docs/orion-guia/*.md`, pasta "Orion (guia de uso)").

Por padrão só SIMULA. Para gravar de verdade, passe `--aplicar`. Documentos que já existem (mesmo título
e pasta) são pulados, então rodar de novo não duplica nem sobrescreve edições dos sócios.

    .venv/bin/python scripts/seed_comercial_docs.py
    .venv/bin/python scripts/seed_comercial_docs.py --aplicar --autor jullyana
    .venv/bin/python scripts/seed_comercial_docs.py --atualizar            # simula
    .venv/bin/python scripts/seed_comercial_docs.py --atualizar --aplicar --autor jullyana

`--atualizar` troca o texto dos documentos do produto que JÁ existem ("Orion (produto)" e "Orion (guia de
uso)") pelo dos arquivos de `docs/`; o texto anterior fica no histórico de versões do documento. Os modelos
comerciais e o guia do módulo nunca são alterados.

Usa a `DATABASE_URL` do ambiente (como `scripts/setup_db.py`).
"""

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, str(RAIZ / "api"))

from _orion import config, importacao  # noqa: E402

PASTAS = (
    ("comercial", "Comercial"),
    ("recursos", "Recursos do Orion HQ"),
    ("orion", "Orion (produto)"),
    ("orion-guia", "Orion (guia de uso)"),
)

# Pastas mantidas em arquivo, que `--atualizar` pode renovar (as demais são editadas pelos sócios).
PASTAS_DO_PRODUTO = ("Orion (produto)", "Orion (guia de uso)")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="grava no banco (sem isso, só simula)")
    p.add_argument("--autor", default="modelo", help="autor dos documentos criados")
    p.add_argument("--atualizar", action="store_true", help="atualiza o texto dos documentos do produto que já existem")
    args = p.parse_args()

    if not config.database_url():
        print("DATABASE_URL não definida. Configure-a (veja .env.example) antes de importar.")
        return 1

    # O importador usa as subpastas como pasta do documento: monta `<tmp>/<Pasta>/*.md`.
    with tempfile.TemporaryDirectory() as tmp:
        for origem, pasta in PASTAS:
            destino = Path(tmp) / pasta
            destino.mkdir()
            for arquivo in sorted((RAIZ / "docs" / origem).glob("*.md")):
                shutil.copy(arquivo, destino / arquivo.name)
        if args.atualizar:
            rel = importacao.atualizar(Path(tmp), args.aplicar, args.autor, PASTAS_DO_PRODUTO)
            verbo = "Atualizados" if args.aplicar else "Seriam atualizados (simulação)"
            print(f"\n{verbo}: {len(rel['atualizados'])}")
            for d in rel["atualizados"]:
                print(f"  ~ {d['pasta']} / {d['titulo']}")
            print(f"Já estavam iguais: {len(rel['iguais'])}")
            print(f"Ainda não importados (rode sem --atualizar): {len(rel['ausentes'])}")
            for e in rel["erros"]:
                print(f"  ! {e['arquivo']}: {e['motivo']}")
            if not args.aplicar:
                print("\nNada foi gravado. Rode de novo com --aplicar para atualizar.")
            return 0 if not rel["erros"] else 2
        relatorio = importacao.importar(Path(tmp), args.aplicar, args.autor, "modelo")

    verbo = "Importados" if args.aplicar else "Entrariam (simulação)"
    print(f"\n{verbo}: {len(relatorio['novos'])}")
    for d in relatorio["novos"]:
        print(f"  + {d['pasta'] + ' / ' if d['pasta'] else ''}{d['titulo']}")
    print(f"Já existiam (pulados): {len(relatorio['pulados'])}")
    for e in relatorio["erros"]:
        print(f"  ! {e['arquivo']}: {e['motivo']}")
    if not args.aplicar:
        print("\nNada foi gravado. Rode de novo com --aplicar para importar.")
    return 0 if not relatorio["erros"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
