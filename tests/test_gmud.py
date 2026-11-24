import pytest

from _orion import gmud


@pytest.fixture
def pessoas(monkeypatch):
    monkeypatch.setenv("ORION_USERS", "dimi:a,jullyana:b,rayssa:c")


def _completa(**extra):
    return {
        "titulo": "Atualizar o Postgres", "sistemas": ["Banco", "API"], "inicio": "2026-12-01T22:00:00-03:00",
        "fim": "2026-12-01T23:00:00-03:00", "plano_implantacao": "pg_upgrade", "plano_rollback": "restaurar backup",
        "aprovadores": ["jullyana", "rayssa"], **extra,
    }


def test_ciclo_completo_com_aprovacao_e_sucesso(banco, pessoas):
    g = gmud.criar(_completa(), "dimi")
    assert g["chave"] == f"GMUD-{g['id']}" and g["status"] == "rascunho" and g["risco"] == "medio"
    assert gmud.enviar(g["id"], "dimi")["status"] == "em_aprovacao"
    with pytest.raises(PermissionError):
        gmud.decidir(g["id"], "dimi", "aprovada")
    assert gmud.decidir(g["id"], "jullyana", "aprovada")["status"] == "em_aprovacao"
    assert gmud.decidir(g["id"], "rayssa", "aprovada")["status"] == "aprovada"
    with pytest.raises(ValueError):
        gmud.editar(g["id"], {"titulo": "outro"}, "dimi")
    assert gmud.iniciar(g["id"], "dimi")["status"] == "em_execucao"
    fim = gmud.encerrar(g["id"], "dimi", "sucesso")
    assert fim["status"] == "concluida" and fim["resultado"] == "sucesso"
    assert [e["texto"] for e in gmud.detalhe(g["id"])["eventos"] if e["tipo"] == "status"][-1] == "concluiu (com sucesso)"


def test_enviar_confere_obrigatorios_e_reprovar_pede_motivo(banco, pessoas):
    g = gmud.criar({"titulo": "Trocar DNS"}, "dimi")
    with pytest.raises(ValueError, match="plano de volta"):
        gmud.enviar(g["id"], "dimi")
    gmud.editar(g["id"], _completa(), "dimi")
    gmud.enviar(g["id"], "dimi")
    with pytest.raises(ValueError):
        gmud.decidir(g["id"], "jullyana", "reprovada")
    assert gmud.decidir(g["id"], "jullyana", "reprovada", "sem janela de manutenção")["status"] == "reprovada"
    assert gmud.enviar(g["id"], "dimi")["status"] == "em_aprovacao"  # reenviada


def test_padrao_aprova_direto_emergencial_executa_antes_e_rollback(banco, pessoas):
    p = gmud.criar(_completa(tipo="padrao", aprovadores=[]), "dimi")
    assert gmud.enviar(p["id"], "dimi")["status"] == "aprovada"
    e = gmud.criar({"titulo": "Corrigir queda", "tipo": "emergencial"}, "dimi")
    assert gmud.iniciar(e["id"], "dimi")["status"] == "em_execucao"
    with pytest.raises(ValueError):
        gmud.encerrar(e["id"], "dimi", "revertida")
    assert gmud.encerrar(e["id"], "dimi", "revertida", "voltou o erro")["status"] == "revertida"
    with pytest.raises(ValueError):
        gmud.cancelar(e["id"], "dimi")


def test_conflito_de_janela_e_risco(banco, pessoas):
    a = gmud.criar(_completa(), "dimi")
    gmud.enviar(a["id"], "dimi")
    b = gmud.criar(_completa(titulo="Deploy da API", sistemas=["api"], inicio="2026-12-01T22:30:00-03:00", fim="2026-12-02T00:00:00-03:00"), "dimi")
    assert [c["id"] for c in gmud.detalhe(b["id"])["conflitos"]] == []  # "api" ≠ "API"
    gmud.editar(b["id"], {"sistemas": ["API"]}, "dimi")
    assert [c["id"] for c in gmud.detalhe(b["id"])["conflitos"]] == [a["id"]]
    assert gmud.risco("alto", "alta") == "alto" and gmud.risco("baixo", "baixa") == "baixo"
    with pytest.raises(ValueError):
        gmud.criar(_completa(inicio="2026-12-02T00:00:00Z", fim="2026-12-01T00:00:00Z"), "dimi")
