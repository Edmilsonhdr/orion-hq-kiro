"""Popula TODAS as telas do HQ com dados realistas, para gravar vídeo/demonstração.

ATENÇÃO: apaga e recria os dados de trabalho (documentos, Comercial, tarefas, conversas, aprovações,
incidentes, reuniões, atividades, anexos…). Não mexe em usuários nem nas tabelas do LangGraph.
Por segurança só roda com `--aplicar`, e recusa bancos que pareçam de produção (Neon) sem `--forcar`.

    .venv/bin/python scripts/seed_filmagem.py                # só descreve o que faria
    .venv/bin/python scripts/seed_filmagem.py --aplicar

Para o Escritório mostrar os agentes trabalhando (ele só anima atividade com menos de 30 s), rode logo
antes de filmar:  .venv/bin/python scripts/seed_demo.py

Todos os nomes, e-mails e telefones são fictícios; nenhum dado de saúde de pessoas.
"""

from __future__ import annotations

import argparse
import os
import shutil
import struct
import sys
import tempfile
import zlib
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

RAIZ = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, str(RAIZ / "api"))

from psycopg.types.json import Json  # noqa: E402

from _orion import (  # noqa: E402
    anexos,
    comercial,
    config,
    conversas,
    db,
    documentos,
    importacao,
    tarefas,
)

TABELAS_LIMPAR = (
    "anexos", "tarefas", "tarefa_colunas", "piloto_itens", "interacoes", "negocios", "contatos",
    "organizacoes", "documento_comentarios", "documento_versoes", "documentos", "mensagens", "conversas",
    "atividades", "aprovacoes", "reunioes", "incidentes", "changelog", "presenca", "login_tentativas",
)


# --- utilidades -------------------------------------------------------------------------------


def hoje() -> date:
    return config.agora().date()


def dia(offset: int) -> str:
    return (hoje() + timedelta(days=offset)).isoformat()


def atras(*, dias: int = 0, horas: int = 0, minutos: int = 0) -> datetime:
    return config.agora() - timedelta(days=dias, hours=horas, minutes=minutos)


def limpar() -> None:
    for tabela in TABELAS_LIMPAR:
        db.executar(f"delete from {tabela}")
    for sequencia in ("documentos", "negocios", "organizacoes", "tarefas", "conversas", "aprovacoes", "incidentes"):
        db.executar(f"alter sequence if exists {sequencia}_id_seq restart with 1")


def png_degrade(largura: int = 360, altura: int = 200) -> bytes:
    """PNG simples (degradê azul) para o anexo de exemplo, sem depender de bibliotecas de imagem."""
    linhas = bytearray()
    for y in range(altura):
        linhas.append(0)
        for x in range(largura):
            linhas += bytes((20 + x * 60 // largura, 40 + y * 100 // altura, 120 + x * 120 // largura))

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        corpo = tipo + dados
        return struct.pack(">I", len(dados)) + corpo + struct.pack(">I", zlib.crc32(corpo) & 0xFFFFFFFF)

    cabecalho = struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", cabecalho) + bloco(b"IDAT", zlib.compress(bytes(linhas))) + bloco(b"IEND", b"")


def pdf_simples(titulo: str, linhas: list[str]) -> bytes:
    """PDF de uma página com texto (válido; abre em qualquer leitor)."""
    texto = [f"BT /F1 20 Tf 60 780 Td ({titulo}) Tj ET"]
    for i, linha in enumerate(linhas):
        texto.append(f"BT /F1 12 Tf 60 {740 - i * 22} Td ({linha}) Tj ET")
    fluxo = "\n".join(texto).encode("latin-1", "replace")
    objetos = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length " + str(len(fluxo)).encode() + b">>\nstream\n" + fluxo + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    saida = bytearray(b"%PDF-1.4\n")
    posicoes = []
    for n, obj in enumerate(objetos, 1):
        posicoes.append(len(saida))
        saida += f"{n} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(saida)
    saida += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode()
    for p in posicoes:
        saida += f"{p:010d} 00000 n \n".encode()
    saida += f"trailer\n<</Size {len(objetos) + 1}/Root 1 0 R>>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(saida)


# --- documentos -------------------------------------------------------------------------------


def seed_documentos() -> dict[str, int]:
    """Modelos do projeto (docs/) + documentos de trabalho com subpáginas, comentários e versões."""
    with tempfile.TemporaryDirectory() as tmp:
        for origem, pasta in (("comercial", "Comercial"), ("recursos", "Recursos do Orion HQ")):
            destino = Path(tmp) / pasta
            destino.mkdir()
            for arquivo in sorted((RAIZ / "docs" / origem).glob("*.md")):
                shutil.copy(arquivo, destino / arquivo.name)
        importacao.importar(Path(tmp), True, "jullyana", "modelo")

    ids: dict[str, int] = {}

    def criar(chave: str, titulo: str, conteudo: str, pasta: Optional[str], tags: list[str], autor: str, pai: Optional[str] = None, dias: int = 0, horas: int = 0) -> int:
        d = documentos.criar(titulo, conteudo, pasta=pasta, tags=tags, autor=autor, pai_id=ids.get(pai) if pai else None)
        ids[chave] = d["id"]
        quando = atras(dias=dias, horas=horas)
        db.executar("update documentos set criado_em = %s, atualizado_em = %s where id = %s", (quando - timedelta(days=2), quando, d["id"]))
        return d["id"]

    criar(
        "reuniao", "Reunião semanal do time",
        """# Reunião semanal do time

Toda segunda, às 9h30. Duração máxima: 30 minutos.

## Pauta fixa

1. Funil comercial: o que andou e o que travou
2. Pilotos em andamento
3. Bloqueios do time
4. Próximos passos de cada uma

## Combinados da semana

- [x] Revisar o modelo de proposta com os novos pacotes
- [x] Cadastrar os leads do evento no Comercial
- [ ] Fechar a proposta do Studio Movimento
- [ ] Gravar o vídeo curto de demonstração

> Dica: registre o que combinamos como tarefa no quadro, com responsável e prazo.
""",
        "Rotina", ["rotina", "time"], "dimi", dias=1,
    )
    criar(
        "vitalis", "Piloto Clínica Vitalis",
        """# Piloto Clínica Vitalis

Clínica de nutrição em Campinas, 6 nutricionistas. Piloto de 30 dias com o pacote **Completo**.

## Objetivo

Validar se o Orion reduz o tempo que a equipe gasta com acompanhamento e retorno de pacientes.

## Cronograma

| Semana | O que acontece | Responsável |
| --- | --- | --- |
| 1 | Treinamento da equipe e criação dos acessos | Jullyana |
| 2 | Primeira semana de uso acompanhada | Jullyana |
| 3 | Coleta de feedback e ajustes | Dimi |
| 4 | Decisão: continuar ou encerrar | Dimi e Jullyana |

## Combinados

- Reunião de acompanhamento toda sexta, 15h
- Canal direto no WhatsApp para dúvidas
- Nenhum dado de saúde de pessoas entra no HQ: só dados comerciais

Veja também [[Checklist e acompanhamento do piloto]] e [[Objeções e respostas]].
""",
        "Comercial", ["piloto", "vitalis"], "jullyana", dias=2, horas=3,
    )
    criar(
        "vitalis_feedback", "Feedback da primeira semana", """# Feedback da primeira semana

- A equipe gostou do resumo automático do dia
- Dúvida recorrente: como importar a lista de pacientes (resolvido com o guia de importação)
- Pedido: lembrete de retorno mais visível

**Nota geral:** 8,5 de 10. Próximo passo: reunião de sexta para fechar ajustes.
""",
        "Comercial", ["piloto", "feedback"], "jullyana", pai="vitalis", dias=0, horas=5,
    )
    criar(
        "vitalis_agenda", "Agenda de treinamento", """# Agenda de treinamento

**Terça, 10h:** visão geral do Orion para toda a equipe (45 min)
**Quarta, 14h:** treino prático com as nutricionistas (1h)
**Quinta, 9h:** dúvidas e ajustes (30 min)

Material: apresentação curta + roteiro de demonstração.
""",
        "Comercial", ["piloto", "treinamento"], "jullyana", pai="vitalis", dias=4,
    )
    criar(
        "concorrentes", "Pesquisa de concorrentes",
        """# Pesquisa de concorrentes

Levantamento inicial de soluções usadas por clínicas e profissionais autônomos de nutrição e educação física.

## Comparativo rápido

| Solução | Pontos fortes | Pontos fracos |
| --- | --- | --- |
| Planilhas | Gratuito, flexível | Sem automação, difícil de escalar |
| Sistemas de agenda | Marcação online | Não acompanha o paciente no dia a dia |
| Apps genéricos de saúde | Boa base de usuários | Pouco foco no profissional |

## Nosso diferencial

- Acompanhamento diário com apoio de IA
- Fala a língua do profissional e da clínica
- Implantação rápida com piloto de 30 dias
""",
        "Mercado", ["pesquisa", "mercado"], "rayssa", dias=3, horas=2,
    )
    criar(
        "onboarding", "Guia de onboarding de clientes",
        """# Guia de onboarding de clientes

1. Reunião de kickoff (30 min)
2. Criação dos acessos da equipe
3. Importação dos contatos (planilha CSV)
4. Treinamento prático
5. Acompanhamento semanal nas 4 primeiras semanas

## Materiais

- Roteiro de demonstração
- [[Checklist e acompanhamento do piloto]]
- Vídeo curto de apresentação (em produção)
""",
        "Operação", ["onboarding", "guia"], "dimi", dias=6,
    )
    criar(
        "precos", "Política de preços e pacotes",
        """# Política de preços e pacotes

Valores e condições **sempre confirmados pelos sócios** antes de enviar qualquer proposta.

| Pacote | Para quem | O que inclui |
| --- | --- | --- |
| Essencial | Profissionais autônomos | Acompanhamento diário e relatórios |
| Completo | Clínicas e empresas | Tudo do Essencial, equipe e painel da clínica |

Descontos só com aprovação de duas pessoas do time.
""",
        "Comercial", ["preços", "pacotes"], "dimi", dias=5,
    )

    # Versões: edita dois documentos (guarda o histórico) e volta as datas.
    documentos.editar(ids["precos"], {"conteudo": documentos.obter(ids["precos"])["conteudo"] + "\nAtualizado após a conversa com a Clínica NutriVida.\n"}, "jullyana")
    documentos.editar(ids["reuniao"], {"conteudo": documentos.obter(ids["reuniao"])["conteudo"].replace("30 minutos", "30 minutos, sem exceção")}, "dimi")
    for chave, h in (("precos", 20), ("reuniao", 30)):
        db.executar("update documentos set atualizado_em = %s where id = %s", (atras(horas=h), ids[chave]))

    # Comentários, com menções que aparecem no Início de cada pessoa.
    documentos.comentar(ids["vitalis"], "@jullyana a Vitalis confirmou o treinamento para terça. Pode revisar a agenda?", "dimi")
    documentos.comentar(ids["vitalis"], "Revisei a agenda e já avisei a equipe. @dimi vale incluir a reunião de sexta no calendário.", "jullyana")
    documentos.comentar(ids["concorrentes"], "@dimi @jullyana terminei o comparativo. Falta incluir os sistemas de agenda das clínicas maiores.", "rayssa")
    documentos.comentar(ids["precos"], "@rayssa pode conferir se a tabela está igual à da apresentação?", "jullyana")
    documentos.comentar(ids["reuniao"], "Combinado! @rayssa @jullyana vamos registrar tudo como tarefa no quadro.", "dimi")

    # Ordem manual das subpáginas já vem pela criação; a árvore mostra a Vitalis com 2 filhas.
    for titulo in ("Objeções e respostas", "Modelo de proposta comercial", "Roteiro de descoberta e demonstração", "Checklist e acompanhamento do piloto"):
        achado = db.um("select id from documentos where titulo = %s", (titulo,))
        if achado:
            ids[titulo] = achado["id"]
    return ids


# --- comercial --------------------------------------------------------------------------------

Etapas = ("lead", "contato", "demonstracao", "piloto", "proposta", "ganho", "perdido")


def seed_comercial(docs: dict[str, int]) -> dict[str, int]:
    """Organizações, contatos e negócios em todas as etapas, com histórico, parados e pilotos."""
    negocios: dict[str, int] = {}

    def org(nome: str, tipo: str, area: str, cidade: str, contatos: list[tuple[str, str, str, str]]) -> int:
        o = comercial.criar_organizacao({"nome": nome, "tipo": tipo, "area": area, "cidade": cidade})
        for n, cargo, email, tel in contatos:
            comercial.criar_contato(o["id"], {"nome": n, "cargo": cargo, "email": email, "telefone": tel})
        return o["id"]

    def negocio(
        chave: str, org_id: int, titulo: str, etapa: str, responsavel: str, dias_criado: int,
        valor: Optional[float] = None, pacientes: Optional[int] = None, plano: Optional[str] = None,
        usa: Optional[str] = None, origem: Optional[str] = None, passo: Optional[str] = None,
        passo_em: Optional[int] = None, parado_dias: Optional[int] = None, dias_na_etapa: int = 0,
        perda: Optional[str] = None, historico: Optional[list[tuple[int, str, str, str]]] = None,
    ) -> int:
        n = comercial.criar_negocio(org_id, {
            "titulo": titulo, "valor_mensal": valor, "pacientes_ativos": pacientes, "plano_interesse": plano,
            "usa_hoje": usa, "origem": origem, "proximo_passo": passo,
            "proximo_passo_em": dia(passo_em) if passo_em is not None else None, "responsavel": responsavel,
        }, responsavel)
        assert n is not None
        nid = n["id"]
        negocios[chave] = nid
        # trilha de etapas até a atual, datada
        caminho = Etapas[: Etapas.index(etapa) + 1] if etapa not in ("ganho", "perdido") else (*Etapas[:5], etapa)
        if etapa == "perdido":
            caminho = (*Etapas[:3], "perdido")
        passos = len(caminho) - 1
        db.executar("update interacoes set ocorrida_em = %s, criado_em = %s where negocio_id = %s", (atras(dias=dias_criado), atras(dias=dias_criado), nid))
        for i in range(passos):
            quando = atras(dias=max(dias_na_etapa, dias_criado - (i + 1) * max(1, (dias_criado - dias_na_etapa) // max(passos, 1))))
            texto = f"Etapa: {comercial.ROTULO_ETAPA[caminho[i]]} → {comercial.ROTULO_ETAPA[caminho[i + 1]]}"
            if caminho[i + 1] == "perdido":
                texto += f" ({perda})"
            db.executar(
                "insert into interacoes (negocio_id, tipo, resumo, autor, ocorrida_em, criado_em) values (%s, 'etapa', %s, %s, %s, %s)",
                (nid, texto, responsavel, quando, quando),
            )
        fechado = etapa in ("ganho", "perdido")
        db.executar(
            "update negocios set etapa = %s, etapa_desde = %s, fechado_em = %s, motivo_perda = %s, criado_em = %s, atualizado_em = %s where id = %s",
            (etapa, atras(dias=dias_na_etapa), atras(dias=dias_na_etapa) if fechado else None, perda, atras(dias=dias_criado),
             atras(dias=parado_dias if parado_dias is not None else min(dias_na_etapa, 2)), nid),
        )
        for dias_h, tipo, resumo, autor in historico or []:
            comercial.registrar_interacao(nid, tipo, resumo, autor, ocorrida_em=atras(dias=dias_h, horas=2))
        if parado_dias is not None:  # registrar_interacao mexe no atualizado_em: volta para parado
            db.executar("update negocios set atualizado_em = %s where id = %s", (atras(dias=parado_dias), nid))
        return nid

    vitalis = org("Clínica Vitalis", "clinica", "nutricao", "Campinas", [("Dra. Helena Duarte", "Diretora clínica", "helena@vitalis.example", "(19) 99111-2201"), ("Marcos Teixeira", "Gerente administrativo", "marcos@vitalis.example", "(19) 99111-2202")])
    movimento = org("Studio Movimento", "clinica", "educacao_fisica", "Belo Horizonte", [("Renata Alves", "Sócia", "renata@studiomovimento.example", "(31) 98822-3310")])
    camila = org("Dra. Camila Rocha", "autonomo", "nutricao", "São Paulo", [("Camila Rocha", "Nutricionista", "camila@camilarocha.example", "(11) 97733-4455")])
    corpo = org("Instituto Corpo & Mente", "clinica", "ambas", "Curitiba", [("Dr. Fábio Lemos", "Diretor", "fabio@corpoemente.example", "(41) 99644-1180")])
    pulso = org("Academia Pulso", "empresa", "educacao_fisica", "Recife", [("Juliana Barros", "Gerente", "juliana@academiapulso.example", "(81) 98855-7701")])
    leo = org("Personal Leo Martins", "autonomo", "educacao_fisica", "Goiânia", [("Leo Martins", "Personal trainer", "leo@leomartins.example", "(62) 99566-8821")])
    nutrivida = org("Clínica NutriVida", "clinica", "nutricao", "Porto Alegre", [("Dra. Beatriz Camargo", "Sócia-fundadora", "beatriz@nutrivida.example", "(51) 99277-6612")])
    bemestar = org("Centro Integrado Bem-Estar", "clinica", "ambas", "Salvador", [("Rafael Souza", "Diretor", "rafael@bemestar.example", "(71) 99388-4400")])
    paulo = org("Dr. Paulo Nunes", "autonomo", "nutricao", "Florianópolis", [("Paulo Nunes", "Nutricionista", "paulo@paulonunes.example", "(48) 99411-0932")])
    fitlife = org("Rede FitLife", "empresa", "educacao_fisica", "São Paulo", [("Carolina Prado", "Diretora de operações", "carolina@fitlife.example", "(11) 98122-5073"), ("Bruno Matos", "Coordenador", "bruno@fitlife.example", "(11) 98122-5074")])
    equilibrio = org("Nutri Equilíbrio", "clinica", "nutricao", "Ribeirão Preto", [("Dra. Sônia Veloso", "Diretora", "sonia@nutriequilibrio.example", "(16) 99244-3015")])
    kinesis = org("Estúdio Kinesis", "clinica", "educacao_fisica", "Fortaleza", [("Thiago Rangel", "Sócio", "thiago@kinesis.example", "(85) 99677-2204")])

    negocio("vitalis", vitalis, "Piloto Vitalis · 6 nutricionistas", "piloto", "jullyana", 21, valor=1490, pacientes=320, plano="completo", usa="Planilhas e WhatsApp", origem="Indicação", passo="Reunião de acompanhamento da semana", passo_em=1, dias_na_etapa=9, historico=[
        (19, "ligacao", "Primeira conversa com a Dra. Helena. Equipe grande e muito retrabalho com planilhas.", "jullyana"),
        (14, "reuniao", "Demonstração para a diretoria. Pediram piloto de 30 dias com o pacote Completo.", "jullyana"),
        (9, "email", "Enviado o termo de participação do piloto e o cronograma.", "jullyana"),
        (6, "whatsapp", "Marcos confirmou o treinamento para terça às 10h.", "jullyana"),
        (2, "reuniao", "Acompanhamento da primeira semana: equipe animada, pediu lembretes mais visíveis.", "dimi"),
    ])
    negocio("movimento", movimento, "Proposta Studio Movimento", "proposta", "dimi", 30, valor=890, pacientes=140, plano="essencial", usa="Aplicativo de treino genérico", origem="Instagram", passo="Cobrar retorno da proposta", passo_em=-2, dias_na_etapa=6, historico=[
        (28, "whatsapp", "Renata chegou pelo Instagram pedindo mais informações.", "dimi"),
        (20, "reuniao", "Demonstração online. Gostou do acompanhamento diário dos alunos.", "dimi"),
        (6, "email", "Proposta enviada com o pacote Essencial.", "dimi"),
    ])
    negocio("camila", camila, "Dra. Camila Rocha · plano individual", "demonstracao", "jullyana", 10, valor=149, pacientes=60, plano="essencial", usa="Planilha", origem="Evento", passo="Demonstração do Orion (30 min)", passo_em=0, dias_na_etapa=3, historico=[
        (9, "whatsapp", "Contato no evento de nutrição. Atende 60 pacientes no consultório.", "jullyana"),
        (3, "ligacao", "Combinamos a demonstração para hoje.", "jullyana"),
    ])
    negocio("corpo", corpo, "Instituto Corpo & Mente", "contato", "dimi", 8, valor=1190, plano="completo", usa="Sistema de agenda", origem="Indicação", passo="Agendar demonstração para a equipe", passo_em=3, dias_na_etapa=4, historico=[
        (7, "email", "Primeiro contato enviado ao Dr. Fábio.", "dimi"),
        (4, "ligacao", "Conversamos por telefone. Quer ver o Orion com a equipe.", "dimi"),
    ])
    negocio("pulso", pulso, "Academia Pulso · 3 unidades", "lead", "jullyana", 3, valor=2500, plano="completo", origem="Site", dias_na_etapa=3, historico=[
        (3, "nota", "Formulário do site: academia com 3 unidades quer conhecer o Orion.", "jullyana"),
    ])
    negocio("leo", leo, "Personal Leo Martins", "piloto", "dimi", 12, valor=149, pacientes=35, plano="essencial", usa="Planilha", origem="Indicação", passo="Acompanhar o uso do piloto", passo_em=2, dias_na_etapa=3, historico=[
        (11, "whatsapp", "Leo foi indicado por um aluno. Quer organizar os treinos e o retorno dos alunos.", "dimi"),
        (3, "reuniao", "Treinamento rápido. Cadastrou os primeiros 10 alunos.", "dimi"),
    ])
    negocio("nutrivida", nutrivida, "Clínica NutriVida", "ganho", "jullyana", 45, valor=1190, pacientes=210, plano="completo", usa="Planilhas", origem="Evento", dias_na_etapa=12, historico=[
        (40, "reuniao", "Demonstração para a Dra. Beatriz e a recepção.", "jullyana"),
        (26, "email", "Proposta enviada.", "jullyana"),
        (12, "ligacao", "Fechado! Começam no próximo ciclo.", "jullyana"),
    ])
    negocio("bemestar", bemestar, "Centro Integrado Bem-Estar", "ganho", "dimi", 60, valor=2400, pacientes=480, plano="completo", usa="Sistema próprio antigo", origem="Indicação", dias_na_etapa=25, historico=[
        (55, "reuniao", "Demonstração para a diretoria e os coordenadores.", "dimi"),
        (38, "reuniao", "Piloto de 30 dias com duas unidades.", "dimi"),
        (25, "ligacao", "Piloto aprovado. Contrato assinado para todas as unidades.", "dimi"),
    ])
    negocio("paulo", paulo, "Dr. Paulo Nunes", "perdido", "jullyana", 35, valor=149, plano="essencial", usa="Planilha", origem="Instagram", dias_na_etapa=15, perda="Já tem um processo com planilhas e não quer trocar agora", historico=[
        (33, "whatsapp", "Pediu informações.", "jullyana"),
        (15, "ligacao", "Disse que prefere manter a planilha por enquanto. Retomar em 6 meses.", "jullyana"),
    ])
    negocio("fitlife", fitlife, "Rede FitLife · 8 unidades", "proposta", "dimi", 40, valor=3900, plano="completo", usa="Vários aplicativos", origem="Evento", passo="Enviar proposta revisada", passo_em=-1, parado_dias=10, dias_na_etapa=12, historico=[
        (38, "reuniao", "Demonstração para a diretoria de operações.", "dimi"),
        (12, "email", "Proposta enviada. Pediram ajustes de condições.", "dimi"),
    ])
    negocio("equilibrio", equilibrio, "Nutri Equilíbrio", "lead", "jullyana", 14, valor=890, origem="Site", parado_dias=12, dias_na_etapa=14, historico=[
        (14, "email", "Formulário do site respondido com um e-mail de apresentação.", "jullyana"),
    ])
    negocio("kinesis", kinesis, "Estúdio Kinesis", "contato", "jullyana", 6, valor=890, plano="essencial", origem="Instagram", passo="Mandar material e perguntar horário da demonstração", passo_em=1, dias_na_etapa=2, historico=[
        (5, "whatsapp", "Thiago pediu material sobre o acompanhamento de alunos.", "jullyana"),
    ])

    # Edições que aparecem no histórico de alterações (quem mudou o quê)
    comercial.editar_negocio(negocios["movimento"], {"valor_mensal": 990, "proximo_passo": "Cobrar retorno da proposta"}, "jullyana")
    db.executar("update interacoes set ocorrida_em = %s, criado_em = %s where negocio_id = %s and tipo = 'alteracao' and resumo not like 'Negócio criado%%'", (atras(dias=4), atras(dias=4), negocios["movimento"]))
    db.executar("update negocios set atualizado_em = %s where id = %s", (atras(dias=2), negocios["movimento"]))

    # Checklists dos pilotos (parte feita, com quem fez)
    for chave, feitos in (("vitalis", 4), ("leo", 2)):
        itens = comercial.itens_piloto(negocios[chave]) or []
        for i, item in enumerate(itens[:feitos]):
            comercial.marcar_item_piloto(item["id"], True, "jullyana" if chave == "vitalis" else "dimi")
            db.executar("update piloto_itens set feito_em = %s where id = %s", (atras(dias=max(0, 8 - i * 2)), item["id"]))
    comercial.adicionar_item_piloto(negocios["vitalis"], "Enviar relatório de uso da primeira semana")

    # Anexos (propostas em PDF e print)
    pdf = pdf_simples("Proposta Orion - Studio Movimento", ["Pacote Essencial para o Studio Movimento", "Acompanhamento diario dos alunos", "Valores e condicoes confirmados pelos socios", "Validade: 15 dias"])
    anexos.criar("negocio", negocios["movimento"], "Proposta Studio Movimento.pdf", pdf, "dimi")
    anexos.criar("negocio", negocios["vitalis"], "Print da tela de acompanhamento.png", png_degrade(), "jullyana")
    anexos.criar("negocio", negocios["vitalis"], "Termo de participacao do piloto.pdf", pdf_simples("Termo de participacao do piloto", ["Clinica Vitalis", "Piloto de 30 dias com o pacote Completo", "Sem dados de saude de pessoas no HQ"]), "jullyana")
    anexos.criar("documento", docs["precos"], "Tabela de pacotes.pdf", pdf_simples("Tabela de pacotes", ["Essencial: profissionais autonomos", "Completo: clinicas e empresas", "Valores confirmados pelos socios"]), "dimi")
    return negocios


# --- tarefas ----------------------------------------------------------------------------------


def seed_tarefas(docs: dict[str, int], negocios: dict[str, int]) -> None:
    tarefas.colunas()
    tarefas.criar_coluna("Em revisão")
    tarefas.mover_coluna("em_revisao", 3)  # antes de "Feito"
    col = {c["nome"]: c["chave"] for c in tarefas.colunas()}

    lista: list[dict[str, Any]] = [
        # Dimi
        dict(t="Fechar proposta do Studio Movimento", r="dimi", c="Fazendo", p=-2, prio="alta", n="movimento", d="precos"),
        dict(t="Ajustar o roteiro da demonstração", r="dimi", c="Em revisão", p=1, d="Roteiro de descoberta e demonstração"),
        dict(t="Responder dúvidas do piloto da Vitalis", r="dimi", c="A fazer", p=0, prio="alta", n="vitalis", d="vitalis"),
        dict(t="Planejar a fase B2C do copiloto", r="dimi", c="Bloqueada", p=10, desc="Aguardando a definição das métricas de acompanhamento."),
        dict(t="Conferir a política de preços antes das propostas", r="dimi", c="A fazer", p=3, d="precos"),
        dict(t="Publicar nota de versão 2.4", r="dimi", c="Feito"),
        # Jullyana
        dict(t="Ligar para a Dra. Camila Rocha", r="jullyana", c="A fazer", p=0, prio="alta", n="camila"),
        dict(t="Enviar proposta revisada para a Rede FitLife", r="jullyana", c="Fazendo", p=-1, prio="alta", n="fitlife"),
        dict(t="Montar checklist do piloto do Personal Leo", r="jullyana", c="A fazer", p=2, n="leo", d="Checklist e acompanhamento do piloto"),
        dict(t="Atualizar o modelo de proposta com os novos pacotes", r="jullyana", c="Em revisão", p=2, d="Modelo de proposta comercial"),
        dict(t="Agendar demonstração com o Instituto Corpo & Mente", r="jullyana", c="A fazer", p=3, n="corpo"),
        dict(t="Cadastrar os leads do evento no Comercial", r="jullyana", c="Feito"),
        # Rayssa
        dict(t="Preparar o material de apresentação para clínicas", r="rayssa", c="Fazendo", p=4, d="onboarding"),
        dict(t="Revisar o FAQ de objeções", r="rayssa", c="Em revisão", p=1, d="Objeções e respostas"),
        dict(t="Levantar os concorrentes diretos", r="rayssa", c="Feito", d="concorrentes"),
        dict(t="Gravar um vídeo curto de demonstração", r="rayssa", c="A fazer", p=5, prio="baixa"),
        dict(t="Organizar a planilha de leads para importação", r="rayssa", c="Feito"),
    ]
    for item in lista:
        campos: dict[str, Any] = {"titulo": item["t"], "responsavel": item["r"], "prioridade": item.get("prio", "normal")}
        if "p" in item:
            campos["prazo"] = dia(item["p"])
        if "desc" in item:
            campos["descricao"] = item["desc"]
        if "n" in item:
            campos["negocio_id"] = negocios[item["n"]]
        if "d" in item:
            chave = item["d"]
            campos["documento_id"] = docs.get(chave)
        criada = tarefas.criar(campos, item["r"])
        if col[item["c"]] != "a_fazer":
            tarefas.mover(criada["id"], col[item["c"]])
        db.executar("update tarefas set criado_em = %s where id = %s", (atras(dias=3), criada["id"]))
        if item["c"] == "Feito":
            db.executar("update tarefas set concluida_em = %s where id = %s", (atras(dias=1), criada["id"]))


# --- chat, atividades, aprovações, incidentes, reuniões --------------------------------------


def msg(autor: str, texto: str, quando: datetime, run_id: Optional[str] = None, conversa_id: Optional[int] = None) -> None:
    db.executar(
        "insert into mensagens (autor, texto, run_id, criado_em, conversa_id) values (%s, %s, %s, %s, %s)",
        (autor, texto, run_id, quando, conversa_id),
    )


def ativ(run_id: str, agente: str, tipo: str, detalhe: str, quando: datetime, dados: Optional[dict] = None, tokens: int = 0) -> None:
    db.executar(
        "insert into atividades (run_id, agente, tipo, detalhe, dados, tokens, criado_em) values (%s, %s, %s, %s, %s, %s, %s)",
        (run_id, agente, tipo, detalhe, Json(dados) if dados is not None else None, tokens, quando),
    )


def execucao(run_id: str, autor: str, quando: datetime, conversa_id: Optional[int], passos: list[tuple[str, str, str, Optional[dict], int]]) -> None:
    """Uma execução completa do orquestrador: início → passos → resposta, em segundos consecutivos."""
    ativ(run_id, "orq", "inicio", "Pedido recebido", quando, {"autor": autor, "conversa_id": conversa_id})
    for i, (agente, tipo, detalhe, dados, tokens) in enumerate(passos, 1):
        ativ(run_id, agente, tipo, detalhe, quando + timedelta(seconds=3 * i), dados, tokens)
    ativ(run_id, "orq", "resposta", "Resposta enviada", quando + timedelta(seconds=3 * (len(passos) + 1)), None, 0)


def seed_chat(docs: dict[str, int]) -> None:
    # Conversa Geral (id nulo)
    r1, r2 = "demo-geral-1", "demo-geral-2"
    msg("dimi", "Bom dia! Como está o funil comercial?", atras(horas=5, minutos=10), r1)
    execucao(r1, "dimi", atras(horas=5, minutos=10), None, [
        ("orq", "pensando", "Entendendo o pedido", None, 420),
        ("orq", "delegou", "Negócios: resumo do funil", {"de": "orq", "para": "negocios"}, 0),
        ("negocios", "ferramenta", "resumo_funil()", None, 0),
        ("negocios", "concluiu", "Resumo pronto", None, 880),
    ])
    msg("Orquestrador", """Bom dia, Dimi! Este é o retrato do funil agora:

| Etapa | Negócios | Valor/mês |
| --- | --- | --- |
| Lead | 2 | R$ 3.390 |
| Contato | 2 | R$ 2.080 |
| Demonstração | 1 | R$ 149 |
| Piloto | 2 | R$ 1.639 |
| Proposta | 2 | R$ 4.890 |

**Atenção:**
- A proposta do *Studio Movimento* está com o retorno vencido há 2 dias
- A *Rede FitLife* está parada há 10 dias

Quer que eu proponha um registro de acompanhamento para os dois?""", atras(horas=5, minutos=9), r1)
    msg("jullyana", "/nota Reunião com a Clínica Vitalis confirmada para sexta, 15h. Levar o relatório da primeira semana.", atras(horas=3, minutos=40), None)
    msg("Orquestrador", "Anotado no histórico do projeto.", atras(horas=3, minutos=40), None)
    msg("Orquestrador", """**Resumo da semana**

- 3 reuniões comerciais realizadas e 2 pilotos em andamento
- 1 negócio fechado: *Clínica NutriVida* (R$ 1.190/mês)
- 4 documentos novos no Docs

Próximos passos: fechar a proposta do Studio Movimento e enviar a revisão para a Rede FitLife.""", atras(dias=1, horas=2), None)
    msg("dimi", "O que mudou no Orion esta semana?", atras(horas=1, minutos=20), r2)
    execucao(r2, "dimi", atras(horas=1, minutos=20), None, [
        ("orq", "pensando", "Entendendo o pedido", None, 380),
        ("orq", "delegou", "Tech: o que mudou esta semana", {"de": "orq", "para": "tech"}, 0),
        ("tech", "ferramenta", "buscar_changelog(consulta='semana')", None, 0),
        ("tech", "concluiu", "Resumo das mudanças", None, 1240),
    ])
    msg("Orquestrador", """Esta semana o time entregou:

1. **Copiloto de IA** — nova camada de resumo diário para o profissional (#412)
2. **Importação de pacientes** — correção de acentos na planilha (#409)
3. **App** — lembrete de retorno mais visível na tela inicial (#415)

Nenhum incidente novo no backend. Os detalhes estão no log do projeto.""", atras(horas=1, minutos=19), r2)

    # Conversas nomeadas
    def conversa(titulo: str, usuario: str) -> int:
        c = conversas.criar(titulo, usuario)
        return c["id"]

    c1 = conversa("Preparar demo da Clínica Vitalis", "jullyana")
    ra = "demo-vitalis-1"
    msg("jullyana", "Me ajuda a montar o roteiro da demonstração para a Clínica Vitalis? São 6 nutricionistas e eles usam planilhas hoje.", atras(dias=1, horas=4), ra, c1)
    execucao(ra, "jullyana", atras(dias=1, horas=4), c1, [
        ("orq", "pensando", "Entendendo o pedido", None, 450),
        ("orq", "delegou", "Docs: roteiro de demonstração", {"de": "orq", "para": "work"}, 0),
        ("work", "ferramenta", f"buscar_documentos(consulta='demonstração')", None, 0),
        ("work", "ferramenta", f"ler_documento(documento_id={docs['Roteiro de descoberta e demonstração']})", None, 0),
        ("work", "concluiu", "Roteiro adaptado", None, 1560),
    ])
    msg("Orquestrador", """Montei um roteiro de **25 minutos** com base no [[Roteiro de descoberta e demonstração]]:

1. **Abertura (3 min):** confirmar como a equipe acompanha os pacientes hoje
2. **Dor principal (5 min):** retrabalho com planilhas e retorno esquecido
3. **Demonstração (12 min):**
   - acompanhamento diário com resumo automático
   - lembrete de retorno
   - painel da clínica
4. **Piloto (5 min):** 30 dias, pacote Completo, reunião semanal

> Lembre: valores e condições só depois de confirmados entre os sócios.

Quer que eu proponha a criação desse roteiro como página no Docs?""", atras(dias=1, horas=3, minutos=58), ra, c1)

    c2 = conversa("Objeções de preço", "dimi")
    rb = "demo-preco-1"
    msg("dimi", "A Renata do Studio Movimento achou caro. Como podemos responder?", atras(dias=2, horas=6), rb, c2)
    execucao(rb, "dimi", atras(dias=2, horas=6), c2, [
        ("orq", "pensando", "Entendendo o pedido", None, 400),
        ("orq", "delegou", "Docs: objeções e respostas", {"de": "orq", "para": "work"}, 0),
        ("work", "ferramenta", f"ler_documento(documento_id={docs['Objeções e respostas']})", None, 0),
        ("work", "ferramenta", f"ler_documento(documento_id={docs['precos']})", None, 0),
        ("work", "concluiu", "Sugestão de resposta", None, 1320),
    ])
    msg("Orquestrador", f"""Segundo o [[Objeções e respostas]], vale mostrar **o custo de não ter** o acompanhamento, em vez de defender o valor:

- Pergunte quanto tempo a equipe gasta hoje com retorno manual
- Compare o pacote *Essencial* com o tempo recuperado por semana
- Ofereça o piloto de 30 dias antes de falar em desconto

**Não prometa desconto.** Qualquer condição especial precisa do ok de duas pessoas do time, conforme a [[Política de preços e pacotes]].""", atras(dias=2, horas=5, minutos=58), rb, c2)

    c3 = conversa("Checklist de onboarding", "rayssa")
    rc = "demo-onboarding-1"
    msg("rayssa", "Quais documentos temos sobre onboarding de clientes?", atras(dias=3, horas=2), rc, c3)
    execucao(rc, "rayssa", atras(dias=3, horas=2), c3, [
        ("orq", "pensando", "Entendendo o pedido", None, 300),
        ("orq", "delegou", "Docs: buscar onboarding", {"de": "orq", "para": "work"}, 0),
        ("work", "ferramenta", "buscar_documentos(consulta='onboarding')", None, 0),
        ("work", "concluiu", "Documentos encontrados", None, 760),
    ])
    msg("Orquestrador", """Encontrei estes documentos:

- [[Guia de onboarding de clientes]] — passo a passo das 4 primeiras semanas
- [[Checklist e acompanhamento do piloto]] — modelo de checklist
- [[Piloto Clínica Vitalis]] — exemplo real em andamento

Posso resumir qualquer um deles se quiser.""", atras(dias=3, horas=1, minutos=58), rc, c3)

    # Changelog (memória do projeto, usada pelo Tech)
    for fonte, titulo, resumo, h in (
        ("github", "Copiloto de IA: resumo diário do profissional", "Nova camada de resumo diário no copiloto.", 30),
        ("github", "Importação de pacientes: acentos na planilha", "Corrige acentuação na importação por CSV.", 52),
        ("github", "App: lembrete de retorno mais visível", "Destaca o retorno na tela inicial do app.", 70),
    ):
        db.executar(
            "insert into changelog (fonte, referencia, titulo, resumo, autor, criado_em) values (%s, %s, %s, %s, %s, %s)",
            (fonte, f"demo-{h}", titulo, resumo, "equipe", atras(horas=h)),
        )


def seed_aprovacoes(docs: dict[str, int], negocios: dict[str, int]) -> None:
    def aprov(run: str, tipo: str, proposta: dict, por: str, status: str, quando: datetime, decidido_por: Optional[str] = None, aprovado: Optional[bool] = None) -> None:
        db.executar(
            """
            insert into aprovacoes (run_id, chave, tipo, proposta, pedido_por, status, decidido_por, criado_em, decidido_em, aprovado)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (run, f"{run}:ap", tipo, Json(proposta), por, status, decidido_por, quando, quando + timedelta(minutes=12) if decidido_por else None, aprovado),
        )

    # Pendentes (aparecem no Início, no menu e na tela de Aprovações)
    aprov("demo-ap-1", "criar_documento", {"acao": "criar", "titulo": "Roteiro de demonstração para clínicas de nutrição", "conteudo": "# Roteiro de demonstração\n\n1. Abertura e contexto (3 min)\n2. A dor principal da clínica (5 min)\n3. Demonstração do acompanhamento diário (12 min)\n4. Proposta do piloto de 30 dias (5 min)\n\n> Valores e condições só depois de confirmados entre os sócios.\n", "pasta": "Comercial", "tags": ["roteiro", "demonstração"]}, "work", "pendente", atras(minutos=35))
    aprov("demo-ap-2", "editar_documento", {"acao": "editar", "documento_id": docs["precos"], "documento_titulo": "Política de preços e pacotes", "campos": {"conteudo": "# Política de preços e pacotes\n\nValores e condições **sempre confirmados pelos sócios** antes de enviar qualquer proposta.\n\n| Pacote | Para quem | O que inclui |\n| --- | --- | --- |\n| Essencial | Profissionais autônomos | Acompanhamento diário e relatórios |\n| Completo | Clínicas e empresas | Tudo do Essencial, equipe e painel da clínica |\n| Rede | Redes com várias unidades | Tudo do Completo e gestão por unidade |\n\nDescontos só com aprovação de duas pessoas do time.\n\nAtualizado após a conversa com a Clínica NutriVida.\n"}}, "work", "pendente", atras(minutos=50))
    aprov("demo-ap-3", "comercial_interacao", {"acao": "interacao", "negocio_id": negocios["fitlife"], "negocio_titulo": "Rede FitLife · 8 unidades", "tipo": "email", "resumo": "Revisão de condições enviada à Carolina. Aguardando retorno da diretoria."}, "negocios", "pendente", atras(minutos=12))
    aprov("demo-ap-4", "criar_reuniao", {"titulo": "Acompanhamento do piloto — Clínica Vitalis", "inicio": f"{dia(2)}T15:00:00-03:00", "fim": f"{dia(2)}T15:45:00-03:00", "participantes": ["dimi", "jullyana", "rayssa"], "pauta": ["Relatório de uso da primeira semana", "Ajustes pedidos pela equipe", "Decisão sobre continuar o piloto"]}, "agenda", "pendente", atras(minutos=5))

    # Histórico decidido
    aprov("demo-ap-5", "comercial_novo_negocio", {"acao": "novo_negocio", "organizacao_nome": "Estúdio Kinesis", "organizacao_tipo": "clinica", "campos": {"titulo": "Estúdio Kinesis", "valor_mensal": 890, "plano_interesse": "essencial", "origem": "Instagram"}}, "negocios", "aprovada", atras(dias=6, horas=3), "jullyana", True)
    aprov("demo-ap-6", "criar_documento", {"acao": "criar", "titulo": "Guia de onboarding de clientes", "conteudo": "# Guia de onboarding de clientes\n\nPasso a passo das quatro primeiras semanas.\n", "pasta": "Operação", "tags": ["onboarding"]}, "work", "aprovada", atras(dias=6, horas=8), "dimi", True)
    aprov("demo-ap-7", "comercial_atualizar_negocio", {"acao": "atualizar", "negocio_id": negocios["paulo"], "negocio_titulo": "Dr. Paulo Nunes", "etapa_origem": "demonstracao", "etapa": "perdido", "motivo_perda": "Prefere manter a planilha por enquanto", "campos": {}}, "negocios", "aprovada", atras(dias=15), "jullyana", True)
    aprov("demo-ap-8", "criar_documento", {"acao": "criar", "titulo": "Anotações soltas", "conteudo": "rascunho", "pasta": None, "tags": []}, "work", "recusada", atras(dias=4, horas=2), "dimi", False)
    aprov("demo-ap-9", "editar_documento", {"acao": "editar", "documento_id": docs["reuniao"], "documento_titulo": "Reunião semanal do time", "campos": {"titulo": "Reunião do time"}}, "work", "obsoleta", atras(dias=8), "dimi", True)

    # Reuniões futuras (aprovadas antes)
    for titulo, inicio, fim, part, pauta in (
        ("Reunião semanal do time", f"{dia(1)}T09:30:00-03:00", f"{dia(1)}T10:00:00-03:00", ["dimi", "jullyana", "rayssa"], ["Funil comercial", "Pilotos em andamento", "Bloqueios"]),
        ("Demonstração — Dra. Camila Rocha", f"{dia(0)}T16:00:00-03:00", f"{dia(0)}T16:30:00-03:00", ["jullyana"], ["Apresentar o acompanhamento diário", "Plano individual"]),
    ):
        db.executar(
            "insert into reunioes (titulo, inicio, fim, participantes, pauta, criado_por, run_id, chave) values (%s, %s, %s, %s, %s, %s, %s, %s)",
            (titulo, inicio, fim, part, pauta, "agenda", "demo-reunioes", f"demo-reunioes:{titulo}"),
        )


def seed_incidentes() -> None:
    linhas = [
        ("demo-inc-1", "app", "TypeError: Cannot read properties of undefined (reading 'retorno')", "error", 14, 6, 1, 0, "aberto", None),
        ("demo-inc-2", "backend", "TimeoutError: consulta de relatório excedeu 30s", "fatal", 3, 3, 3, 0, "aberto", None),
        ("demo-inc-3", "app", "Network request failed ao sincronizar lembretes", "warning", 31, 9, 6, 1, "diagnosticado", {
            "resumo": "A sincronização de lembretes falha quando o app volta do modo avião.",
            "causa_provavel": "A fila de sincronização não é reiniciada ao recuperar a conexão, então a primeira chamada usa um token expirado.",
            "confianca": "alta",
            "arquivos_suspeitos": [
                {"caminho": "src/sync/fila.ts", "motivo": "Não reinicia a fila ao detectar a volta da rede"},
                {"caminho": "src/auth/token.ts", "motivo": "Renovação do token acontece só após a primeira falha"},
            ],
            "pr_relacionado": "#415",
            "impacto": "Cerca de 9 usuários viram lembretes atrasados nas últimas 24 horas.",
            "proximo_passo": "Renovar o token antes de reenviar a fila e reiniciar a sincronização ao reconectar.",
            "corrigivel_automaticamente": False,
            "motivo": "A correção mexe em autenticação e precisa de revisão humana.",
        }),
        ("demo-inc-4", "backend", "IntegrityError ao importar planilha com contato duplicado", "error", 52, 2, 9, 2, "resolvido", None),
        ("demo-inc-5", "app", "Falha ao abrir o anexo de relatório em aparelhos antigos", "warning", 7, 1, 11, 4, "ignorado", None),
    ]
    for sid, proj, titulo, nivel, ocorr, usu, d1, d2, status, diag in linhas:
        db.executar(
            """
            insert into incidentes (sentry_issue_id, projeto, titulo, nivel, ocorrencias, usuarios_afetados, primeira_vez, ultima_vez,
                                    status, diagnostico, diagnosticado_em, ambiente, release)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'producao', '2.4.1')
            """,
            (sid, proj, titulo, nivel, ocorr, usu, atras(dias=d1, horas=2), atras(dias=d2, horas=1), status,
             Json(diag) if diag else None, atras(dias=d2, horas=1) if diag else None),
        )


def seed_presenca() -> None:
    for usuario in config.usuarios():
        db.executar(
            "insert into presenca (usuario, visto_em) values (%s, now()) on conflict (usuario) do update set visto_em = now()",
            (usuario,),
        )


# --- principal --------------------------------------------------------------------------------


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="apaga e recria os dados (sem isso, só descreve)")
    p.add_argument("--forcar", action="store_true", help="permite rodar em banco que pareça de produção")
    args = p.parse_args()

    url = config.database_url()
    if not url:
        print("DATABASE_URL não definida. Configure-a (veja .env.example).")
        return 1
    if not args.aplicar:
        print("Isto APAGARIA e recriaria: documentos, Comercial, tarefas, conversas, aprovações, incidentes, reuniões,")
        print("atividades e anexos. Nada foi alterado. Rode com --aplicar para popular.")
        return 0
    if ("neon" in url.lower() or "amazonaws" in url.lower()) and not args.forcar:
        print("Recusado: a DATABASE_URL parece de produção. Use um banco local ou passe --forcar (apaga os dados reais!).")
        return 2

    limpar()
    docs = seed_documentos()
    negocios = seed_comercial(docs)
    seed_tarefas(docs, negocios)
    seed_chat(docs)
    seed_aprovacoes(docs, negocios)
    seed_incidentes()
    seed_presenca()
    contagem = {t: db.um(f"select count(*)::int as n from {t}")["n"] for t in ("documentos", "organizacoes", "negocios", "tarefas", "conversas", "mensagens", "aprovacoes", "incidentes", "anexos")}
    print("Dados de demonstração criados:", ", ".join(f"{n} {t}" for t, n in contagem.items()))
    print("Para animar o Escritório, rode agora: .venv/bin/python scripts/seed_demo.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
