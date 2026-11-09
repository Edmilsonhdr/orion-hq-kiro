"""Renomeia um usuário nos registros do banco (ex.: dimi -> edmilson).

Uso: DATABASE_URL=... python scripts/renomear_usuario.py dimi edmilson
Roda numa transação só: se algo falhar, nada é alterado. Depois, troque também o nome em
ORION_USERS e ORION_APPROVERS (variáveis de ambiente) e faça um redeploy.
"""

import os
import sys

import psycopg

ALVOS = [
    ("anexos", "autor"), ("aprovacoes", "decidido_por"), ("aprovacoes", "pedido_por"),
    ("auditoria", "usuario"), ("conversas", "criado_por"), ("documento_comentarios", "autor"),
    ("documento_versoes", "editado_por"), ("documentos", "autor"), ("mensagens", "autor"),
    ("mensagens", "usuario"), ("presenca", "usuario"), ("reunioes", "criado_por"),
    ("tarefas", "criado_por"), ("tarefas", "responsavel"),
]


def main(antigo: str, novo: str) -> None:
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        for tabela, coluna in ALVOS:
            n = c.execute(f'update "{tabela}" set "{coluna}" = %s where "{coluna}" = %s', (novo, antigo)).rowcount
            print(f"{tabela}.{coluna}: {n}")
        n = c.execute("update reunioes set participantes = array_replace(participantes, %s, %s)", (antigo, novo)).rowcount
        print(f"reunioes.participantes: {n}")
        n = c.execute(
            "update documento_comentarios set texto = replace(texto, %s, %s) where texto like %s",
            (f"@{antigo}", f"@{novo}", f"%@{antigo}%"),
        ).rowcount
        print(f"menções @{antigo} nos comentários: {n}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
