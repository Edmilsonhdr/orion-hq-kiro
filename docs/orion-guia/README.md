# Guia de uso do Orion

Guia de **funcionalidades e fluxos de uso** do Orion, para o profissional (site) e para o paciente (app). Explica o que cada parte faz, onde fica e como usar, passo a passo. Escrito a partir do código em 03/11/2026.

Para detalhes técnicos (rotas da API, modelo de dados, regras do backend), veja a documentação técnica na pasta "Orion (produto)".

## Por onde começar

| Se você quer... | Leia |
|---|---|
| Entender o que é o Orion e quem usa | [00 Visão geral](00-visao-geral.md) |
| Ver o caminho completo, do cadastro ao acompanhamento | [20 Fluxos de uso](20-fluxos-de-uso.md) |
| Saber o significado de um termo | [21 Glossário](21-glossario.md) |

## Para o profissional (site)

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Primeiros passos do profissional](01-primeiros-passos-do-profissional.md) | Cadastro, login, perfil, clínica, equipe e convites |
| 02 | [Pacientes e ficha](02-pacientes-e-ficha.md) | Lista, cadastro, ficha com abas, prontuário, anamnese, evolução corporal e exames |
| 03 | [Protocolo e plano alimentar](03-nutricao-protocolo-e-plano.md) | Metas versionadas, plano com IA, receitas, lista de compras e aderência |
| 04 | [Acompanhamento, sinais e alertas](04-acompanhamento-sinais-e-alertas.md) | Visão geral, diário, revisão de refeições, 23 sinais e alertas |
| 05 | [Consultas e teleconsulta](05-consultas-e-teleconsulta.md) | Agenda, horários livres, cancelamento, confirmação por WhatsApp e consultas sem desfecho |
| 06 | [Educação Física](06-educacao-fisica.md) | Exercícios, fichas de treino, acompanhamento e retenção |
| 07 | [Relatórios, modelos e avisos](07-relatorios-modelos-e-avisos.md) | PDFs, resumo do mês, modelos e o que o paciente recebe |

## Para o paciente (app)

| # | Documento | Conteúdo |
|---|---|---|
| 10 | [Primeiros passos no app](10-app-primeiros-passos.md) | Entrada, termos, onboarding, equipe e vínculo |
| 11 | [O dia a dia](11-app-o-dia-a-dia.md) | Início, Jornada, Registro e Meu corpo |
| 12 | [Plano, compras e copiloto](12-app-plano-compras-e-copiloto.md) | Meu plano, Comi isso, receitas, lista de compras e chat com a IA |
| 13 | [Treino](13-app-treino.md) | Ficha, sessão de treino e cronômetro de descanso |
| 14 | [Saúde, avisos e conta](14-app-saude-avisos-e-conta.md) | Exames, formulários, perguntas rápidas, relógio, widgets, avisos e meus dados |

## Para todos

| # | Documento | Conteúdo |
|---|---|---|
| 20 | [Fluxos de uso](20-fluxos-de-uso.md) | Os caminhos de ponta a ponta |
| 21 | [Glossário](21-glossario.md) | Os termos do Orion |
| 30 | [Recursos opcionais](30-recursos-opcionais.md) | Financeiro, Documentos e Dados do relógio |

**Importar no Docs do HQ:** `scripts/seed_comercial_docs.py` inclui esta pasta (vira "Orion (guia de uso)" no Docs). Sem `--aplicar` só simula; com `--aplicar --autor <nome>` grava, pulando o que já existe.
