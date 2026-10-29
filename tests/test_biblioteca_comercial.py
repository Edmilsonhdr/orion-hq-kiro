"""Modelos da biblioteca comercial (spec comercial, Requirement 8.2) e o script que os importa."""

import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODELOS = sorted((RAIZ / "docs" / "comercial").glob("*.md"))


def test_modelos_existem_e_nao_inventam_numeros():
    assert len(MODELOS) == 4
    for arquivo in MODELOS:
        texto = arquivo.read_text(encoding="utf-8")
        assert texto.startswith("# "), arquivo.name
        assert "[preencher" in texto, arquivo.name
        assert "R$" not in texto, f"{arquivo.name} não pode trazer preços"


def test_script_simula_sem_gravar(banco):
    from _orion import db

    ambiente = {"DATABASE_URL": db.config.database_url(), "PATH": "/usr/bin:/bin"}
    saida = subprocess.run(
        [sys.executable, str(RAIZ / "scripts" / "seed_comercial_docs.py")],
        capture_output=True, text=True, env=ambiente, cwd=RAIZ, timeout=60,
    )
    assert saida.returncode == 0, saida.stderr
    assert "Entrariam (simulação): 5" in saida.stdout
    assert "Comercial / Modelo de proposta comercial" in saida.stdout
    assert "Recursos do Orion HQ / Módulo Comercial (recurso do Orion HQ)" in saida.stdout
    assert db.um("select count(*) as n from documentos")["n"] == 0
