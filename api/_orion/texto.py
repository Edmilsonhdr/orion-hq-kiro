"""Texto sem acento e radicais grosseiros, compartilhados pela busca de Docs e do Comercial."""

from __future__ import annotations

import re
import unicodedata

_PALAVRA = re.compile(r"[a-z0-9]+")
_SUFIXOS = ("oes", "aes", "ao", "s")


def sem_acento(texto: str) -> str:
    """Minúsculas e sem acentos, preservando o tamanho (índices alinham com o original)."""
    saida = []
    for letra in texto:
        base = "".join(
            c for c in unicodedata.normalize("NFD", letra) if not unicodedata.combining(c)
        )
        saida.append((base[:1] or letra).lower())
    return "".join(saida)


def radical(palavra: str) -> str:
    """Radical grosseiro: tira plural e terminação -ão/-ões ("decisões" e "decisão" → "decis")."""
    for sufixo in _SUFIXOS:
        if palavra.endswith(sufixo) and len(palavra) - len(sufixo) >= 3:
            return palavra[: -len(sufixo)]
    return palavra


def radicais(texto: str) -> list[str]:
    return [radical(p) for p in _PALAVRA.findall(sem_acento(texto))]


def casa(radical_consulta: str, radicais_doc: set[str]) -> bool:
    if radical_consulta in radicais_doc:
        return True
    return len(radical_consulta) >= 5 and any(r.startswith(radical_consulta) for r in radicais_doc)
