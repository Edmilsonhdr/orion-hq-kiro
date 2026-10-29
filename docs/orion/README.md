# Documentação do Orion

Documentação do produto **Orion** (back, web do profissional e app do paciente), escrita a partir da leitura do código dos três repositórios em 29/10/2026. Cada afirmação foi conferida no código; o que é planejamento, desligado por chave ou está em branch não mesclado está dito como tal.

| # | Documento | Para quem | Conteúdo |
|---|---|---|---|
| 00 | [Visão geral](00-visao-geral.md) | Todos | O que é o Orion, quem usa, os três repositórios, estado dos branches lidos |
| 01 | [Backend](01-backend.md) | Quem decide regras e quem mexe na API | Acesso e papéis, áreas e módulos, IA, regras por módulo, jobs, variáveis de ambiente |
| 02 | [Rotas da API](02-api-rotas.md) | Quem integra | As 222 rotas, com o acesso exigido por cada uma |
| 03 | [Modelo de dados](03-modelo-de-dados.md) | Quem mexe no banco | 52 modelos e 29 enums, por assunto |
| 04 | [Web do profissional](04-web-profissional.md) | Quem vende, treina e dá suporte | Todas as telas do site e o que cada uma faz |
| 05 | [App do paciente](05-app-paciente.md) | Quem vende, treina e dá suporte | Todas as telas do app e o que cada uma faz |
| 06 | [Fluxos, regras e pendências](06-regras-fluxos-e-pendencias.md) | Todos | Fluxos de ponta a ponta, regras em lista, divergências confirmadas e pendências |

**Importar no Docs do HQ:** `scripts/seed_comercial_docs.py` já inclui esta pasta (vira a pasta "Orion (produto)" no Docs). Sem `--aplicar` só simula; com `--aplicar --autor <nome>` grava, pulando o que já existe.

**Atualizar:** o `02` e o `03` são gerados do código (rotas e `schema.prisma`) e ficam velhos a cada mudança; o `01`, `04`, `05` e `06` são escritos à mão e precisam ser revistos quando uma regra ou tela mudar.
