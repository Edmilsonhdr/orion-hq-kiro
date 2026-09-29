"""Testes de `_orion/vigia.py` (task 4.1).

Cobrem as ferramentas SOMENTE leitura do Rui (Requirement 3.2) e o
`pedir_ao_tobias` com atividades `delegou` de ida e volta (Requirements 3.3,
7.3), sem tocar na Anthropic, no GitHub nem no Sentry:

- `llm.principal` é substituído por um `ModeloFake` (no estilo de
  `tests/test_especialistas.py`) que devolve `AIMessage`s em sequência;
- `github_leitura.commits_recentes`/`ler_arquivo_repo` são monkeypatch para
  não chamar o GitHub;
- as atividades e os incidentes são gravados de verdade no Postgres efêmero da
  fixture `banco` (conftest.py), então inspecionamos o log e o banco.
"""

from typing import Any

import pytest
from langchain_core.messages import AIMessage

from _orion import atividades, db, especialistas, github_leitura, llm, vigia


# --- Fakes de modelo (estilo test_especialistas.py) ---


class ModeloFake:
    """Fake de `ChatAnthropic`: devolve os `AIMessage` de `respostas` em ordem.

    `bind_tools` registra as ferramentas ligadas e retorna a si mesmo; `invoke`
    devolve o próximo `AIMessage` da fila (ou "fim" sem tool_calls no fim).
    """

    def __init__(self, respostas: list[AIMessage]) -> None:
        self._respostas = list(respostas)
        self.chamadas = 0
        self.ferramentas: Any = None

    def bind_tools(self, ferramentas: Any) -> "ModeloFake":
        self.ferramentas = ferramentas
        return self

    def invoke(self, msgs: list[Any]) -> AIMessage:
        self.chamadas += 1
        if self._respostas:
            return self._respostas.pop(0)
        return AIMessage(content="fim")


def _ai_com_ferramenta(nome: str, args: dict, *, id_chamada: str = "call-1") -> AIMessage:
    """AIMessage que pede uma ferramenta (uma tool call)."""
    return AIMessage(
        content="",
        tool_calls=[{"name": nome, "args": args, "id": id_chamada, "type": "tool_call"}],
    )


def _ai_final(texto: str) -> AIMessage:
    """AIMessage de resposta final (sem tool_calls)."""
    return AIMessage(content=texto)


def _instalar_modelo(monkeypatch: pytest.MonkeyPatch, fake: Any) -> None:
    """Substitui `llm.principal` pelo fake (nenhuma chamada à Anthropic)."""
    monkeypatch.setattr(llm, "principal", lambda: fake)


# --- Helper: inserir um incidente de teste no banco ---


def _inserir_incidente(**campos: Any) -> int:
    """Insere um incidente mínimo e devolve o id.

    Aceita sobrescritas via `campos` (ex.: stack=..., diagnostico=...).
    """
    from psycopg.types.json import Json

    dados = {
        "sentry_issue_id": "issue-1",
        "projeto": "app",
        "titulo": "TypeError: heck is not defined",
        "nivel": "error",
        "culpado": "src/telas/Home.tsx",
        "release": "1.2.3",
        "ambiente": "production",
        "url": "https://sentry.io/orion/issues/1",
        "stack": [
            {"arquivo": "src/telas/Home.tsx", "funcao": "render", "linha": 42, "modulo": None}
        ],
        "ocorrencias": 7,
        "usuarios_afetados": 3,
    }
    dados.update(campos)

    linha = db.um(
        """
        insert into incidentes (
            sentry_issue_id, projeto, titulo, nivel, culpado, release, ambiente,
            url, stack, ocorrencias, usuarios_afetados
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            dados["sentry_issue_id"],
            dados["projeto"],
            dados["titulo"],
            dados["nivel"],
            dados["culpado"],
            dados["release"],
            dados["ambiente"],
            dados["url"],
            Json(dados["stack"]),
            dados["ocorrencias"],
            dados["usuarios_afetados"],
        ),
    )
    assert linha is not None
    return linha["id"]


# --- Ferramentas de leitura do Rui (Requirement 3.2) ---


def test_detalhe_incidente_devolve_dados_do_banco(banco):
    """`detalhe_incidente` traz os dados reais do incidente, sem inventar."""
    incidente_id = _inserir_incidente()

    ferramentas = vigia.ferramentas_do_rui(incidente_id, "run-det")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["detalhe_incidente"].invoke({})

    assert "TypeError: heck is not defined" in saida
    assert "app" in saida
    assert "src/telas/Home.tsx" in saida
    assert "1.2.3" in saida  # release
    assert "42" in saida  # linha do stack
    assert "7" in saida  # ocorrências
    assert "3" in saida  # usuários afetados


def test_detalhe_incidente_inexistente(banco):
    """Incidente inexistente devolve texto claro (não inventa)."""
    ferramentas = vigia.ferramentas_do_rui(999, "run-inex")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["detalhe_incidente"].invoke({})
    assert "não encontrado" in saida


def test_incidentes_abertos_lista_do_banco(banco):
    """`incidentes_abertos` lista os incidentes reais com status aberto."""
    _inserir_incidente(sentry_issue_id="a", titulo="Erro A")
    _inserir_incidente(sentry_issue_id="b", titulo="Erro B")

    ferramentas = vigia.ferramentas_do_rui(1, "run-abertos")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["incidentes_abertos"].invoke({})

    assert "Erro A" in saida
    assert "Erro B" in saida


def test_incidentes_abertos_sem_nenhum(banco):
    """Sem incidentes, a ferramenta diz isso claramente (Requirement 5.3)."""
    ferramentas = vigia.ferramentas_do_rui(1, "run-vazio")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["incidentes_abertos"].invoke({})
    assert "Nenhum incidente" in saida


def test_commits_recentes_formata_lista(banco, monkeypatch):
    """`commits_recentes` embrulha o resultado do github_leitura em texto."""
    monkeypatch.setattr(
        github_leitura,
        "commits_recentes",
        lambda dias: [
            {"sha": "abc1234", "mensagem": "corrige Home", "autor": "Dimi", "data": "2026-01-01"}
        ],
    )
    ferramentas = vigia.ferramentas_do_rui(1, "run-commits")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["commits_recentes"].invoke({"dias": 7})

    assert "abc1234" in saida
    assert "corrige Home" in saida
    assert "Dimi" in saida


def test_commits_recentes_vazio(banco, monkeypatch):
    """Sem commits, diz que não encontrou (não inventa)."""
    monkeypatch.setattr(github_leitura, "commits_recentes", lambda dias: [])
    ferramentas = vigia.ferramentas_do_rui(1, "run-sem-commits")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["commits_recentes"].invoke({"dias": 7})
    assert "Nenhum commit" in saida


def test_conjunto_de_ferramentas_do_rui(banco):
    """O Rui recebe exatamente as ferramentas somente leitura previstas."""
    ferramentas = vigia.ferramentas_do_rui(1, "run-conjunto")
    nomes = {f.name for f in ferramentas}
    assert nomes == {
        "detalhe_incidente",
        "incidentes_abertos",
        "buscar_changelog",
        "mudancas_recentes",
        "commits_recentes",
        "pedir_ao_tobias",
    }


# --- pedir_ao_tobias: delegações de ida e volta (Requirements 3.3, 7.3) ---


def test_pedir_ao_tobias_emite_delegou_ida_e_volta(banco, monkeypatch):
    """`pedir_ao_tobias` emite `delegou` vigia→tech e tech→vigia com os dados."""
    fake = ModeloFake([_ai_final("Li o arquivo Home.tsx; a variável 'heck' não existe.")])
    _instalar_modelo(monkeypatch, fake)

    resposta = vigia._pedir_ao_tobias("Leia src/telas/Home.tsx", "run-tobias")

    assert "heck" in resposta

    log = atividades.listar()
    delegacoes = [
        a for a in log if a["run_id"] == "run-tobias" and a["tipo"] == "delegou"
    ]
    assert len(delegacoes) == 2

    ida = [d for d in delegacoes if d["dados"] == {"de": "vigia", "para": "tech"}]
    volta = [d for d in delegacoes if d["dados"] == {"de": "tech", "para": "vigia"}]
    assert len(ida) == 1
    assert ida[0]["agente"] == "vigia"
    assert len(volta) == 1
    assert volta[0]["agente"] == "tech"


def test_pedir_ao_tobias_liga_ler_arquivo_repo(banco, monkeypatch):
    """O Tobias recebe `ler_arquivo_repo` (além de buscar_changelog/commits)."""
    fake = ModeloFake([_ai_final("ok")])
    _instalar_modelo(monkeypatch, fake)

    vigia._pedir_ao_tobias("dá uma olhada", "run-bind")

    nomes = {getattr(f, "name", None) for f in fake.ferramentas}
    assert "ler_arquivo_repo" in nomes
    assert "buscar_changelog" in nomes
    assert "commits_recentes" in nomes


def test_pedir_ao_tobias_pela_ferramenta_do_rui(banco, monkeypatch):
    """A tool `pedir_ao_tobias` da factory chama o Tobias e delega de fato."""
    fake = ModeloFake([_ai_final("Resposta do Tobias")])
    _instalar_modelo(monkeypatch, fake)
    # Evita qualquer chamada real ao GitHub caso o Tobias use ferramentas.
    monkeypatch.setattr(github_leitura, "ler_arquivo_repo", lambda c, r=None: "conteudo")
    monkeypatch.setattr(github_leitura, "commits_recentes", lambda dias: [])

    ferramentas = vigia.ferramentas_do_rui(1, "run-tool-tobias")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["pedir_ao_tobias"].invoke({"pergunta": "leia o arquivo X"})

    assert "Resposta do Tobias" in saida
    delegacoes = [
        a for a in atividades.listar()
        if a["run_id"] == "run-tool-tobias" and a["tipo"] == "delegou"
    ]
    assert len(delegacoes) == 2


def test_tobias_ler_arquivo_repo_usa_github_leitura(banco, monkeypatch):
    """A tool `ler_arquivo_repo` do vigia delega para github_leitura (sem GitHub real)."""
    chamado = {}

    def fake_ler(caminho, ref=None):
        chamado["caminho"] = caminho
        return "conteudo do arquivo"

    monkeypatch.setattr(github_leitura, "ler_arquivo_repo", fake_ler)

    saida = vigia.ler_arquivo_repo.invoke({"caminho": "src/telas/Home.tsx"})
    assert saida == "conteudo do arquivo"
    assert chamado["caminho"] == "src/telas/Home.tsx"


# --- diagnosticar(): fluxo completo (task 4.2) ---


class ModeloEstruturadoFake:
    """Fake de `ChatAnthropic` para a saída estruturada de `estruturar`.

    `with_structured_output(Diagnostico, include_raw=True)` retorna a si mesmo;
    `invoke` devolve `{"raw": AIMessage(com tokens), "parsed": diag}`. Nenhuma
    chamada real à Anthropic.
    """

    def __init__(self, diag: Any, tokens: int = 55) -> None:
        self._diag = diag
        self._tokens = tokens
        self.modelo_saida: Any = None
        self.include_raw = False

    def with_structured_output(
        self, modelo: Any, include_raw: bool = False
    ) -> "ModeloEstruturadoFake":
        self.modelo_saida = modelo
        self.include_raw = include_raw
        return self

    def invoke(self, msgs: Any) -> dict:
        bruto = AIMessage(
            content="",
            usage_metadata={
                "input_tokens": self._tokens - 5,
                "output_tokens": 5,
                "total_tokens": self._tokens,
            },
        )
        return {"raw": bruto, "parsed": self._diag, "parsing_error": None}


def _diag_fixo(**campos: Any) -> vigia.Diagnostico:
    """Diagnóstico fixo para os testes (não depende do modelo real)."""
    dados = {
        "resumo": "Variável indefinida em Home.tsx",
        "causa_provavel": "uso da variável 'heck' que não existe",
        "confianca": "media",
        "arquivos_suspeitos": [
            {"caminho": "src/telas/Home.tsx", "motivo": "onde o erro estoura"}
        ],
        "pr_relacionado": None,
        "impacto": "tela inicial quebra ao abrir",
        "proximo_passo": "corrigir o nome da variável",
        "corrigivel_automaticamente": True,
        "motivo": "mudança pequena e localizada",
    }
    dados.update(campos)
    return vigia.Diagnostico(**dados)


def _sem_stack_no_sentry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Evita qualquer chamada ao Sentry na busca best-effort de stack."""
    monkeypatch.setattr(github_leitura, "ultimo_evento_stack", lambda issue: [])


def test_diagnosticar_salva_muda_status_e_posta_no_chat(banco, monkeypatch):
    """Sucesso: diagnóstico salvo, status `diagnosticado`, resumo no chat.

    Valida Requirements 3.1, 3.5, 3.8: o incidente vira `diagnosticado`,
    `diagnosticado_em` é preenchido, `incidentes.diagnostico` guarda o objeto,
    e o Orquestrador posta um resumo com projeto, usuários, causa e o ponteiro
    para Incidentes.
    """
    incidente_id = _inserir_incidente(usuarios_afetados=3, projeto="app")

    # Rui devolve um relatório direto (sem pedir ferramenta).
    rui = ModeloFake([_ai_final("A causa é a variável 'heck' inexistente em Home.tsx.")])
    _instalar_modelo(monkeypatch, rui)
    _sem_stack_no_sentry(monkeypatch)
    # A estruturação usa um modelo próprio (isolado em `estruturar`).
    monkeypatch.setattr(vigia, "estruturar", lambda rel, inc: (_diag_fixo(), 55))

    resultado = vigia.diagnosticar(incidente_id)
    assert resultado["status"] == "diagnosticado"

    incidente = db.um(
        "select status, diagnostico, diagnosticado_em from incidentes where id = %s",
        (incidente_id,),
    )
    assert incidente["status"] == "diagnosticado"
    assert incidente["diagnosticado_em"] is not None
    assert incidente["diagnostico"]["causa_provavel"].startswith("uso da variável")

    # Mensagem do Orquestrador no chat (Requirement 3.8).
    mensagens = db.listar_mensagens()
    do_orq = [m for m in mensagens if m["autor"] == "Orquestrador"]
    assert len(do_orq) == 1
    texto = do_orq[0]["texto"]
    assert "app" in texto  # projeto
    assert "3 usuário" in texto  # usuários afetados
    assert "uso da variável" in texto  # causa provável
    assert "Detalhes em Incidentes" in texto


def test_diagnosticar_registra_tokens(banco, monkeypatch):
    """Todas as chamadas do diagnóstico registram tokens (Requirement 4.3).

    O passo de estruturação usa `include_raw` e os tokens entram numa atividade
    `pensando` do `vigia`.
    """
    incidente_id = _inserir_incidente()

    rui = ModeloFake([_ai_final("Relatório do Rui.")])
    _instalar_modelo(monkeypatch, rui)
    _sem_stack_no_sentry(monkeypatch)

    # Usa o `estruturar` real, mas com um modelo estruturado fake (via principal).
    estruturado = ModeloEstruturadoFake(_diag_fixo(), tokens=77)
    monkeypatch.setattr(vigia.llm, "estruturado", llm.estruturado)  # usa o real
    # `estruturar` chama `llm.principal()`; o Rui e a estruturação compartilham o
    # mesmo fake não serve (respostas diferentes), então trocamos só na hora.
    chamadas = {"n": 0}
    original_principal = vigia.llm.principal

    def principal_alternante():
        # 1ª chamada (bind_tools do Rui) -> modelo do Rui; a estruturação
        # chama principal() de novo -> modelo estruturado.
        chamadas["n"] += 1
        return estruturado if chamadas["n"] > 1 else rui

    monkeypatch.setattr(vigia.llm, "principal", principal_alternante)

    vigia.diagnosticar(incidente_id)

    assert estruturado.include_raw is True
    total = sum(
        a["tokens"] for a in atividades.listar() if a["run_id"] == f"inc-{incidente_id}"
    )
    assert total >= 77


def test_diagnosticar_falha_mantem_aberto_e_avisa(banco, monkeypatch):
    """Falha no diagnóstico: status segue `aberto`, atividade `erro`, aviso no chat.

    Valida Requirement 3.9: `estruturar` levanta; o incidente não muda de
    status, uma atividade `erro` do `vigia` é registrada, o chat recebe um
    aviso curto e a exceção NÃO é propagada.
    """
    incidente_id = _inserir_incidente()

    rui = ModeloFake([_ai_final("Relatório do Rui.")])
    _instalar_modelo(monkeypatch, rui)
    _sem_stack_no_sentry(monkeypatch)

    def estruturar_quebra(rel, inc):
        raise RuntimeError("modelo indisponível")

    monkeypatch.setattr(vigia, "estruturar", estruturar_quebra)

    resultado = vigia.diagnosticar(incidente_id)  # não deve levantar
    assert resultado["status"] == "erro"

    incidente = db.um("select status from incidentes where id = %s", (incidente_id,))
    assert incidente["status"] == "aberto"

    log = atividades.listar()
    erros = [
        a for a in log if a["run_id"] == f"inc-{incidente_id}" and a["tipo"] == "erro"
    ]
    assert len(erros) == 1
    assert erros[0]["agente"] == "vigia"

    do_orq = [m for m in db.listar_mensagens() if m["autor"] == "Orquestrador"]
    assert len(do_orq) == 1
    assert "diagnosticar" in do_orq[0]["texto"]


def test_diagnosticar_respeita_max_voltas_do_rui(banco, monkeypatch):
    """O loop do Rui não passa de 8 voltas (Requirement 4.4).

    Um modelo que SEMPRE pede uma ferramenta faria o loop rodar para sempre;
    `rodar_com_ferramentas(max_voltas=8)` deve encerrar em 8 invocações.
    """
    incidente_id = _inserir_incidente()

    # Fila grande de respostas que sempre pedem `detalhe_incidente`.
    respostas = [_ai_com_ferramenta("detalhe_incidente", {}) for _ in range(20)]
    rui = ModeloFake(respostas)
    _instalar_modelo(monkeypatch, rui)
    _sem_stack_no_sentry(monkeypatch)
    monkeypatch.setattr(vigia, "estruturar", lambda rel, inc: (_diag_fixo(), 10))

    vigia.diagnosticar(incidente_id)

    # O Rui foi invocado no máximo 8 vezes (Requirement 4.4).
    assert rui.chamadas == vigia.MAX_VOLTAS_RUI == 8


def test_dentro_do_limite_sem_diagnosticos_libera(banco):
    """Sem diagnósticos iniciados na hora, o limite libera (True)."""
    assert vigia.dentro_do_limite() is True


# --- Áreas proibidas aplicadas por código (task 4.3, Requirement 3.6) ---


@pytest.mark.parametrize(
    "caminho",
    [
        "prisma/schema.prisma",
        "apps/api/prisma/schema.prisma",
        "src/auth/login.ts",
        "packages/migrations/001_init.sql",
    ],
)
def test_casa_area_proibida_pega_caminhos_sensiveis(caminho):
    """`_casa_area_proibida` pega os caminhos protegidos apesar do `**`."""
    padrao = vigia._casa_area_proibida(caminho, vigia.config.areas_proibidas())
    assert padrao is not None


@pytest.mark.parametrize(
    "caminho",
    [
        "src/telas/Home.tsx",
        "lib/utils/format.ts",
        "components/Button.tsx",
    ],
)
def test_casa_area_proibida_ignora_caminhos_comuns(caminho):
    """Caminhos comuns não casam nenhuma área proibida."""
    assert vigia._casa_area_proibida(caminho, vigia.config.areas_proibidas()) is None


def test_aplicar_areas_proibidas_arquivo_em_prisma_forca_false(banco):
    """Arquivo suspeito em `prisma/` força `corrigivel_automaticamente=False`."""
    diag = _diag_fixo(
        corrigivel_automaticamente=True,
        arquivos_suspeitos=[{"caminho": "apps/api/prisma/schema.prisma", "motivo": "x"}],
    )
    incidente = {"culpado": "src/telas/Home.tsx"}

    ajustado = vigia.aplicar_areas_proibidas(diag, incidente)

    assert ajustado.corrigivel_automaticamente is False
    assert "área protegida" in ajustado.motivo
    assert "prisma" in ajustado.motivo


def test_aplicar_areas_proibidas_culpado_auth_forca_false(banco):
    """Culpado em `auth` (e arquivo em `auth`) força `False`."""
    diag = _diag_fixo(
        corrigivel_automaticamente=True,
        arquivos_suspeitos=[{"caminho": "src/auth/login.ts", "motivo": "x"}],
    )
    incidente = {"culpado": "authService.validate"}

    ajustado = vigia.aplicar_areas_proibidas(diag, incidente)

    assert ajustado.corrigivel_automaticamente is False
    assert "área protegida" in ajustado.motivo


def test_aplicar_areas_proibidas_culpado_sozinho_forca_false(banco):
    """Só o culpado casando (sem arquivo suspeito) já força `False`."""
    diag = _diag_fixo(
        corrigivel_automaticamente=True,
        arquivos_suspeitos=[{"caminho": "src/telas/Home.tsx", "motivo": "x"}],
    )
    incidente = {"culpado": "authService.validate"}

    ajustado = vigia.aplicar_areas_proibidas(diag, incidente)
    assert ajustado.corrigivel_automaticamente is False


def test_aplicar_areas_proibidas_sem_area_mantem_original(banco):
    """Sem área proibida, o `corrigivel_automaticamente` original é mantido."""
    diag = _diag_fixo(
        corrigivel_automaticamente=True,
        arquivos_suspeitos=[{"caminho": "src/telas/Home.tsx", "motivo": "x"}],
    )
    incidente = {"culpado": "src/telas/Home.tsx"}

    ajustado = vigia.aplicar_areas_proibidas(diag, incidente)

    assert ajustado.corrigivel_automaticamente is True
    assert ajustado.motivo == diag.motivo


def test_diagnosticar_forca_false_em_area_proibida_ponta_a_ponta(banco, monkeypatch):
    """Mesmo com o modelo dizendo True, área proibida força False no banco (Req. 3.6).

    O modelo (via `estruturar`) devolve `corrigivel_automaticamente=True` com um
    arquivo suspeito em `prisma/`; o resultado salvo em `incidentes.diagnostico`
    DEVE ter `corrigivel_automaticamente=False` — enforcement by code.
    """
    incidente_id = _inserir_incidente(culpado="src/telas/Home.tsx")

    rui = ModeloFake([_ai_final("Relatório do Rui.")])
    _instalar_modelo(monkeypatch, rui)
    _sem_stack_no_sentry(monkeypatch)

    diag_modelo = _diag_fixo(
        corrigivel_automaticamente=True,
        arquivos_suspeitos=[{"caminho": "apps/api/prisma/schema.prisma", "motivo": "migração"}],
    )
    monkeypatch.setattr(vigia, "estruturar", lambda rel, inc: (diag_modelo, 20))

    resultado = vigia.diagnosticar(incidente_id)
    assert resultado["status"] == "diagnosticado"

    incidente = db.um(
        "select diagnostico from incidentes where id = %s", (incidente_id,)
    )
    assert incidente["diagnostico"]["corrigivel_automaticamente"] is False
    assert "área protegida" in incidente["diagnostico"]["motivo"]


# --- Limite por hora e aviso único de fila (task 4.4, Requirement 4) ---


def _marcar_diagnostico_iniciado(quantidade: int) -> None:
    """Insere `quantidade` incidentes com `diagnostico_iniciado_em = now()`.

    Cada incidente conta na janela de 60 min de `dentro_do_limite`. Usa um
    `sentry_issue_id` único (uuid) por incidente, para poder ser chamado várias
    vezes no mesmo teste sem colidir com a constraint de unicidade.
    """
    import uuid

    for _ in range(quantidade):
        incidente_id = _inserir_incidente(sentry_issue_id=f"lim-{uuid.uuid4()}")
        db.executar(
            "update incidentes set diagnostico_iniciado_em = now() where id = %s",
            (incidente_id,),
        )


def test_dentro_do_limite_fronteira_do_sexto(banco):
    """Com 4 diagnósticos na hora ainda libera; com 5, o 6º fica de fora.

    Padrão `ORION_MAX_DIAGNOSTICOS_HORA` = 5 (Requirement 4.1).
    """
    _marcar_diagnostico_iniciado(4)
    assert vigia.dentro_do_limite() is True  # o 5º ainda entra

    _marcar_diagnostico_iniciado(1)  # agora são 5 na janela
    assert vigia.dentro_do_limite() is False  # o 6º fica de fora


def test_diagnosticar_no_limite_vai_para_fila_sem_chamar_modelo(banco, monkeypatch):
    """O 6º diagnóstico na hora fica na fila: status `aberto`, sem chamar o modelo.

    Requirement 4.1/4.2: acima do limite, `diagnosticar` devolve
    `{"status": "fila"}`, o incidente segue `aberto` (não vira `diagnosticado`)
    e o modelo não é invocado.
    """
    _marcar_diagnostico_iniciado(5)  # janela cheia

    # Um incidente novo, ainda `aberto`, para tentar diagnosticar.
    incidente_id = _inserir_incidente(sentry_issue_id="novo-na-fila")

    # Se o modelo for chamado, o teste falha.
    def nao_deve_chamar():
        raise AssertionError("o modelo não deve ser chamado quando acima do limite")

    monkeypatch.setattr(llm, "principal", nao_deve_chamar)
    monkeypatch.setattr(
        vigia, "estruturar", lambda rel, inc: nao_deve_chamar()
    )
    _sem_stack_no_sentry(monkeypatch)

    resultado = vigia.diagnosticar(incidente_id)
    assert resultado["status"] == "fila"

    incidente = db.um(
        "select status, diagnostico from incidentes where id = %s", (incidente_id,)
    )
    assert incidente["status"] == "aberto"
    assert incidente["diagnostico"] is None


def test_avisar_fila_uma_vez_por_hora_posta_uma_so_mensagem(banco):
    """Duas chamadas seguidas postam só UMA mensagem na janela de 60 min (Req. 4.2)."""
    vigia.avisar_fila_uma_vez_por_hora()
    vigia.avisar_fila_uma_vez_por_hora()

    do_orq = [m for m in db.listar_mensagens() if m["autor"] == "Orquestrador"]
    assert len(do_orq) == 1
    assert "fila" in do_orq[0]["texto"]

    # Só um marcador de aviso de fila registrado.
    marcadores = [
        a
        for a in atividades.listar()
        if a["agente"] == "vigia"
        and a["tipo"] == "pensando"
        and a["detalhe"] == vigia.DETALHE_AVISO_FILA
    ]
    assert len(marcadores) == 1


def test_avisar_fila_volta_a_avisar_apos_uma_hora(banco):
    """Com o último aviso a mais de 60 min, volta a avisar (Req. 4.2).

    Simula a passagem de tempo empurrando o `criado_em` do marcador para trás.
    """
    vigia.avisar_fila_uma_vez_por_hora()

    # Envelhece o marcador (e a mensagem) para além da janela de 60 min.
    db.executar(
        """
        update atividades
           set criado_em = now() - interval '61 minutes'
         where agente = 'vigia' and tipo = 'pensando' and detalhe = %s
        """,
        (vigia.DETALHE_AVISO_FILA,),
    )

    vigia.avisar_fila_uma_vez_por_hora()

    do_orq = [m for m in db.listar_mensagens() if m["autor"] == "Orquestrador"]
    assert len(do_orq) == 2


# --- Rota `vigia` do chat (task 5, Requirements 5.1–5.3) ---


def test_ferramentas_de_leitura_do_rui_sao_so_leitura():
    """O Rui no chat recebe só `incidentes_abertos` e `detalhe_incidente`.

    Sem `pedir_ao_tobias`, `buscar_changelog`, `mudancas_recentes` nem
    `commits_recentes` — nada que inicie diagnóstico ou delegue ao Tobias
    (Requirement 5.2).
    """
    ferramentas = vigia.ferramentas_de_leitura_do_rui("run-leitura")
    nomes = {f.name for f in ferramentas}
    assert nomes == {"incidentes_abertos", "detalhe_incidente"}


def test_responder_sobre_incidentes_usa_incidentes_do_banco(banco, monkeypatch):
    """O Rui responde a partir dos incidentes reais, sem iniciar diagnóstico.

    O modelo (fake) pede `incidentes_abertos`, recebe a lista real do banco e
    responde citando o incidente. Nenhum diagnóstico é iniciado (Req. 5.2).
    """
    _inserir_incidente(sentry_issue_id="chat-1", titulo="Erro no login")

    respostas = [
        _ai_com_ferramenta("incidentes_abertos", {}),
        _ai_final("Há 1 incidente aberto: 'Erro no login' no app."),
    ]
    fake = ModeloFake(respostas)
    _instalar_modelo(monkeypatch, fake)

    texto = vigia.responder_sobre_incidentes("tem algo quebrado?", "run-chat")

    assert "Erro no login" in texto

    # Nenhum incidente foi diagnosticado (status permanece `aberto`).
    incidente = db.um(
        "select status, diagnostico, diagnostico_iniciado_em from incidentes "
        "where sentry_issue_id = %s",
        ("chat-1",),
    )
    assert incidente["status"] == "aberto"
    assert incidente["diagnostico"] is None
    assert incidente["diagnostico_iniciado_em"] is None


def test_responder_sobre_incidentes_sem_incidentes_diz_claramente(banco, monkeypatch):
    """Sem incidentes abertos, a ferramenta devolve texto claro (Requirement 5.3).

    A tool `incidentes_abertos` do chat, sem nenhum incidente no banco, informa
    que não há nada aberto — para o Rui responder isso ao sócio.
    """
    ferramentas = vigia.ferramentas_de_leitura_do_rui("run-vazio-chat")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["incidentes_abertos"].invoke({})
    assert "Nenhum incidente" in saida


def test_responder_sobre_incidentes_detalhe_por_id(banco, monkeypatch):
    """A tool `detalhe_incidente` do chat aceita o id por argumento."""
    incidente_id = _inserir_incidente(sentry_issue_id="chat-2", titulo="Erro X")

    ferramentas = vigia.ferramentas_de_leitura_do_rui("run-det-chat")
    por_nome = {f.name: f for f in ferramentas}
    saida = por_nome["detalhe_incidente"].invoke({"incidente_id": incidente_id})
    assert "Erro X" in saida


def test_responder_sobre_incidentes_nao_delega_ao_tobias(banco, monkeypatch):
    """A rota do chat não emite delegação vigia→tech (não usa `pedir_ao_tobias`)."""
    _inserir_incidente(sentry_issue_id="chat-3")

    fake = ModeloFake([_ai_final("Tudo tranquilo, sem novidades graves.")])
    _instalar_modelo(monkeypatch, fake)

    vigia.responder_sobre_incidentes("como está o app?", "run-sem-tobias")

    delegou_tech = [
        a for a in atividades.listar()
        if a["run_id"] == "run-sem-tobias"
        and a["tipo"] == "delegou"
        and (a.get("dados") or {}).get("para") == "tech"
    ]
    assert delegou_tech == []
