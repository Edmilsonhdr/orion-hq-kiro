"""O .ics de uma reunião escapa vírgula, ponto e vírgula e barra, e dobra linhas longas."""

from datetime import datetime, timezone

import index


def test_ics_da_reuniao_escapa_e_dobra():
    r = {"id": 7, "titulo": "Demo, Clínica; Vida", "inicio": datetime(2026, 11, 3, 17, tzinfo=timezone.utc),
         "fim": datetime(2026, 11, 3, 18, tzinfo=timezone.utc), "pauta": ["Apresentar, mostrar", "x" * 120]}
    texto = index._montar_ics(r)
    assert "SUMMARY:Demo\\, Clínica\; Vida" in texto
    assert "Apresentar\\, mostrar\\n" in texto.replace("\r\n ", "")
    assert all(len(l.encode("utf-8")) <= 75 for l in texto.split("\r\n"))
    assert texto.endswith("END:VCALENDAR\r\n")
