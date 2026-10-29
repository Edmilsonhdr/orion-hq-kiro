"""Comercial: CRM leve para vender o Orion a clínicas, empresas e autônomos (spec `.kiro/specs/comercial`).

Organizações, contatos, negócios (funil) e interações. SÓ dados comerciais: nunca dados de saúde de
pessoas. Validação por `ValueError` (rotas → 422); nome repetido levanta `ConflitoError` (→ 409).
Convenções (tech.md): reuso dos helpers de `db.py`, conexão curta, domínio em português.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

import psycopg

from . import config, db, texto

NOME_MAX = 200
TEXTO_MAX = 500
OBSERVACOES_MAX = 5_000
RESUMO_MAX = 5_000

TIPOS_ORG = ("clinica", "autonomo", "empresa", "outro")
AREAS = ("nutricao", "educacao_fisica", "ambas", "outra")
PLANOS = ("essencial", "completo")
ETAPAS = ("lead", "contato", "demonstracao", "piloto", "proposta", "ganho", "perdido")
ETAPAS_ABERTAS = ETAPAS[:5]
ETAPAS_FECHADAS = ("ganho", "perdido")
ROTULO_ETAPA = {
    "lead": "Lead", "contato": "Contato", "demonstracao": "Demonstração", "piloto": "Piloto",
    "proposta": "Proposta", "ganho": "Ganho", "perdido": "Perdido",
}
TIPOS_INTERACAO = ("ligacao", "reuniao", "email", "whatsapp", "nota")
TIPO_ETAPA = "etapa"  # reservado ao sistema

DIAS_PARADO = 7
DIAS_FECHADOS = 30
DIAS_CONVERSAO = 90

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_COL_NEGOCIO = """
  n.id, n.organizacao_id, o.nome as organizacao_nome, o.tipo as organizacao_tipo, n.titulo, n.etapa,
  n.valor_mensal, n.pacientes_ativos, n.plano_interesse, n.usa_hoje, n.origem, n.responsavel,
  n.proximo_passo, n.proximo_passo_em, n.etapa_desde, n.fechado_em, n.motivo_perda,
  n.criado_em, n.atualizado_em
"""


class ConflitoError(Exception):
    """Operação que conflita com o estado atual (ex.: nome de organização repetido)."""


# --- validação ---


def _texto(valor: Any, rotulo: str, maximo: int, obrigatorio: bool = False) -> Optional[str]:
    valor = (valor or "").strip() if isinstance(valor, str) or valor is None else str(valor).strip()
    if not valor:
        if obrigatorio:
            raise ValueError(f"{rotulo} é obrigatório.")
        return None
    if len(valor) > maximo:
        raise ValueError(f"{rotulo} passa de {maximo} caracteres.")
    return valor


def _opcao(valor: Any, rotulo: str, opcoes: tuple[str, ...], obrigatorio: bool = False) -> Optional[str]:
    if valor in (None, ""):
        if obrigatorio:
            raise ValueError(f"{rotulo} é obrigatório.")
        return None
    if valor not in opcoes:
        raise ValueError(f"{rotulo} inválido. Use: {', '.join(opcoes)}.")
    return valor


def _numero(valor: Any, rotulo: str, inteiro: bool = False) -> Optional[Any]:
    if valor in (None, ""):
        return None
    try:
        numero = int(valor) if inteiro else Decimal(str(valor))
        if inteiro and (isinstance(valor, float) and valor != numero):
            raise ValueError
    except (ValueError, ArithmeticError):
        raise ValueError(f"{rotulo} precisa ser um número.") from None
    if numero < 0 or (not inteiro and not numero.is_finite()):
        raise ValueError(f"{rotulo} não pode ser negativo.")
    return numero


def _data(valor: Any, rotulo: str) -> Optional[date]:
    if valor in (None, ""):
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError:
        raise ValueError(f"{rotulo} inválida. Use o formato AAAA-MM-DD.") from None


def _email(valor: Any) -> Optional[str]:
    valor = _texto(valor, "E-mail", NOME_MAX)
    if valor and not _EMAIL.match(valor):
        raise ValueError("E-mail inválido.")
    return valor


def _numerico_para_float(linha: Optional[dict]) -> Optional[dict]:
    if linha is None:
        return None
    if isinstance(linha.get("valor_mensal"), Decimal):
        linha["valor_mensal"] = float(linha["valor_mensal"])
    return linha


# --- organizações ---


def validar_organizacao(campos: dict[str, Any]) -> dict[str, Any]:
    """Valida só as chaves presentes em `campos`; o nome é sempre obrigatório quando informado."""
    saida: dict[str, Any] = {}
    if "nome" in campos:
        saida["nome"] = _texto(campos["nome"], "Nome", NOME_MAX, obrigatorio=True)
    if "tipo" in campos:
        saida["tipo"] = _opcao(campos["tipo"], "Tipo", TIPOS_ORG, obrigatorio=True)
    if "area" in campos:
        saida["area"] = _opcao(campos["area"], "Área", AREAS)
    for chave, rotulo, maximo in (
        ("cidade", "Cidade", 100),
        ("site", "Site", TEXTO_MAX),
        ("observacoes", "Observações", OBSERVACOES_MAX),
    ):
        if chave in campos:
            saida[chave] = _texto(campos[chave], rotulo, maximo)
    return saida


def _gravar_organizacao(sql: str, params: tuple) -> dict:
    try:
        linha = db.um(sql, params)
    except psycopg.errors.UniqueViolation:
        raise ConflitoError("Já existe uma organização com esse nome.") from None
    assert linha is not None
    return linha


def criar_organizacao(campos: dict[str, Any]) -> dict:
    dados = validar_organizacao({"tipo": "clinica", **campos})
    if "nome" not in dados:
        raise ValueError("Nome é obrigatório.")
    return _gravar_organizacao(
        """
        insert into organizacoes (nome, tipo, area, cidade, site, observacoes)
        values (%s, %s, %s, %s, %s, %s) returning *
        """,
        (
            dados["nome"], dados["tipo"], dados.get("area"), dados.get("cidade"),
            dados.get("site"), dados.get("observacoes"),
        ),
    )


def editar_organizacao(organizacao_id: int, campos: dict[str, Any]) -> Optional[dict]:
    dados = validar_organizacao(campos)
    if not dados:
        return obter_organizacao(organizacao_id)
    sets = ", ".join(f"{c} = %s" for c in dados)
    linha = None
    try:
        linha = db.um(
            f"update organizacoes set {sets}, atualizado_em = now() where id = %s returning *",
            (*dados.values(), organizacao_id),
        )
    except psycopg.errors.UniqueViolation:
        raise ConflitoError("Já existe uma organização com esse nome.") from None
    return linha


def obter_organizacao(organizacao_id: int) -> Optional[dict]:
    org = db.um("select * from organizacoes where id = %s", (organizacao_id,))
    if org is None:
        return None
    org["contatos"] = contatos_da(organizacao_id)
    org["negocios"] = listar_negocios(organizacao_id=organizacao_id, todos=True)
    return org


def listar_organizacoes(arquivadas: bool = False, busca: Optional[str] = None) -> list[dict]:
    linhas = db.consultar(
        """
        select o.*,
          (select count(*) from negocios n
            where n.organizacao_id = o.id and n.etapa = any(%s)) as negocios_abertos,
          (select count(*) from contatos c where c.organizacao_id = o.id) as total_contatos
        from organizacoes o
        where o.arquivada = %s
        order by lower(o.nome)
        """,
        (list(ETAPAS_ABERTAS), arquivadas),
    )
    if busca and busca.strip():
        termos = [t for t in texto.radicais(busca) if len(t) > 1]
        linhas = [
            l for l in linhas
            if all(
                texto.casa(t, set(texto.radicais(f"{l['nome']} {l['cidade'] or ''}")))
                for t in termos
            )
        ]
    return linhas


def arquivar_organizacao(organizacao_id: int, arquivada: bool = True) -> Optional[dict]:
    try:
        return db.um(
            "update organizacoes set arquivada = %s, atualizado_em = now() where id = %s returning *",
            (arquivada, organizacao_id),
        )
    except psycopg.errors.UniqueViolation:
        raise ConflitoError(
            "Já existe uma organização ativa com esse nome; renomeie uma delas antes."
        ) from None


def obter_ou_criar_organizacao(nome: str, tipo: str = "clinica") -> dict:
    """Organização ativa com esse nome (sem diferenciar caixa) ou uma nova."""
    nome_ok = _texto(nome, "Nome da organização", NOME_MAX, obrigatorio=True)
    existente = db.um(
        "select * from organizacoes where lower(nome) = lower(%s) and not arquivada", (nome_ok,)
    )
    return existente or criar_organizacao({"nome": nome_ok, "tipo": tipo})


# --- contatos ---


def _validar_contato(campos: dict[str, Any], completo: bool) -> dict[str, Any]:
    saida: dict[str, Any] = {}
    if completo or "nome" in campos:
        saida["nome"] = _texto(campos.get("nome"), "Nome", NOME_MAX, obrigatorio=True)
    if "cargo" in campos:
        saida["cargo"] = _texto(campos["cargo"], "Cargo", 100)
    if "email" in campos:
        saida["email"] = _email(campos["email"])
    if "telefone" in campos:
        saida["telefone"] = _texto(campos["telefone"], "Telefone", 40)
    return saida


def contatos_da(organizacao_id: int) -> list[dict]:
    return db.consultar(
        "select * from contatos where organizacao_id = %s order by id", (organizacao_id,)
    )


def criar_contato(organizacao_id: int, campos: dict[str, Any]) -> Optional[dict]:
    """Cria o contato; `None` se a organização não existe."""
    dados = _validar_contato(campos, completo=True)
    if db.um("select 1 as ok from organizacoes where id = %s", (organizacao_id,)) is None:
        return None
    return db.um(
        """
        insert into contatos (organizacao_id, nome, cargo, email, telefone)
        values (%s, %s, %s, %s, %s) returning *
        """,
        (organizacao_id, dados["nome"], dados.get("cargo"), dados.get("email"), dados.get("telefone")),
    )


def editar_contato(contato_id: int, campos: dict[str, Any]) -> Optional[dict]:
    dados = _validar_contato(campos, completo=False)
    if not dados:
        return db.um("select * from contatos where id = %s", (contato_id,))
    sets = ", ".join(f"{c} = %s" for c in dados)
    return db.um(
        f"update contatos set {sets} where id = %s returning *", (*dados.values(), contato_id)
    )


def excluir_contato(contato_id: int) -> bool:
    return db.executar("delete from contatos where id = %s", (contato_id,)) > 0


# --- negócios ---


def validar_negocio(campos: dict[str, Any]) -> dict[str, Any]:
    """Valida só as chaves presentes (não inclui etapa, que passa por `mover_etapa`)."""
    saida: dict[str, Any] = {}
    if "titulo" in campos:
        saida["titulo"] = _texto(campos["titulo"], "Título", NOME_MAX, obrigatorio=True)
    if "valor_mensal" in campos:
        saida["valor_mensal"] = _numero(campos["valor_mensal"], "Valor mensal")
    if "pacientes_ativos" in campos:
        saida["pacientes_ativos"] = _numero(
            campos["pacientes_ativos"], "Número de pacientes/alunos", inteiro=True
        )
    if "plano_interesse" in campos:
        saida["plano_interesse"] = _opcao(campos["plano_interesse"], "Pacote", PLANOS)
    for chave, rotulo in (("usa_hoje", "O que usa hoje"), ("origem", "Origem"),
                          ("proximo_passo", "Próximo passo")):
        if chave in campos:
            saida[chave] = _texto(campos[chave], rotulo, TEXTO_MAX)
    if "responsavel" in campos:
        saida["responsavel"] = _texto(campos["responsavel"], "Responsável", 100, obrigatorio=True)
    if "proximo_passo_em" in campos:
        saida["proximo_passo_em"] = _data(campos["proximo_passo_em"], "Data do próximo passo")
    return saida


def criar_negocio(organizacao_id: int, campos: dict[str, Any], autor: str) -> Optional[dict]:
    """Cria um negócio em `lead` (ou outra etapa aberta); `None` se a organização não existe."""
    etapa = _opcao(campos.get("etapa") or "lead", "Etapa", ETAPAS_ABERTAS)
    dados = validar_negocio({"responsavel": autor, **campos})
    if "titulo" not in dados:
        raise ValueError("Título é obrigatório.")
    org = db.um("select 1 as ok from organizacoes where id = %s and not arquivada", (organizacao_id,))
    if org is None:
        return None
    novo = db.um(
        """
        insert into negocios (organizacao_id, titulo, etapa, valor_mensal, pacientes_ativos,
          plano_interesse, usa_hoje, origem, responsavel, proximo_passo, proximo_passo_em)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id
        """,
        (
            organizacao_id, dados["titulo"], etapa, dados.get("valor_mensal"),
            dados.get("pacientes_ativos"), dados.get("plano_interesse"), dados.get("usa_hoje"),
            dados.get("origem"), dados["responsavel"], dados.get("proximo_passo"),
            dados.get("proximo_passo_em"),
        ),
    )
    assert novo is not None
    return obter_negocio(novo["id"])


def obter_negocio(negocio_id: int) -> Optional[dict]:
    linha = db.um(
        f"select {_COL_NEGOCIO} from negocios n join organizacoes o on o.id = n.organizacao_id "
        "where n.id = %s",
        (negocio_id,),
    )
    return _numerico_para_float(linha)


def editar_negocio(negocio_id: int, campos: dict[str, Any]) -> Optional[dict]:
    dados = validar_negocio(campos)
    if dados:
        sets = ", ".join(f"{c} = %s" for c in dados)
        db.executar(
            f"update negocios set {sets}, atualizado_em = now() where id = %s",
            (*dados.values(), negocio_id),
        )
    return obter_negocio(negocio_id)


def mover_etapa(
    negocio_id: int, etapa: str, por: str, motivo_perda: Optional[str] = None
) -> Optional[dict]:
    """Muda a etapa e registra a mudança no histórico, na mesma transação.

    `perdido` exige o motivo; `ganho`/`perdido` gravam o fechamento; reabrir limpa fechamento e
    motivo. Mover para a etapa em que já está não faz nada.
    """
    etapa = _opcao(etapa, "Etapa", ETAPAS, obrigatorio=True)
    motivo = _texto(motivo_perda, "Motivo da perda", TEXTO_MAX)
    if etapa == "perdido" and not motivo:
        raise ValueError("Informe o motivo da perda.")
    with db.conexao() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("select etapa from negocios where id = %s for update", (negocio_id,))
                atual = cur.fetchone()
                if atual is None:
                    return None
                if atual["etapa"] == etapa:
                    return obter_negocio(negocio_id)
                fechando = etapa in ETAPAS_FECHADAS
                cur.execute(
                    """
                    update negocios set etapa = %s, etapa_desde = now(), atualizado_em = now(),
                      fechado_em = case when %s then now() else null end,
                      motivo_perda = %s
                    where id = %s
                    """,
                    (etapa, fechando, motivo if etapa == "perdido" else None, negocio_id),
                )
                resumo = f"Etapa: {ROTULO_ETAPA[atual['etapa']]} → {ROTULO_ETAPA[etapa]}"
                if etapa == "perdido":
                    resumo += f" ({motivo})"
                cur.execute(
                    "insert into interacoes (negocio_id, tipo, resumo, autor) values (%s, %s, %s, %s)",
                    (negocio_id, TIPO_ETAPA, resumo, por),
                )
    return obter_negocio(negocio_id)


def listar_negocios(
    etapa: Optional[str] = None,
    responsavel: Optional[str] = None,
    busca: Optional[str] = None,
    todos: bool = False,
    organizacao_id: Optional[int] = None,
) -> list[dict]:
    """Negócios com filtros. Fechados só aparecem se fecharam há até 30 dias (ou `todos`)."""
    if etapa:
        _opcao(etapa, "Etapa", ETAPAS)
    onde, params = [], []
    if etapa:
        onde.append("n.etapa = %s")
        params.append(etapa)
    if responsavel:
        onde.append("n.responsavel = %s")
        params.append(responsavel)
    if organizacao_id is not None:
        onde.append("n.organizacao_id = %s")
        params.append(organizacao_id)
    if not todos:
        onde.append(
            "(n.etapa = any(%s) or n.fechado_em > now() - make_interval(days => %s))"
        )
        params += [list(ETAPAS_ABERTAS), DIAS_FECHADOS]
    clausula = f"where {' and '.join(onde)}" if onde else ""
    linhas = db.consultar(
        f"select {_COL_NEGOCIO} from negocios n join organizacoes o on o.id = n.organizacao_id "
        f"{clausula} order by n.atualizado_em desc, n.id desc",
        params,
    )
    linhas = [_numerico_para_float(l) for l in linhas]
    if busca and busca.strip():
        termos = [t for t in texto.radicais(busca) if len(t) > 1]

        def casa(l: dict) -> bool:
            base = set(texto.radicais(
                f"{l['titulo']} {l['organizacao_nome']} {l['proximo_passo'] or ''}"
            ))
            return all(texto.casa(t, base) for t in termos)

        linhas = [l for l in linhas if casa(l)]
    return linhas


# --- interações ---


def registrar_interacao(
    negocio_id: int,
    tipo: str,
    resumo: str,
    autor: str,
    ocorrida_em: Optional[datetime] = None,
) -> Optional[dict]:
    """Registra uma interação feita à mão; `None` se o negócio não existe."""
    tipo = _opcao(tipo, "Tipo", TIPOS_INTERACAO, obrigatorio=True)
    resumo = _texto(resumo, "Resumo", RESUMO_MAX, obrigatorio=True)
    if db.um("select 1 as ok from negocios where id = %s", (negocio_id,)) is None:
        return None
    linha = db.um(
        """
        insert into interacoes (negocio_id, tipo, resumo, ocorrida_em, autor)
        values (%s, %s, %s, coalesce(%s, now()), %s) returning *
        """,
        (negocio_id, tipo, resumo, ocorrida_em, autor),
    )
    db.executar("update negocios set atualizado_em = now() where id = %s", (negocio_id,))
    return linha


def listar_interacoes(negocio_id: int) -> list[dict]:
    return db.consultar(
        "select * from interacoes where negocio_id = %s order by ocorrida_em desc, id desc",
        (negocio_id,),
    )


def excluir_interacao(interacao_id: int) -> str:
    """`ok`, `nao_encontrada` ou `do_sistema` (entradas de etapa não se excluem)."""
    linha = db.um("select tipo from interacoes where id = %s", (interacao_id,))
    if linha is None:
        return "nao_encontrada"
    if linha["tipo"] == TIPO_ETAPA:
        return "do_sistema"
    db.executar("delete from interacoes where id = %s", (interacao_id,))
    return "ok"


# --- visões ---


def hoje_data() -> date:
    return config.agora().date()


def parados(dias: int = DIAS_PARADO) -> list[dict]:
    """Negócios abertos sem interação nem alteração há mais de `dias` dias (mais antigos primeiro)."""
    linhas = db.consultar(
        f"select {_COL_NEGOCIO}, "
        "  floor(extract(epoch from (now() - n.atualizado_em)) / 86400)::int as dias_parado "
        "from negocios n join organizacoes o on o.id = n.organizacao_id "
        "where n.etapa = any(%s) and n.atualizado_em < now() - make_interval(days => %s) "
        "order by n.atualizado_em",
        (list(ETAPAS_ABERTAS), dias),
    )
    return [_numerico_para_float(l) for l in linhas]


def hoje() -> dict:
    """Negócios abertos agrupados por data do próximo passo (fuso São Paulo)."""
    dia = hoje_data()
    grupos: dict[str, list[dict]] = {"vencidos": [], "hoje": [], "proximos": [], "sem_passo": []}
    for n in listar_negocios():
        if n["etapa"] not in ETAPAS_ABERTAS:
            continue
        quando = n["proximo_passo_em"]
        if quando is None:
            grupos["sem_passo"].append(n)
        elif quando < dia:
            grupos["vencidos"].append(n)
        elif quando == dia:
            grupos["hoje"].append(n)
        elif (quando - dia).days <= 7:
            grupos["proximos"].append(n)
    for chave in ("vencidos", "hoje", "proximos"):
        grupos[chave].sort(key=lambda n: n["proximo_passo_em"])
    return grupos


def resumo_funil() -> dict:
    """Números do funil: por etapa, totais, ganhos/perdidos em 30 dias, conversão em 90, vencidos."""
    abertos = [n for n in listar_negocios() if n["etapa"] in ETAPAS_ABERTAS]
    por_etapa = {
        e: {
            "quantidade": sum(1 for n in abertos if n["etapa"] == e),
            "valor_mensal": round(sum(n["valor_mensal"] or 0 for n in abertos if n["etapa"] == e), 2),
        }
        for e in ETAPAS_ABERTAS
    }
    fechados = db.um(
        """
        select
          count(*) filter (where etapa = 'ganho' and fechado_em > now() - make_interval(days => %s))
            as ganhos_30d,
          count(*) filter (where etapa = 'perdido' and fechado_em > now() - make_interval(days => %s))
            as perdidos_30d,
          count(*) filter (where etapa = 'ganho' and fechado_em > now() - make_interval(days => %s))
            as ganhos_90d,
          count(*) filter (where etapa in ('ganho', 'perdido')
            and fechado_em > now() - make_interval(days => %s)) as fechados_90d
        from negocios
        """,
        (DIAS_FECHADOS, DIAS_FECHADOS, DIAS_CONVERSAO, DIAS_CONVERSAO),
    ) or {}
    dia = hoje_data()
    fech90 = int(fechados.get("fechados_90d") or 0)
    return {
        "por_etapa": por_etapa,
        "abertos": len(abertos),
        "valor_mensal_potencial": round(sum(n["valor_mensal"] or 0 for n in abertos), 2),
        "ganhos_30d": int(fechados.get("ganhos_30d") or 0),
        "perdidos_30d": int(fechados.get("perdidos_30d") or 0),
        "conversao_90d": (int(fechados.get("ganhos_90d") or 0) / fech90) if fech90 else None,
        "vencidos": sum(
            1 for n in abertos if n["proximo_passo_em"] and n["proximo_passo_em"] < dia
        ),
        "sem_passo": sum(1 for n in abertos if not n["proximo_passo_em"]),
        "parados": len(parados()),
    }


def _reais(valor: float) -> str:
    return "R$ " + f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def texto_resumo_semanal() -> Optional[str]:
    """Resumo comercial determinístico para o chat; `None` se não há nenhum negócio cadastrado."""
    if db.um("select 1 as ok from negocios limit 1") is None:
        return None
    r = resumo_funil()
    semana = db.um(
        """
        select
          count(*) filter (where etapa = 'ganho' and fechado_em > now() - interval '7 days') as ganhos,
          count(*) filter (where etapa = 'perdido' and fechado_em > now() - interval '7 days') as perdidos
        from negocios
        """
    ) or {}
    linhas = [
        "Resumo comercial da semana:",
        f"- Negócios abertos: {r['abertos']} (potencial de {_reais(r['valor_mensal_potencial'])}/mês).",
        f"- Fechados nos últimos 7 dias: {semana.get('ganhos', 0)} ganho(s) e "
        f"{semana.get('perdidos', 0)} perdido(s).",
        f"- Com próximo passo vencido: {r['vencidos']}. Sem próximo passo: {r['sem_passo']}. "
        f"Parados há mais de {DIAS_PARADO} dias: {r['parados']}.",
    ]
    etapas = ", ".join(
        f"{e}: {d['quantidade']}" for e, d in r["por_etapa"].items() if d["quantidade"]
    )
    if etapas:
        linhas.append(f"- Por etapa — {etapas}.")
    return "\n".join(linhas)


# --- importação de planilha (CSV) ---

IMPORTAR_MAX_LINHAS = 500
IMPORTAR_MAX_CARACTERES = 300_000

_ALIAS_COLUNAS = {
    "organizacao": "organizacao", "nome da organizacao": "organizacao", "empresa": "organizacao",
    "clinica": "organizacao", "nome": "organizacao",
    "tipo": "tipo", "cidade": "cidade", "origem": "origem", "area": "area",
    "contato": "contato", "nome do contato": "contato", "responsavel": "contato",
    "cargo": "cargo", "email": "email", "e-mail": "email",
    "telefone": "telefone", "celular": "telefone", "whatsapp": "telefone",
    "titulo": "titulo", "negocio": "titulo",
}


def importar_csv(texto: str, autor: str) -> dict:
    """Importa organizações, contatos e um negócio em `lead` por linha de uma planilha CSV.

    Colunas reconhecidas (com ou sem acento, vírgula ou ponto e vírgula): organização, tipo, cidade,
    origem, contato, cargo, e-mail, telefone, título. Linhas com erro não impedem as demais.
    """
    import csv
    import io

    from .texto import sem_acento

    if len(texto) > IMPORTAR_MAX_CARACTERES:
        raise ValueError("Arquivo grande demais (limite de 300 mil caracteres).")
    amostra = texto[:2000]
    delimitador = ";" if amostra.count(";") > amostra.count(",") else ","
    leitor = csv.reader(io.StringIO(texto.lstrip("\ufeff")), delimiter=delimitador)
    linhas = [l for l in leitor if any(c.strip() for c in l)]
    if len(linhas) < 2:
        raise ValueError("A planilha precisa de um cabeçalho e ao menos uma linha.")
    if len(linhas) - 1 > IMPORTAR_MAX_LINHAS:
        raise ValueError(f"Máximo de {IMPORTAR_MAX_LINHAS} linhas por importação.")
    colunas = [_ALIAS_COLUNAS.get(sem_acento(c).strip().lower()) for c in linhas[0]]
    if "organizacao" not in colunas:
        raise ValueError("Falta a coluna da organização (use o cabeçalho \"organização\" ou \"empresa\").")

    resultado = {"organizacoes": 0, "contatos": 0, "negocios": 0, "erros": []}
    for numero, linha in enumerate(linhas[1:], start=2):
        campos = {c: v.strip() for c, v in zip(colunas, linha) if c and v.strip()}
        try:
            existia = db.um(
                "select 1 as ok from organizacoes where lower(nome) = lower(%s) and not arquivada",
                (campos.get("organizacao", ""),),
            )
            tipo = sem_acento(campos.get("tipo", "")).lower()
            org = obter_ou_criar_organizacao(
                campos.get("organizacao", ""), tipo if tipo in TIPOS_ORG else "clinica"
            )
            if not existia:
                resultado["organizacoes"] += 1
                extras = {k: campos[k] for k in ("cidade",) if k in campos}
                if extras:
                    editar_organizacao(org["id"], extras)
            if campos.get("contato"):
                repetido = db.um(
                    "select 1 as ok from contatos where organizacao_id = %s and lower(nome) = lower(%s)",
                    (org["id"], campos["contato"]),
                )
                if not repetido:
                    criar_contato(
                        org["id"],
                        {k: campos[k] for k in ("cargo", "email", "telefone") if k in campos}
                        | {"nome": campos["contato"]},
                    )
                    resultado["contatos"] += 1
            aberto = db.um(
                "select 1 as ok from negocios where organizacao_id = %s and etapa = any(%s)",
                (org["id"], list(ETAPAS_ABERTAS)),
            )
            if not aberto:
                criar_negocio(
                    org["id"],
                    {"titulo": campos.get("titulo") or f"Primeiro contato — {org['nome']}"}
                    | ({"origem": campos["origem"]} if "origem" in campos else {}),
                    autor,
                )
                resultado["negocios"] += 1
        except (ValueError, ConflitoError) as erro:
            resultado["erros"].append({"linha": numero, "erro": str(erro)})
    return resultado
