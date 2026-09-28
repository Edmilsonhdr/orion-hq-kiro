"""Testes de `_orion/ferramentas.py` (task 5.1).

Exercitam as ferramentas do changelog contra o Postgres efêmero da fixture
`banco` (conftest.py): full-text em português com fallback ILIKE, janela de
mudanças recentes e registro de decisão. Também verificam a regra de produto
"Nada inventado": cada item citado inclui fonte/referência e data.

As tools expostas (`buscar_changelog`, etc.) são objetos `@tool` do LangChain;
os testes chamam a lógica pura em `_buscar_changelog`/`_mudancas_recentes`/
`_registrar_decisao`, que é o que aquelas tools invocam.
"""

import re

from _orion import db, ferramentas


def _inserir_changelog(
    *,
    fonte: str,
    titulo: str,
    resumo: str,
    referencia: str | None = None,
    url: str | None = None,
    autor: str | None = None,
) -> dict:
    """Insere uma linha no changelog e devolve id/criado_em."""
    linha = db.um(
        """
        insert into changelog (fonte, referencia, titulo, resumo, url, autor)
        values (%s, %s, %s, %s, %s, %s)
        returning id, criado_em
        """,
        (fonte, referencia, titulo, resumo, url, autor),
    )
    assert linha is not None
    return linha


# Regex de data no formato PT-BR usado por `_formatar_item` (dd/mm/aaaa).
_DATA_PTBR = re.compile(r"\b\d{2}/\d{2}/\d{4}\b")


# --- buscar_changelog: full-text em português ---


def test_buscar_changelog_encontra_por_full_text(banco):
    """Full-text acha por radical/stemming em português.

    Buscar "onboarding" deve casar com o título mesmo com outras palavras no
    meio; o resultado cita a referência (PR) e a data.
    """
    _inserir_changelog(
        fonte="github",
        referencia="PR #12",
        titulo="Melhorias no fluxo de onboarding",
        resumo="Ajustes na tela inicial do app.",
        url="https://github.com/orion/pull/12",
    )

    saida = ferramentas._buscar_changelog("onboarding")

    assert "onboarding" in saida.lower()
    assert "PR #12" in saida  # fonte/referência citada
    assert _DATA_PTBR.search(saida) is not None  # data citada
    assert "https://github.com/orion/pull/12" in saida


def test_buscar_changelog_full_text_stemming_portugues(banco):
    """A config `portuguese` casa variações (assinatura x assinaturas)."""
    _inserir_changelog(
        fonte="nota",
        titulo="Novas assinaturas premium",
        resumo="Plano anual liberado para os sócios.",
    )

    # Busca no singular; o stemming português deve casar com "assinaturas".
    saida = ferramentas._buscar_changelog("assinatura")

    assert "assinaturas premium".lower() in saida.lower()
    assert "nota" in saida  # sem referência, cita a fonte
    assert _DATA_PTBR.search(saida) is not None


# --- buscar_changelog: fallback ILIKE ---


def test_buscar_changelog_cai_no_fallback_ilike(banco):
    """Quando o full-text não acha, o ILIKE por substring salva.

    O full-text tokeniza palavras inteiras: buscar um pedaço de uma palavra
    (ex.: "gatew" dentro de "gateway") não casa no `plainto_tsquery`, mas o
    ILIKE `%gatew%` casa por substring do título.
    """
    _inserir_changelog(
        fonte="github",
        referencia="PR #30",
        titulo="Refatoração do gateway de pagamentos",
        resumo="Isola a integração com o provedor.",
    )

    # Confirma que o full-text sozinho não encontra o pedaço de palavra (senão
    # o teste do fallback seria inconclusivo).
    assert ferramentas._buscar_full_text("gatew") == []

    saida = ferramentas._buscar_changelog("gatew")
    assert "gateway" in saida.lower()
    assert "PR #30" in saida
    assert _DATA_PTBR.search(saida) is not None


def test_buscar_changelog_nada_encontrado(banco):
    """Sem resultado em full-text nem ILIKE: diz explicitamente (Req 4.3)."""
    _inserir_changelog(
        fonte="nota",
        titulo="Reunião de kickoff",
        resumo="Alinhamento inicial do time.",
    )

    saida = ferramentas._buscar_changelog("kubernetes")

    assert "nada encontrado" in saida.lower()
    assert "kubernetes" in saida.lower()


def test_buscar_changelog_consulta_vazia(banco):
    """Consulta em branco não bate no banco e pede um termo."""
    saida = ferramentas._buscar_changelog("   ")
    assert "vazia" in saida.lower()


# --- mudancas_recentes: janela de dias ---


def test_mudancas_recentes_filtra_pela_janela(banco):
    """Só itens dentro da janela de N dias aparecem."""
    # Item recente (agora).
    _inserir_changelog(
        fonte="github",
        referencia="PR #40",
        titulo="Cache de sessão",
        resumo="Reduz chamadas ao banco.",
    )
    # Item antigo: força criado_em para 30 dias atrás.
    antigo = _inserir_changelog(
        fonte="github",
        referencia="PR #1",
        titulo="Bootstrap do projeto",
        resumo="Estrutura inicial.",
    )
    db.executar(
        "update changelog set criado_em = now() - interval '30 days' where id = %s",
        (antigo["id"],),
    )

    saida = ferramentas._mudancas_recentes(7)

    assert "PR #40" in saida  # dentro da janela
    assert "PR #1" not in saida  # fora da janela de 7 dias
    assert _DATA_PTBR.search(saida) is not None


def test_mudancas_recentes_sem_mudancas(banco):
    """Sem itens no período, mensagem explícita citando os dias."""
    antigo = _inserir_changelog(
        fonte="nota",
        titulo="Nota antiga",
        resumo="Algo de muito tempo atrás.",
    )
    db.executar(
        "update changelog set criado_em = now() - interval '90 days' where id = %s",
        (antigo["id"],),
    )

    saida = ferramentas._mudancas_recentes(7)

    assert "nenhuma mudança" in saida.lower()
    assert "7 dias" in saida


def test_mudancas_recentes_dias_invalido_usa_padrao(banco):
    """Valor inválido de dias cai no padrão de 7 dias, sem quebrar."""
    saida = ferramentas._mudancas_recentes("abc")  # type: ignore[arg-type]
    assert "7 dias" in saida


# --- registrar_decisao ---


def test_registrar_decisao_insere_e_confirma_com_data(banco):
    """Insere no changelog com fonte `decisao` e confirma citando a data."""
    saida = ferramentas._registrar_decisao(
        "Preço do plano anual", "Definido em R$ 199/ano após análise de custos."
    )

    # Confirmação cita a fonte `decisao`, a data e o título.
    assert "decisao" in saida.lower()
    assert _DATA_PTBR.search(saida) is not None
    assert "Preço do plano anual" in saida

    # A linha realmente foi gravada com fonte `decisao` e sem referência.
    linha = db.um(
        "select fonte, referencia, titulo, resumo from changelog where titulo = %s",
        ("Preço do plano anual",),
    )
    assert linha is not None
    assert linha["fonte"] == "decisao"
    assert linha["referencia"] is None
    assert linha["resumo"] == "Definido em R$ 199/ano após análise de custos."


def test_registrar_decisao_fica_buscavel(banco):
    """Uma decisão registrada aparece depois em buscar_changelog."""
    ferramentas._registrar_decisao(
        "Adotar polling incremental", "Sem WebSocket na Vercel; polling a cada 1,5s."
    )

    saida = ferramentas._buscar_changelog("polling")
    assert "polling incremental".lower() in saida.lower()
    assert "decisao" in saida  # cita a fonte
    assert _DATA_PTBR.search(saida) is not None


def test_registrar_decisao_sem_titulo_nao_grava(banco):
    """Sem título, não grava e devolve aviso."""
    saida = ferramentas._registrar_decisao("   ", "descrição qualquer")

    assert "título" in saida.lower()
    n = db.um("select count(*) as n from changelog")["n"]
    assert n == 0
