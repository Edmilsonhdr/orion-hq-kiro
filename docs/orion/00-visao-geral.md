---
pai: "Documentação técnica do Orion"
pai_pasta: "Orion (produto)"
---
# Ecossistema (visão geral)

Este conjunto de documentos descreve o **Orion**, o produto dos sócios, a partir da leitura do código dos três repositórios (`orion_back`, `orion-front` e `orion-mobile`), atualizada em 03/11/2026 sobre a linha principal de cada um. Ele foi escrito para quem precisa entender **o que o produto faz, quem usa cada parte e quais são as regras**, sem ter de ler o código.

> **Regra deste material:** só entra o que foi confirmado no código ou em configuração dos repositórios. Quando um documento antigo dos repositórios diverge do código, vale o código, e a divergência é anotada em [06-regras-fluxos-e-pendencias.md](06-regras-fluxos-e-pendencias.md). Textos de planejamento (`docs/DESIGN-*.md`) descrevem intenção e não foram usados como prova de que algo existe.

## Estado lido do código

Os documentos descrevem a **linha principal** de cada repositório (o que está mesclado), conferida em 03/11/2026. **Atualização de 06/11/2026:** o `orion-front` ganhou a versão web do paciente (PR #9) e a correção de sessão (PR #5); a `main` do front está em `1feca24`. Documento novo: [07](07-web-paciente.md).

| Repositório | Branch | Último commit | Data |
|---|---|---|---|
| `orion_back` | `master` | `9fcb1e6` (PR #23) | 24/10/2026 |
| `orion-front` | `main` | `48286cd` (PR #8) | 24/10/2026 |
| `orion-mobile` | `master` | `a7d6a91` (PR #10) | 24/10/2026 |

**Trabalho em pull requests ainda abertos** (existe no código, mas não está na linha principal; os documentos o tratam como "em revisão"):
- **Push no celular:** back #24 (e #25, só de documentação) e app #11. O back ganha a tabela `PushToken` e as rotas `POST /me/push-token` e `/me/push-token/remove`; o app registra o aparelho e abre a tela do aviso ao tocar. Na `master` do back **não existe push**.
- **Resposta do paciente à consulta:** a API já está mesclada no back (PR #18); as telas estão em app #9 (paciente confirma ou pede para remarcar) e front #7 (profissional vê a resposta), ainda abertas.
- **Sessão que não derruba:** o front #5 foi mesclado em 06/11/2026; o app #8 segue aberto (uma falha de rede ao consultar a sessão não manda a pessoa para o login).
- **Lembrete some depois de responder:** app #12.

## O que é o Orion

Uma plataforma de acompanhamento de pacientes e alunos por profissionais de saúde, com um **copiloto de IA**. O profissional atende e decide pelo computador; o paciente registra o dia pelo celular. Hoje atende duas **áreas** de atuação: **Nutrição** e **Educação Física**.

Há três tipos de usuário (campo `role`) e quatro papéis dentro de uma clínica:

| Quem | O que faz | Onde usa |
|---|---|---|
| **Paciente** (ou aluno, na Educação Física) | Registra refeições, água, sono, treino e peso; conversa com a IA; vê plano alimentar e ficha de treino; responde formulários; envia exames | App Android e **versão web** (`/paciente`) |
| **Profissional** (nutricionista, médico, educador físico) | Cadastra pacientes, define protocolo e plano, monta ficha de treino, acompanha alertas e sinais, agenda consultas, emite relatórios | Web |
| **Secretária** | Vê a lista e o monitoramento e a agenda da clínica; **não** acessa dado clínico | Web |
| **Papéis na clínica** | `owner` (dono), `admin`, `professional`, `secretary` | Web |

## Os três repositórios

| Projeto | O que é | Tecnologia (conforme `package.json`) | Quem usa |
|---|---|---|---|
| `orion_back` | API e regras de negócio, banco, jobs agendados | Node 24, TypeScript, Fastify 5, Prisma 7, PostgreSQL, Better Auth, Zod | Web e app (nenhum usuário final usa direto) |
| `orion-front` | Site do profissional e da equipe da clínica, **e a versão web do paciente** (`/paciente`) | Next.js 14 (App Router), React 18, Tailwind, shadcn/ui, Recharts | Profissional, secretária, administrador e, em `/paciente`, o paciente |
| `orion-mobile` | App do paciente | Expo 57, React Native 0.86, React 19, expo-router | Paciente |

```
 Web do profissional (Next.js) ──┐
 Web do paciente (Next.js,        │
   mesmo projeto, /paciente) ─────┼──►  API (Fastify) ──►  PostgreSQL
 App do paciente (Expo) ─────────┘          │
                                            ├─ OpenAI: chat, transcrição de voz (Whisper), análise de foto (Vision), planos e receitas
                                            ├─ Resend: e-mails (confirmação, convite, relatórios, avisos)
                                            ├─ Armazenamento S3 privado: PDFs do InBody e exames dos pacientes
                                            └─ PDFKit: PDFs de plano, relatório, documentos, recibos
```

Os clientes (site do profissional, web do paciente e app) falam com a **mesma API** e entram com o **mesmo login** (Better Auth). O web usa cookie de sessão; o app guarda o cookie no armazenamento seguro do celular e o reenvia a cada chamada.

### Endereços configurados nos repositórios

| | Local | Produção |
|---|---|---|
| API | porta 8081 (padrão de `PORT`) | `https://api.orion-copiloto.com.br` (aparece em `orion-mobile/eas.json`) |
| Web (profissional e paciente) | porta 3000 | `https://app.orion-copiloto.com.br`; o paciente em `/paciente` (aparece nos `.env.example`) |
| App | porta 8082 (Metro) | build EAS, pacote Android `br.com.orion.paciente` |

Deploy da API: workflow `ci-cd.yml` no GitHub Actions (instala, gera o Prisma, checa tipos, roda os testes e aplica as migrações no banco Neon). O hospedeiro da API em produção é o Railway, segundo a documentação dos repositórios.

## Ideias que atravessam todo o produto

1. **A tabela calcula, a IA descreve.** Em toda refeição (foto, voz, texto, chat ou plano), a IA só identifica os alimentos e as gramas; os **macros são calculados no servidor** pela Tabela TACO (591 alimentos no código) e pelos alimentos cadastrados pela clínica. O que a TACO não cobre usa a estimativa da IA e fica marcado como estimado para o profissional revisar.
2. **A IA propõe, o profissional decide.** Plano sugerido pela IA só ativa com confirmação de revisão; respostas de anamnese enviadas pelo paciente voltam como rascunho; receitas geradas pela IA nascem como rascunho e só o paciente as vê depois de liberadas.
3. **Cada mudança é uma versão.** Protocolos e planos alimentares não se sobrescrevem: o ativo anterior é arquivado e o histórico fica.
4. **Dado de saúde com acesso por vínculo.** O profissional só lê pacientes com os quais tem vínculo; a clínica e a área restringem o que cada um enxerga (detalhes em `01-backend.md`).
5. **Recursos desligáveis.** Documentos, Financeiro e Dados do relógio ficam atrás de variáveis de ambiente (e, no front e no app, de chaves de compilação).

## Onde cada assunto está

| Documento | Conteúdo |
|---|---|
| [01-backend.md](01-backend.md) | Estrutura da API, acesso e papéis, áreas e módulos, regras por módulo, jobs agendados, variáveis de ambiente |
| [02-api-rotas.md](02-api-rotas.md) | Catálogo de todas as 222 rotas, com acesso exigido |
| [03-modelo-de-dados.md](03-modelo-de-dados.md) | Todos os modelos e enums do banco, por assunto |
| [04-web-profissional.md](04-web-profissional.md) | Todas as telas do site do profissional |
| [05-app-paciente.md](05-app-paciente.md) | Todas as telas do app do paciente |
| [06-regras-fluxos-e-pendencias.md](06-regras-fluxos-e-pendencias.md) | Fluxos de ponta a ponta, regras de negócio em lista, divergências e pendências conhecidas |
| [07-web-paciente.md](07-web-paciente.md) | A versão web do paciente (`/paciente`), no mesmo projeto do site |

## Fontes lidas

- `orion_back`: `prisma/schema.prisma`, `src/app.ts`, `src/index.ts`, `src/lib/*`, `src/jobs/*`, todos os `*.route.ts`, e os arquivos de regra (`*.logic.ts`, `*.policy.ts`, catálogo de sinais, áreas); `.env.example`; `docs/STATUS.md` e `docs/TELAS-DO-ORION.md` (usados como roteiro e conferidos contra o código).
- `orion-front`: a árvore `src/app`, o menu (`light-app-shell.tsx`), `area-modules.ts`, `clinic-modules.ts`, `features.ts`, `feature-catalog.ts`, `next.config.mjs`.
- `orion-mobile`: a árvore `app/`, `app.json`, `eas.json`, `lib/features.ts`, o menu da aba Mais e os textos das telas.
