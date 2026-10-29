"""Aplicação FastAPI do Orion HQ (função Python da Vercel).

Todas as rotas ficam sob `/api/*`. Este módulo adiciona o próprio diretório ao
`sys.path` para poder importar o pacote `_orion` (o prefixo `_` impede a Vercel
de tratar a pasta como uma função serverless separada).
"""

import logging
import os
import secrets
import sys
from datetime import datetime
from typing import Any

sys.path.append(os.path.dirname(__file__))

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import BaseModel

from _orion import anexos, atividades, auth, backup, busca, comercial, config, conversas, db, documentos, tarefas

app = FastAPI(title="Orion HQ")


class Credenciais(BaseModel):
    """Corpo do login: usuário e senha (Requirement 1.1/1.2)."""

    usuario: str
    senha: str


class MensagemChat(BaseModel):
    """Corpo do `POST /chat`: o texto que o sócio enviou (Requirement 2.1)."""

    texto: str
    # Conversa de destino; ausente = "Geral".
    conversa_id: int | None = None


class ConversaCorpo(BaseModel):
    titulo: str | None = None


class DecisaoAprovacao(BaseModel):
    """Corpo do `POST /aprovacoes/{id}`: aprovar ou recusar (Requirement 6.4/6.5)."""

    aprovado: bool


class StatusIncidente(BaseModel):
    """Corpo do `POST /incidentes/{id}/status` (Vigia — Requirement 6.4).

    Só aceita os três status que os botões da tela produzem: `resolvido`,
    `ignorado` e `aberto`.
    """

    status: str


# Status que a rota de mudança manual aceita (Requirement 6.4). `diagnosticado`
# fica de fora: é o fluxo do diagnóstico que o define, não o botão do sócio.
_STATUS_INCIDENTE_VALIDOS = {"resolvido", "ignorado", "aberto"}


class DocumentoNovo(BaseModel):
    """Corpo do `POST /documentos` (Docs — Requirement 1.1)."""

    titulo: str
    conteudo: str = ""
    pasta: str | None = None
    tags: list[str] = []
    pai_id: int | None = None


class DocumentoEdicao(BaseModel):
    """Corpo do `PUT /documentos/{id}`: só os campos enviados são alterados."""

    titulo: str | None = None
    conteudo: str | None = None
    pasta: str | None = None
    tags: list[str] | None = None
    pai_id: int | None = None


class OrganizacaoCorpo(BaseModel):
    """Corpo de `POST/PUT /comercial/organizacoes`: só os campos enviados contam."""

    nome: str | None = None
    tipo: str | None = None
    area: str | None = None
    cidade: str | None = None
    site: str | None = None
    observacoes: str | None = None


class ContatoCorpo(BaseModel):
    nome: str | None = None
    cargo: str | None = None
    email: str | None = None
    telefone: str | None = None


class NegocioCorpo(BaseModel):
    """Corpo de `POST/PUT /comercial/negocios`; a validação fica em `comercial.py` (422 em português)."""

    organizacao_id: int | None = None
    organizacao_nome: str | None = None
    organizacao_tipo: str | None = None
    titulo: str | None = None
    etapa: str | None = None
    valor_mensal: Any = None
    pacientes_ativos: Any = None
    plano_interesse: str | None = None
    usa_hoje: str | None = None
    origem: str | None = None
    responsavel: str | None = None
    proximo_passo: str | None = None
    proximo_passo_em: str | None = None


class EtapaCorpo(BaseModel):
    etapa: str
    motivo_perda: str | None = None


class InteracaoCorpo(BaseModel):
    tipo: str
    resumo: str
    ocorrida_em: datetime | None = None


class ArquivarCorpo(BaseModel):
    arquivada: bool = True


class ArquivarDocumento(BaseModel):
    """Corpo do `POST /documentos/{id}/arquivar`."""

    arquivado: bool = True



# Falhas de login por usuário em 15 minutos antes de bloquear (429).
LOGIN_MAX_FALHAS = 5


@app.post("/api/login")
def login(
    credenciais: Credenciais, request: Request, response: Response
) -> dict:
    """Autentica o usuário e grava o cookie de sessão assinado.

    Sucesso (Requirement 1.1): grava o cookie `orion_sessao` e responde 200.
    Falha (Requirement 1.2): responde 401 com mensagem genérica que não revela
    qual campo (usuário ou senha) estava errado.
    """
    chave = credenciais.usuario.strip().lower()[:50]
    falhas = db.um(
        """select count(*) as n from login_tentativas
           where usuario = %s and criado_em > now() - interval '15 minutes'""",
        (chave,),
    )
    if falhas and falhas["n"] >= LOGIN_MAX_FALHAS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas. Aguarde alguns minutos e tente de novo.",
        )
    if not auth.autenticar(credenciais.usuario, credenciais.senha):
        db.executar("insert into login_tentativas (usuario) values (%s)", (chave,))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha inválidos.",
        )
    db.executar("delete from login_tentativas where usuario = %s", (chave,))
    auth.definir_cookie_sessao(response, credenciais.usuario, request)
    return {"usuario": credenciais.usuario}


@app.post("/api/logout")
def logout(request: Request, response: Response) -> dict:
    """Encerra a sessão removendo o cookie."""
    auth.limpar_cookie_sessao(response, request)
    return {"ok": True}


@app.get("/api/me")
def me(usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Devolve o usuário logado (401 sem sessão — Requirement 1.3).

    Inclui `aprovador` indicando se o usuário está em `ORION_APPROVERS`.
    """
    return {"usuario": usuario, "aprovador": usuario in config.aprovadores()}


@app.post("/api/presenca")
def marcar_presenca(usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Heartbeat: registra que o usuário está com o HQ aberto agora."""
    db.executar(
        """insert into presenca (usuario, visto_em) values (%s, now())
           on conflict (usuario) do update set visto_em = now()""",
        (usuario,),
    )
    return {"ok": True}


@app.get("/api/presenca")
def quem_esta_online(usuario: str = Depends(auth.usuario_atual)) -> list[str]:
    """Usuários vistos nos últimos 90 segundos (ordem alfabética)."""
    linhas = db.consultar(
        "select usuario from presenca where visto_em > now() - interval '90 seconds' order by usuario"
    )
    return [l["usuario"] for l in linhas]


@app.get("/api/atividades")
def listar_atividades(
    desde: int = 0, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Atividades para o polling incremental do escritório/log (Requirement 8.5).

    `desde` é o maior id já visto pelo front; devolve as atividades com
    `id > desde` em ordem crescente. Se `desde=0`, as últimas 80 (também em
    ordem crescente). Exige sessão.
    """
    return atividades.listar(desde)


@app.get("/api/atividades/tokens")
def tokens_atividades(
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Tokens gastos hoje por agente (Requirement 8.6).

    Retorna `{agente: tokens}` considerando o dia no fuso de São Paulo.
    Exige sessão.
    """
    return atividades.tokens_hoje()


@app.get("/api/mensagens")
def listar_mensagens(
    desde: int = 0, conversa: int | None = None, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Mensagens do chat para o polling incremental (Requirements 2.1, 2.3).

    `desde` é o maior id já visto pelo front; devolve as mensagens com
    `id > desde` em ordem crescente. Se `desde=0`, as últimas 50 (também em
    ordem crescente). Exige sessão.
    """
    return db.listar_mensagens(desde, conversa or None)


@app.get("/api/conversas")
def listar_conversas(usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    """Conversas ativas (a "Geral" é implícita e não aparece aqui)."""
    return conversas.listar()


@app.post("/api/conversas", status_code=status.HTTP_201_CREATED)
def criar_conversa(corpo: ConversaCorpo, usuario: str = Depends(auth.usuario_atual)) -> dict:
    try:
        return conversas.criar(corpo.titulo, usuario)
    except ValueError as erro:
        raise _invalido(erro)


@app.put("/api/conversas/{conversa_id}")
def renomear_conversa(
    conversa_id: int, corpo: ConversaCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    try:
        linha = conversas.renomear(conversa_id, corpo.titulo)
    except ValueError as erro:
        raise _invalido(erro)
    if linha is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return linha


@app.post("/api/conversas/{conversa_id}/arquivar")
def arquivar_conversa(conversa_id: int, usuario: str = Depends(auth.usuario_atual)) -> dict:
    linha = conversas.arquivar(conversa_id)
    if linha is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return linha


@app.post("/api/chat")
def chat(
    mensagem: MensagemChat,
    tarefas: BackgroundTasks,
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Recebe uma mensagem do chat do grupo (Requirement 2.1).

    Salva a mensagem (`execucao.receber`) e responde logo em seguida com
    `{"status": "processando", "run_id": ...}`; o grafo roda como tarefa em
    segundo plano (`execucao.processar`) e a resposta chega ao front pelo
    polling de mensagens. Na Vercel, a função só termina depois das tarefas em
    segundo plano. O atalho `/nota` é resolvido na hora. Exige sessão.
    """
    from _orion import execucao

    conversa_id = mensagem.conversa_id or None
    if conversa_id is not None:
        if not conversas.ativa(conversa_id):
            raise HTTPException(status_code=404, detail="Conversa não encontrada.")
        conversas.titular_se_nova(conversa_id, mensagem.texto)
    resultado, estado_inicial = execucao.receber(usuario, mensagem.texto, conversa_id)
    if estado_inicial is not None:
        tarefas.add_task(execucao.processar, estado_inicial)
    return resultado


@app.get("/api/aprovacoes")
def listar_aprovacoes(
    status: str | None = None, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Fila de aprovações (Requirement 9.1).

    Com `status` informado, filtra por ele; sem filtro, devolve pendentes
    primeiro e o histórico das decididas. Exige sessão.
    """
    return db.listar_aprovacoes(status)


@app.post("/api/aprovacoes/{aprovacao_id}")
def decidir_aprovacao(
    aprovacao_id: int,
    decisao: DecisaoAprovacao,
    usuario: str = Depends(auth.exigir_aprovador),
) -> dict:
    """Decide uma aprovação pendente e retoma o grafo (Requirements 6.4–6.6).

    Exige sessão e que o usuário seja aprovador (`exigir_aprovador` → 401 sem
    sessão, 403 se não-aprovador). Chama `execucao.decidir_aprovacao`. Se a
    aprovação já foi decidida (ou não existe), o resultado é
    `{"status": "ja_decidida"}`, devolvido com 200 conforme o design
    (Requirement 6.6).
    """
    from _orion import execucao

    return execucao.decidir_aprovacao(aprovacao_id, usuario, decisao.aprovado)


@app.post("/api/aprovacoes/{aprovacao_id}/retomar")
def retomar_aprovacao(
    aprovacao_id: int,
    usuario: str = Depends(auth.exigir_aprovador),
) -> dict:
    """Tenta de novo uma aprovação cuja retomada falhou (status `erro`).

    Só aprovadores. Usa a decisão já gravada. Se a aprovação não estiver com
    `erro`, responde 409.
    """
    from _orion import execucao

    resultado = execucao.retomar_aprovacao(aprovacao_id)
    if resultado.get("status") == "nao_retomavel":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só dá para tentar de novo aprovações que falharam.",
        )
    return resultado


@app.get("/api/reunioes")
def listar_reunioes(
    usuario: str = Depends(auth.usuario_atual),
) -> list[dict]:
    """Próximas reuniões (início a partir de agora), ordenadas por início.

    Exige sessão.
    """
    return db.proximas_reunioes()


@app.get("/api/reunioes/{reuniao_id}.ics")
def reuniao_ics(
    reuniao_id: int, usuario: str = Depends(auth.usuario_atual)
) -> Response:
    """Arquivo iCalendar (.ics) de uma reunião (Requirement 6.4).

    Gera um VCALENDAR/VEVENT simples com UID `reuniao-{id}@orion-hq`, datas em
    UTC (YYYYMMDDTHHMMSSZ), SUMMARY = título e DESCRIPTION = pauta (um item por
    linha). Content-type `text/calendar`. Reunião inexistente → 404. Exige
    sessão.
    """
    linha = db.reuniao(reuniao_id)
    if linha is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reunião não encontrada."
        )
    conteudo = _montar_ics(linha)
    return Response(content=conteudo, media_type="text/calendar")


def _montar_ics(reuniao: dict) -> str:
    """Monta o texto iCalendar (VCALENDAR/VEVENT) de uma reunião.

    Datas em UTC no formato `YYYYMMDDTHHMMSSZ`. A pauta (`text[]`) vira o
    DESCRIPTION com os itens separados por `\\n` (escapado como `\\n` literal no
    iCalendar). Linhas com CRLF, conforme a especificação do formato.
    """
    from _orion.grafo import _formato_utc

    reuniao_id = reuniao["id"]
    titulo = str(reuniao.get("titulo") or "Reunião")
    inicio = reuniao["inicio"]
    fim = reuniao["fim"]
    pauta = reuniao.get("pauta") or []
    if isinstance(pauta, (list, tuple)):
        descricao = "\\n".join(str(item) for item in pauta)
    else:
        descricao = str(pauta)

    # Timestamp de criação do evento (agora em UTC).
    carimbo = _formato_utc(config.agora())

    linhas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Orion HQ//PT-BR//",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:reuniao-{reuniao_id}@orion-hq",
        f"DTSTAMP:{carimbo}",
        f"DTSTART:{_formato_utc(inicio)}",
        f"DTEND:{_formato_utc(fim)}",
        f"SUMMARY:{titulo}",
        f"DESCRIPTION:{descricao}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(linhas) + "\r\n"


def _documento_ou_404(documento: dict | None) -> dict:
    if documento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado.",
        )
    return documento


def _invalido(erro: ValueError) -> HTTPException:
    return HTTPException(
        status_code=422, detail=str(erro)
    )


@app.get("/api/documentos")
def listar_documentos(
    q: str | None = None,
    pasta: str | None = None,
    tag: str | None = None,
    arquivados: bool = False,
    usuario: str = Depends(auth.usuario_atual),
) -> list[dict]:
    """Lista ou busca documentos (Docs — Requirements 3.1–3.3, 4).

    Com `q`, busca em título e conteúdo (full-text em português, fallback ILIKE);
    `pasta`/`tag` filtram a listagem normal. Arquivados só com `arquivados=true`.
    """
    if q and q.strip():
        return documentos.buscar(q, arquivados)
    return documentos.listar(pasta, tag, arquivados)


@app.get("/api/documentos/pastas")
def pastas_documentos(usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Pastas e tags existentes, para os filtros da tela."""
    return documentos.pastas_e_tags()


@app.get("/api/documentos/arvore")
def arvore_documentos(usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    """Documentos não arquivados com pai e pasta, para a árvore e o seletor de página pai."""
    return documentos.arvore()


@app.post("/api/documentos", status_code=status.HTTP_201_CREATED)
def criar_documento(
    corpo: DocumentoNovo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    """Cria um documento (Docs — Requirements 1.1–1.3, 1.5)."""
    try:
        return documentos.criar(
            corpo.titulo, corpo.conteudo, corpo.pasta, corpo.tags, usuario, corpo.pai_id
        )
    except ValueError as erro:
        raise _invalido(erro)


@app.get("/api/documentos/{documento_id}")
def detalhe_documento(
    documento_id: int, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    """Documento completo, com ancestrais e subpáginas (404 se não existir)."""
    documento = _documento_ou_404(documentos.obter(documento_id))
    documento["ancestrais"] = documentos.ancestrais(documento_id)
    documento["subpaginas"] = documentos.subpaginas(documento_id)
    return documento


@app.put("/api/documentos/{documento_id}")
def editar_documento(
    documento_id: int,
    corpo: DocumentoEdicao,
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Edita o documento; título/conteúdo alterados geram versão (Requirement 2.1)."""
    try:
        editado = documentos.editar(
            documento_id, corpo.model_dump(exclude_unset=True), usuario
        )
    except ValueError as erro:
        raise _invalido(erro)
    return _documento_ou_404(editado)


@app.post("/api/documentos/{documento_id}/arquivar")
def arquivar_documento(
    documento_id: int,
    corpo: ArquivarDocumento,
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Arquiva ou desarquiva (não há exclusão definitiva — Requirement 3.4)."""
    return _documento_ou_404(documentos.arquivar(documento_id, corpo.arquivado))


class OrdemCorpo(BaseModel):
    direcao: str


class MoverCorpo(BaseModel):
    pai_id: int | None = None
    posicao: int = 0


class ComentarioCorpo(BaseModel):
    texto: str


@app.post("/api/documentos/{documento_id}/ordem")
def mover_documento(
    documento_id: int, corpo: OrdemCorpo, usuario: str = Depends(auth.usuario_atual)
) -> list[int]:
    """Sobe ou desce a página entre as irmãs (`cima`/`baixo`). Devolve os ids na nova ordem."""
    try:
        ids = documentos.mover_subpagina(documento_id, corpo.direcao)
    except ValueError as erro:
        raise _invalido(erro)
    _documento_ou_404({} if ids is not None else None)
    return ids or []


@app.post("/api/documentos/{documento_id}/mover")
def mover_documento_na_arvore(
    documento_id: int, corpo: MoverCorpo, usuario: str = Depends(auth.usuario_atual)
) -> list[int]:
    """Move a página para outra página pai (ou o topo) numa posição entre as irmãs (árvore do Docs)."""
    try:
        ids = documentos.mover(documento_id, corpo.pai_id, corpo.posicao)
    except ValueError as erro:
        raise _invalido(erro)
    _documento_ou_404({} if ids is not None else None)
    return ids or []


@app.get("/api/documentos/{documento_id}/comentarios")
def listar_comentarios(documento_id: int, usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    _documento_ou_404(documentos.obter(documento_id))
    return documentos.comentarios(documento_id)


@app.post("/api/documentos/{documento_id}/comentarios", status_code=status.HTTP_201_CREATED)
def criar_comentario(
    documento_id: int, corpo: ComentarioCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    try:
        return _documento_ou_404(documentos.comentar(documento_id, corpo.texto, usuario))
    except ValueError as erro:
        raise _invalido(erro)


@app.delete("/api/documentos/comentarios/{comentario_id}")
def excluir_comentario(comentario_id: int, usuario: str = Depends(auth.usuario_atual)) -> dict:
    resultado = documentos.excluir_comentario(comentario_id, usuario)
    if resultado == "nao_encontrado":
        raise HTTPException(status_code=404, detail="Comentário não encontrado.")
    if resultado == "proibido":
        raise HTTPException(status_code=403, detail="Só quem escreveu pode apagar o comentário.")
    return {"ok": True}


@app.get("/api/mencoes")
def minhas_mencoes(usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    """Comentários recentes de outras pessoas que citam o usuário (@usuario)."""
    return documentos.mencoes_para(usuario)


@app.get("/api/documentos/{documento_id}/versoes")
def versoes_documento(
    documento_id: int, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Versões do documento, da mais recente para a mais antiga (sem conteúdo)."""
    _documento_ou_404(documentos.obter(documento_id))
    return documentos.versoes(documento_id)


@app.get("/api/documentos/{documento_id}/versoes/{versao_id}")
def detalhe_versao_documento(
    documento_id: int,
    versao_id: int,
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Uma versão completa, com conteúdo."""
    versao = documentos.versao(documento_id, versao_id)
    if versao is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Versão não encontrada."
        )
    return versao


@app.post("/api/documentos/{documento_id}/versoes/{versao_id}/restaurar")
def restaurar_versao_documento(
    documento_id: int,
    versao_id: int,
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Restaura uma versão como nova edição (Requirement 2.4)."""
    restaurado = documentos.restaurar(documento_id, versao_id, usuario)
    if restaurado is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento ou versão não encontrado.",
        )
    return restaurado


# --- Comercial (spec comercial) ---


def _comercial_404(achado: Any, o_que: str = "Registro") -> Any:
    if achado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{o_que} não encontrado.")
    return achado


def _comercial(chamada):
    """Executa `chamada` traduzindo erros de validação (422) e conflitos (409)."""
    try:
        return chamada()
    except ValueError as erro:
        raise _invalido(erro)
    except comercial.ConflitoError as erro:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(erro))


@app.get("/api/busca")
def busca_global(q: str = "", usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Busca global (Ctrl+K): até 5 documentos, negócios, organizações e conversas."""
    q = q.strip()
    if not q:
        return {"documentos": [], "negocios": [], "organizacoes": [], "conversas": []}
    return {
        "conversas": busca.conversas(q),
        "documentos": [
            {"id": d["id"], "titulo": d["titulo"], "pasta": d.get("pasta")}
            for d in documentos.buscar(q)[:5]
        ],
        "negocios": [
            {"id": n["id"], "titulo": n["titulo"], "organizacao": n["organizacao_nome"], "etapa": n["etapa"]}
            for n in comercial.listar_negocios(busca=q)[:5]
        ],
        "organizacoes": [
            {"id": o["id"], "nome": o["nome"], "tipo": o["tipo"]}
            for o in comercial.listar_organizacoes(busca=q)[:5]
        ],
    }


@app.get("/api/comercial/resumo")
def resumo_comercial(usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Números do funil (Comercial — Requirement 4.2)."""
    return comercial.resumo_funil()


@app.get("/api/comercial/hoje")
def hoje_comercial(usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Negócios agrupados por data do próximo passo (Comercial — Requirement 4.1)."""
    return comercial.hoje()


@app.get("/api/comercial/negocios")
def listar_negocios_comercial(
    etapa: str | None = None,
    responsavel: str | None = None,
    q: str | None = None,
    todos: bool = False,
    usuario: str = Depends(auth.usuario_atual),
) -> list[dict]:
    return _comercial(lambda: comercial.listar_negocios(etapa, responsavel, q, todos))


@app.post("/api/comercial/negocios", status_code=status.HTTP_201_CREATED)
def criar_negocio_comercial(
    corpo: NegocioCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    """Cria um negócio numa organização existente ou nova (`organizacao_nome`)."""
    campos = corpo.model_dump(exclude_unset=True)
    nome_org = campos.pop("organizacao_nome", None)
    tipo_org = campos.pop("organizacao_tipo", None) or "clinica"
    org_id = campos.pop("organizacao_id", None)
    if campos.get("responsavel") in (None, ""):
        campos.pop("responsavel", None)

    def criar() -> dict:
        organizacao = org_id
        if organizacao is None:
            if not nome_org:
                raise ValueError("Informe a organização.")
            organizacao = comercial.obter_ou_criar_organizacao(nome_org, tipo_org)["id"]
        return comercial.criar_negocio(organizacao, campos, usuario)

    return _comercial_404(_comercial(criar), "Organização")


@app.get("/api/comercial/negocios/{negocio_id}")
def obter_negocio_comercial(negocio_id: int, usuario: str = Depends(auth.usuario_atual)) -> dict:
    negocio = _comercial_404(comercial.obter_negocio(negocio_id), "Negócio")
    negocio["interacoes"] = comercial.listar_interacoes(negocio_id)
    negocio["contatos"] = comercial.contatos_da(negocio["organizacao_id"])
    return negocio


@app.put("/api/comercial/negocios/{negocio_id}")
def editar_negocio_comercial(
    negocio_id: int, corpo: NegocioCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    campos = corpo.model_dump(exclude_unset=True)
    for fora in ("organizacao_id", "organizacao_nome", "organizacao_tipo", "etapa"):
        campos.pop(fora, None)
    return _comercial_404(_comercial(lambda: comercial.editar_negocio(negocio_id, campos, usuario)), "Negócio")


@app.post("/api/comercial/negocios/{negocio_id}/etapa")
def mover_negocio_comercial(
    negocio_id: int, corpo: EtapaCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(
        _comercial(lambda: comercial.mover_etapa(negocio_id, corpo.etapa, usuario, corpo.motivo_perda)),
        "Negócio",
    )


@app.get("/api/comercial/negocios/{negocio_id}/interacoes")
def listar_interacoes_comercial(
    negocio_id: int, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    _comercial_404(comercial.obter_negocio(negocio_id), "Negócio")
    return comercial.listar_interacoes(negocio_id)


@app.post("/api/comercial/negocios/{negocio_id}/interacoes", status_code=status.HTTP_201_CREATED)
def registrar_interacao_comercial(
    negocio_id: int, corpo: InteracaoCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(
        _comercial(
            lambda: comercial.registrar_interacao(
                negocio_id, corpo.tipo, corpo.resumo, usuario, corpo.ocorrida_em
            )
        ),
        "Negócio",
    )


@app.delete("/api/comercial/interacoes/{interacao_id}")
def excluir_interacao_comercial(
    interacao_id: int, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    resultado = comercial.excluir_interacao(interacao_id)
    if resultado == "nao_encontrada":
        raise HTTPException(status_code=404, detail="Interação não encontrada.")
    if resultado == "do_sistema":
        raise HTTPException(
            status_code=409, detail="Mudanças de etapa são automáticas e não podem ser excluídas."
        )
    return {"status": "excluida"}


class ImportacaoCorpo(BaseModel):
    csv: str


@app.post("/api/comercial/importar")
def importar_comercial(corpo: ImportacaoCorpo, usuario: str = Depends(auth.usuario_atual)) -> dict:
    """Importa organizações/contatos/negócios de uma planilha CSV (texto no corpo)."""
    return _comercial(lambda: comercial.importar_csv(corpo.csv, usuario))


@app.get("/api/comercial/organizacoes")
def listar_organizacoes_comercial(
    arquivadas: bool = False, q: str | None = None, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    return comercial.listar_organizacoes(arquivadas, q)


@app.post("/api/comercial/organizacoes", status_code=status.HTTP_201_CREATED)
def criar_organizacao_comercial(
    corpo: OrganizacaoCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial(lambda: comercial.criar_organizacao(corpo.model_dump(exclude_unset=True)))


@app.get("/api/comercial/organizacoes/{organizacao_id}")
def obter_organizacao_comercial(
    organizacao_id: int, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(comercial.obter_organizacao(organizacao_id), "Organização")


@app.put("/api/comercial/organizacoes/{organizacao_id}")
def editar_organizacao_comercial(
    organizacao_id: int, corpo: OrganizacaoCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    campos = corpo.model_dump(exclude_unset=True)
    return _comercial_404(
        _comercial(lambda: comercial.editar_organizacao(organizacao_id, campos)), "Organização"
    )


@app.post("/api/comercial/organizacoes/{organizacao_id}/arquivar")
def arquivar_organizacao_comercial(
    organizacao_id: int, corpo: ArquivarCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(
        _comercial(lambda: comercial.arquivar_organizacao(organizacao_id, corpo.arquivada)),
        "Organização",
    )


@app.post("/api/comercial/organizacoes/{organizacao_id}/contatos", status_code=status.HTTP_201_CREATED)
def criar_contato_comercial(
    organizacao_id: int, corpo: ContatoCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(
        _comercial(lambda: comercial.criar_contato(organizacao_id, corpo.model_dump(exclude_unset=True))),
        "Organização",
    )


@app.put("/api/comercial/contatos/{contato_id}")
def editar_contato_comercial(
    contato_id: int, corpo: ContatoCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(
        _comercial(lambda: comercial.editar_contato(contato_id, corpo.model_dump(exclude_unset=True))),
        "Contato",
    )


@app.delete("/api/comercial/contatos/{contato_id}")
def excluir_contato_comercial(contato_id: int, usuario: str = Depends(auth.usuario_atual)) -> dict:
    if not comercial.excluir_contato(contato_id):
        raise HTTPException(status_code=404, detail="Contato não encontrado.")
    return {"status": "excluido"}


@app.get("/api/incidentes")
def listar_incidentes(
    status: str | None = None, usuario: str = Depends(auth.usuario_atual)
) -> list[dict]:
    """Lista os incidentes do Vigia (Requirements 6.2, 6.6).

    Com `status` informado, filtra por ele; sem filtro, devolve os `aberto`
    primeiro e o restante por `ultima_vez` mais recente. Não traz o
    `diagnostico` (pesado); use o detalhe para isso. Exige sessão (Requirement
    6.6).
    """
    return db.listar_incidentes(status)


@app.get("/api/incidentes/resumo")
def resumo_incidentes(
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Contador de incidentes `aberto` (Requirements 6.1, 6.6, 7.1).

    Alimenta o contador do cabeçalho e a luz de alerta da guarita no
    escritório. Devolve `{"abertos": n}`. Exige sessão.
    """
    return {"abertos": db.contar_incidentes_abertos()}


@app.get("/api/incidentes/{incidente_id}")
def detalhe_incidente(
    incidente_id: int, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    """Detalhe de um incidente, com diagnóstico (Requirements 6.3, 6.6).

    Incidente inexistente → 404. Exige sessão.
    """
    linha = db.incidente(incidente_id)
    if linha is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incidente não encontrado.",
        )
    return linha


@app.post("/api/incidentes/{incidente_id}/status")
def mudar_status_incidente(
    incidente_id: int,
    corpo: StatusIncidente,
    usuario: str = Depends(auth.usuario_atual),
) -> dict:
    """Muda o status de um incidente (Requirements 6.4, 6.6).

    Aceita apenas `resolvido`, `ignorado` ou `aberto` (o `diagnosticado` é
    definido pelo fluxo de diagnóstico, não pelo botão) — outro valor → 400.
    Incidente inexistente → 404. Exige sessão.
    """
    if corpo.status not in _STATUS_INCIDENTE_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status inválido. Use resolvido, ignorado ou aberto.",
        )
    atualizado = db.atualizar_status_incidente(incidente_id, corpo.status)
    if atualizado is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incidente não encontrado.",
        )
    return atualizado


@app.post("/api/incidentes/{incidente_id}/diagnosticar")
def diagnosticar_incidente(
    incidente_id: int, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    """Diagnóstico manual de um incidente na fila (Requirements 6.4, 6.6).

    O botão "Diagnosticar agora" da tela chama esta rota para incidentes que
    ficaram `aberto` sem diagnóstico (por causa do limite por hora). Exige
    sessão.

    Fluxo:
    1. Incidente inexistente → 404.
    2. `vigia.diagnosticar` já respeita o limite por hora internamente
       (Requirement 4): acima do limite devolve `{"status": "fila"}` sem chamar
       o modelo. A rota apenas repassa o resultado — não força o diagnóstico
       ignorando o limite.

    Import tardio de `vigia` para não exigir httpx/modelo em quem só importa o
    app (ex.: testes de outras rotas).
    """
    if db.incidente(incidente_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incidente não encontrado.",
        )

    from _orion import vigia

    return vigia.diagnosticar(incidente_id)


@app.post("/api/webhooks/github")
async def webhook_github(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
) -> dict:
    """Ingestão de PR mergeado do GitHub (Requirement 5).

    Rota pública (sem sessão): a autenticidade vem da assinatura HMAC do corpo.

    Fluxo:
    1. Lê o corpo BRUTO e valida `X-Hub-Signature-256` com
       `GITHUB_WEBHOOK_SECRET`; inválida → 401 (Requirement 5.2).
    2. Só processa `pull_request` com `action=closed` e `merged=true`; qualquer
       outro evento é ignorado com 200 `{"ignorado": true}` (Requirement 5.7).
    3. Delega ao `_orion.github.processar_pr` (busca arquivos, resume no worker,
       upsert no changelog, aviso no chat + atividades do agente `work`). PR já
       registrado ou sem `GITHUB_TOKEN` → 200 sem resumir; falha → 502.

    Import tardio de `github` para não exigir httpx/modelo em quem só importa o
    app (ex.: testes de outras rotas).
    """
    from _orion import github

    corpo_bruto = await request.body()

    if not github.assinatura_valida(corpo_bruto, x_hub_signature_256):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Assinatura do webhook inválida.",
        )

    import json

    try:
        corpo = json.loads(corpo_bruto or b"{}")
    except (ValueError, TypeError):
        corpo = {}

    if not github._e_pr_mergeado(x_github_event, corpo):
        return {"ignorado": True}

    try:
        return github.processar_pr(corpo)
    except Exception:  # noqa: BLE001 — já virou atividade `erro` e log no servidor
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao processar o PR.",
        )


@app.post("/api/webhooks/sentry")
async def webhook_sentry(
    request: Request,
    sentry_hook_resource: str | None = Header(default=None),
    sentry_hook_signature: str | None = Header(default=None),
) -> dict:
    """Ingestão de eventos de erro do Sentry (Vigia — Requirement 1).

    Rota pública (sem sessão): a autenticidade vem da assinatura HMAC do corpo,
    no mesmo padrão do webhook do GitHub.

    Fluxo:
    1. Lê o corpo BRUTO e valida `Sentry-Hook-Signature` com
       `SENTRY_CLIENT_SECRET`; assinatura inválida/ausente ou segredo vazio →
       401 (Requirements 1.1, 1.2).
    2. Desserializa o JSON de forma tolerante: payload malformado NUNCA pode dar
       500 (o Sentry reenviaria em loop); vira `{"ignorado": true}` (design,
       "Error Handling").
    3. `sentry.interpretar_payload` aplica a whitelist e a máscara. Recurso
       desconhecido ou sem `sentry_issue_id` → 200 `{"ignorado": true}`
       (Requirement 1.5).
    4. `sentry.processar_evento` registra/atualiza o incidente. Ações fora de
       `created`/`resolved`/`ignored` e do recurso `event_alert` são ignoradas
       com 200 `{"ignorado": true}` (Requirement 1.5).

    Import tardio de `sentry` para não exigir dependências pesadas em quem só
    importa o app (ex.: testes de outras rotas).
    """
    from _orion import sentry

    corpo_bruto = await request.body()

    if not sentry.verificar_assinatura(corpo_bruto, sentry_hook_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Assinatura do webhook inválida.",
        )

    import json

    # Parser tolerante: payload malformado responde 200 `{"ignorado": true}`,
    # nunca 500, para o Sentry não reenviar em loop.
    try:
        corpo = json.loads(corpo_bruto or b"{}")
    except (ValueError, TypeError):
        corpo = {}
    if not isinstance(corpo, dict):
        corpo = {}

    campos = sentry.interpretar_payload(sentry_hook_resource, corpo)
    if campos is None:
        return {"ignorado": True}

    resultado = sentry.processar_evento(campos)

    if resultado.get("resultado") == "ignorado":
        return {"ignorado": True}

    # Task 4.5: incidente NOVO e registrado dispara o diagnóstico do Rui, no
    # mesmo estilo síncrono da ingestão do GitHub (design.md, o Vigia é um fluxo
    # síncrono na mesma função da Vercel). Só incidente NOVO: eventos repetidos
    # vêm com `novo=False` (dedup do upsert, Requirement 1.6) e não re-disparam.
    # `vigia.diagnosticar` já respeita o limite por hora internamente (retorna
    # `{"status": "fila"}` acima do limite), então NÃO checamos o limite aqui.
    #
    # A resposta ao Sentry é sempre o `resultado` do registro (200): o incidente
    # já foi gravado. Uma falha no diagnóstico não pode alterar essa resposta
    # nem virar 500 (o Sentry reenviaria em loop). `diagnosticar` não propaga
    # exceções (devolve dict), mas envolvemos a chamada em try/except defensivo
    # mesmo assim, apenas logando e seguindo.
    if resultado.get("resultado") == "registrado" and resultado.get("novo"):
        from _orion import vigia

        try:
            vigia.diagnosticar(resultado["id"])
        except Exception:  # noqa: BLE001 — falha no diagnóstico não afeta a resposta
            logging.getLogger("orion.webhook").exception(
                "Falha ao disparar diagnóstico do incidente %s", resultado.get("id")
            )

    return resultado


@app.get("/api/cron/resumo-semanal")
def cron_resumo_semanal(
    authorization: str | None = Header(default=None),
) -> dict:
    """Resumo semanal disparado pelo Vercel Cron (Requirement 10).

    Rota pública quanto à sessão, protegida por `Authorization: Bearer
    <CRON_SECRET>` (a Vercel envia esse cabeçalho — Requirement 10.2). Sem o
    header, com formato errado ou segredo diferente → 401.

    Import tardio de `resumo` para não exigir o modelo em quem só importa o app.
    """
    esperado = config.cron_secret()
    fornecido = ""
    if authorization and authorization.startswith("Bearer "):
        fornecido = authorization[len("Bearer "):]

    if not esperado or not secrets.compare_digest(fornecido, esperado):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autorizado.",
        )

    from _orion import resumo

    return resumo.resumo_semanal()


@app.get("/api/saude")
def saude() -> dict:
    """Verificação de saúde pública (sem autenticação).

    Informa se o banco está acessível. Enquanto os helpers de banco não
    existem (`_orion.db`), a checagem degrada de forma silenciosa para `False`
    em vez de derrubar a rota.
    """
    banco = _banco_acessivel()
    return {"ok": True, "banco": banco}


def _banco_acessivel() -> bool:
    """Tenta um `SELECT 1` no Postgres. Nunca lança."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        return False
    try:
        import psycopg

        with psycopg.connect(
            url, autocommit=True, prepare_threshold=None, connect_timeout=3
        ) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


# --- piloto (checklist), anexos, backup e busca global ---


class ItemPilotoCorpo(BaseModel):
    texto: str


class ItemFeitoCorpo(BaseModel):
    feito: bool


@app.get("/api/comercial/parados")
def listar_parados(usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    """Negócios abertos sem movimento há mais de 7 dias (mais antigos primeiro)."""
    return comercial.parados()


@app.get("/api/comercial/pilotos")
def listar_pilotos(usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    """Negócios em piloto, com dias desde o início e andamento do checklist."""
    return comercial.pilotos()


@app.get("/api/comercial/negocios/{negocio_id}/piloto")
def checklist_piloto(negocio_id: int, usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    return _comercial_404(comercial.itens_piloto(negocio_id), "Negócio")


@app.post("/api/comercial/negocios/{negocio_id}/piloto", status_code=status.HTTP_201_CREATED)
def adicionar_item_piloto(
    negocio_id: int, corpo: ItemPilotoCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(_comercial(lambda: comercial.adicionar_item_piloto(negocio_id, corpo.texto)), "Negócio")


@app.put("/api/comercial/piloto/{item_id}")
def marcar_item_piloto(
    item_id: int, corpo: ItemFeitoCorpo, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    return _comercial_404(comercial.marcar_item_piloto(item_id, corpo.feito, usuario), "Item")


@app.delete("/api/comercial/piloto/{item_id}")
def remover_item_piloto(item_id: int, usuario: str = Depends(auth.usuario_atual)) -> dict:
    _comercial_404(True if comercial.remover_item_piloto(item_id) else None, "Item")
    return {"ok": True}


@app.get("/api/anexos")
def listar_anexos(entidade: str, id: int, usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    if entidade not in anexos.ENTIDADES:
        raise HTTPException(status_code=422, detail="Tipo de item inválido.")
    return anexos.listar(entidade, id)


@app.post("/api/anexos", status_code=status.HTTP_201_CREATED)
async def enviar_anexo(
    request: Request, entidade: str, id: int, nome: str, usuario: str = Depends(auth.usuario_atual)
) -> dict:
    """Recebe o arquivo no corpo da requisição (bytes crus); nome e dono vão na query."""
    tamanho = request.headers.get("content-length")
    if tamanho and tamanho.isdigit() and int(tamanho) > anexos.TAMANHO_MAX + 1024:
        raise HTTPException(status_code=422, detail="O arquivo é grande demais (máximo 8 MB).")
    dados = await request.body()
    try:
        criado = anexos.criar(entidade, id, nome, dados, usuario)
    except ValueError as erro:
        raise _invalido(erro)
    return _comercial_404(criado, "Item")


@app.get("/api/anexos/{anexo_id}")
def baixar_anexo(anexo_id: int, usuario: str = Depends(auth.usuario_atual)) -> Response:
    from urllib.parse import quote

    anexo = _comercial_404(anexos.obter(anexo_id), "Anexo")
    modo = "inline" if anexo["tipo"] in anexos.INLINE else "attachment"
    return Response(
        content=anexo["conteudo"],
        media_type=anexo["tipo"],
        headers={
            "Content-Disposition": f"{modo}; filename*=UTF-8''{quote(anexo['nome'])}",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
            "Cache-Control": "private, max-age=0",
        },
    )


@app.delete("/api/anexos/{anexo_id}")
def excluir_anexo(anexo_id: int, usuario: str = Depends(auth.usuario_atual)) -> dict:
    _comercial_404(True if anexos.excluir(anexo_id) else None, "Anexo")
    return {"ok": True}


@app.get("/api/backup")
def baixar_backup(anexos_incluidos: bool = True, usuario: str = Depends(auth.usuario_atual)) -> Response:
    """Baixa tudo (Docs, Comercial, conversas, anexos) num arquivo JSON."""
    dia = config.agora().strftime("%Y-%m-%d")
    return Response(
        content=backup.como_json(anexos_incluidos),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="orion-hq-backup-{dia}.json"'},
    )


# --- tarefas (quadro Kanban por pessoa) ---


class TarefaCorpo(BaseModel):
    titulo: str | None = None
    descricao: str | None = None
    prioridade: str | None = None
    responsavel: str | None = None
    prazo: str | None = None


class MoverTarefaCorpo(BaseModel):
    status: str
    posicao: int | None = None


@app.get("/api/usuarios")
def listar_usuarios(usuario: str = Depends(auth.usuario_atual)) -> list[str]:
    """Nomes das pessoas do HQ (nunca as senhas), para as abas e o seletor de responsável."""
    return sorted(config.usuarios())


@app.get("/api/tarefas")
def listar_tarefas(responsavel: str | None = None, usuario: str = Depends(auth.usuario_atual)) -> list[dict]:
    return tarefas.listar(responsavel)


@app.get("/api/tarefas/resumo")
def resumo_tarefas(usuario: str = Depends(auth.usuario_atual)) -> dict:
    return tarefas.resumo_por_pessoa()


@app.post("/api/tarefas", status_code=status.HTTP_201_CREATED)
def criar_tarefa(corpo: TarefaCorpo, usuario: str = Depends(auth.usuario_atual)) -> dict:
    return _comercial(lambda: tarefas.criar(corpo.model_dump(exclude_unset=True), usuario))


@app.put("/api/tarefas/{tarefa_id}")
def editar_tarefa(tarefa_id: int, corpo: TarefaCorpo, usuario: str = Depends(auth.usuario_atual)) -> dict:
    return _comercial_404(
        _comercial(lambda: tarefas.editar(tarefa_id, corpo.model_dump(exclude_unset=True))), "Tarefa"
    )


@app.post("/api/tarefas/{tarefa_id}/mover")
def mover_tarefa(tarefa_id: int, corpo: MoverTarefaCorpo, usuario: str = Depends(auth.usuario_atual)) -> dict:
    return _comercial_404(_comercial(lambda: tarefas.mover(tarefa_id, corpo.status, corpo.posicao)), "Tarefa")


@app.delete("/api/tarefas/{tarefa_id}")
def excluir_tarefa(tarefa_id: int, usuario: str = Depends(auth.usuario_atual)) -> dict:
    _comercial_404(True if tarefas.excluir(tarefa_id) else None, "Tarefa")
    return {"ok": True}
