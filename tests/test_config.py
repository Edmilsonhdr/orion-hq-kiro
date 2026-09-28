"""Testes de `_orion/config.py` — sem rede, sem Anthropic."""

from datetime import datetime

from _orion import config


def test_agentes_batem_com_o_front():
    # Ids devem ser idênticos aos usados no TS (lib/agents.ts).
    assert config.AGENTES == ("orq", "tech", "agenda", "negocios", "work")


def test_usuarios_faz_parse_do_env(monkeypatch):
    monkeypatch.setenv("ORION_USERS", "dimi:s3nha,jullyana:outra")
    assert config.usuarios() == {"dimi": "s3nha", "jullyana": "outra"}


def test_usuarios_ignora_entradas_malformadas(monkeypatch):
    # Espaços em volta, entrada vazia e entrada sem ":" são ignoradas.
    monkeypatch.setenv("ORION_USERS", " dimi:abc , lixo , ,jullyana:xyz")
    assert config.usuarios() == {"dimi": "abc", "jullyana": "xyz"}


def test_usuarios_vazio_quando_nao_definido(monkeypatch):
    monkeypatch.delenv("ORION_USERS", raising=False)
    assert config.usuarios() == {}


def test_senha_pode_conter_dois_pontos(monkeypatch):
    # split(":", 1) garante que ":" na senha não quebre o parse.
    monkeypatch.setenv("ORION_USERS", "dimi:a:b:c")
    assert config.usuarios() == {"dimi": "a:b:c"}


def test_aprovadores_faz_parse_do_env(monkeypatch):
    monkeypatch.setenv("ORION_APPROVERS", "dimi, jullyana")
    assert config.aprovadores() == {"dimi", "jullyana"}


def test_aprovadores_vazio_quando_nao_definido(monkeypatch):
    monkeypatch.delenv("ORION_APPROVERS", raising=False)
    assert config.aprovadores() == set()


def test_config_nao_lanca_sem_env(monkeypatch):
    # Nenhuma leitura de env deve lançar no import ou ao ser chamada sem valor.
    for var in ("DATABASE_URL", "ANTHROPIC_API_KEY", "ORION_SESSION_SECRET"):
        monkeypatch.delenv(var, raising=False)
    assert config.database_url() == ""
    assert config.anthropic_api_key() == ""
    assert config.session_secret() == ""


def test_modelos_tem_padrao(monkeypatch):
    monkeypatch.delenv("ORION_MODEL", raising=False)
    monkeypatch.delenv("ORION_WORKER_MODEL", raising=False)
    assert config.orion_model() == "claude-sonnet-5"
    assert config.worker_model() == "claude-haiku-4-5"


def test_agora_tem_fuso_de_sao_paulo():
    momento = config.agora()
    assert momento.tzinfo is not None
    assert momento.tzinfo is config.TZ


def test_agora_formatado_em_pt_br(monkeypatch):
    # Data fixa: 25/09/2026 é uma sexta-feira.
    fixo = datetime(2026, 9, 25, 14, 2, tzinfo=config.TZ)
    monkeypatch.setattr(config, "agora", lambda: fixo)

    texto = config.agora_formatado()

    assert texto == "sexta-feira, 25 de setembro de 2026, 14:02"
    # Garantias explícitas do PT-BR: dia da semana e mês por extenso.
    assert "sexta-feira" in texto
    assert "setembro" in texto
    # Não pode vazar inglês do strftime.
    assert "Friday" not in texto
    assert "September" not in texto


def test_agora_formatado_cobre_todos_os_dias(monkeypatch):
    # 2026-09-21 é segunda; sete dias consecutivos batem com os nomes PT-BR.
    esperados = [
        "segunda-feira",
        "terça-feira",
        "quarta-feira",
        "quinta-feira",
        "sexta-feira",
        "sábado",
        "domingo",
    ]
    for i, nome in enumerate(esperados):
        fixo = datetime(2026, 9, 21 + i, 9, 0, tzinfo=config.TZ)
        monkeypatch.setattr(config, "agora", lambda f=fixo: f)
        assert config.agora_formatado().startswith(nome + ",")
