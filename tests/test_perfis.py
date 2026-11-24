import pytest

from _orion import perfis


def test_nome_padrao_e_nome_salvo(banco, monkeypatch):
    monkeypatch.setenv("ORION_USERS", "dimi:a,jullyana:b")
    assert perfis.listar() == [{"usuario": "dimi", "nome": "Dimi"}, {"usuario": "jullyana", "nome": "Jullyana"}]
    assert perfis.definir_nome("dimi", "  Edmilson   Henrique ") == {"usuario": "dimi", "nome": "Edmilson Henrique"}
    perfis.definir_nome("dimi", "Edmilson Henrique Dias")
    assert perfis.listar()[0] == {"usuario": "dimi", "nome": "Edmilson Henrique Dias"}
    with pytest.raises(ValueError):
        perfis.definir_nome("dimi", "   ")
