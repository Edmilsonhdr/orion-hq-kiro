"""Testes de `_orion/config.py` — sem rede, sem Anthropic."""

from datetime import datetime, timedelta, timezone

import pytest

from _orion import config


@pytest.mark.parametrize("texto", ["2026-09-29T18:00:00Z", "2026-09-29T18:00:00z"])
def test_ler_iso_aceita_sufixo_z(texto):
    assert config.ler_iso(texto) == datetime(2026, 9, 29, 18, 0, tzinfo=timezone.utc)


def test_ler_iso_mantem_offset_explicito():
    lido = config.ler_iso("2026-09-29T15:00:00-03:00")
    assert lido.utcoffset() == timedelta(hours=-3)


def test_github_token_por_dono_com_padrao(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "token-padrao")
    monkeypatch.setenv("GITHUB_TOKEN_MINHA_ORG", "token-org")
    assert config.github_token("minha-org") == "token-org"
    assert config.github_token("Minha-Org") == "token-org"
    assert config.github_token("dimi") == "token-padrao"
    assert config.github_token() == "token-padrao"


def test_ler_iso_invalido_lanca_value_error():
    with pytest.raises(ValueError):
        config.ler_iso("amanhã às 3")


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


def test_sentry_segredos_vazios_quando_nao_definidos(monkeypatch):
    for var in ("SENTRY_CLIENT_SECRET", "SENTRY_AUTH_TOKEN", "SENTRY_ORG"):
        monkeypatch.delenv(var, raising=False)
    assert config.sentry_client_secret() == ""
    assert config.sentry_auth_token() == ""
    assert config.sentry_org() == ""


def test_sentry_projetos_faz_parse_do_env(monkeypatch):
    monkeypatch.setenv("ORION_SENTRY_PROJETOS", "orion-app:app, orion-api:backend")
    assert config.sentry_projetos() == {"orion-app": "app", "orion-api": "backend"}


def test_sentry_projetos_ignora_entradas_malformadas(monkeypatch):
    monkeypatch.setenv("ORION_SENTRY_PROJETOS", " orion-app:app , lixo , ,x: ")
    assert config.sentry_projetos() == {"orion-app": "app"}


def test_sentry_projetos_vazio_quando_nao_definido(monkeypatch):
    monkeypatch.delenv("ORION_SENTRY_PROJETOS", raising=False)
    assert config.sentry_projetos() == {}


def test_github_repo_vazio_quando_nao_definido(monkeypatch):
    monkeypatch.delenv("ORION_GITHUB_REPO", raising=False)
    assert config.github_repo() == ""
    monkeypatch.setenv("ORION_GITHUB_REPO", "owner/orion")
    assert config.github_repo() == "owner/orion"


def test_areas_proibidas_usa_padrao_quando_vazio(monkeypatch):
    monkeypatch.delenv("ORION_AREAS_PROIBIDAS", raising=False)
    assert config.areas_proibidas() == config._AREAS_PROIBIDAS_PADRAO
    # String só com espaços/vírgulas também cai no padrão.
    monkeypatch.setenv("ORION_AREAS_PROIBIDAS", "  , ,  ")
    assert config.areas_proibidas() == config._AREAS_PROIBIDAS_PADRAO


def test_areas_proibidas_faz_parse_do_env(monkeypatch):
    monkeypatch.setenv("ORION_AREAS_PROIBIDAS", "**/prisma/**, **/*auth*.* ")
    assert config.areas_proibidas() == ("**/prisma/**", "**/*auth*.*")


def test_max_diagnosticos_hora_padrao_e_parse(monkeypatch):
    monkeypatch.delenv("ORION_MAX_DIAGNOSTICOS_HORA", raising=False)
    assert config.max_diagnosticos_hora() == 5
    monkeypatch.setenv("ORION_MAX_DIAGNOSTICOS_HORA", "12")
    assert config.max_diagnosticos_hora() == 12


@pytest.mark.parametrize("valor", ["abc", "0", "-3", ""])
def test_max_diagnosticos_hora_invalido_cai_no_padrao(monkeypatch, valor):
    monkeypatch.setenv("ORION_MAX_DIAGNOSTICOS_HORA", valor)
    assert config.max_diagnosticos_hora() == 5


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
