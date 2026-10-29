# Orion — visão geral do ecossistema

Este conjunto de documentos descreve o **Orion**, o produto dos sócios, a partir da leitura do código dos três repositórios (`orion_back`, `orion-front` e `orion-mobile`) em 29/10/2026. Ele foi escrito para quem precisa entender **o que o produto faz, quem usa cada parte e quais são as regras**, sem ter de ler o código.

> **Regra deste material:** só entra o que foi confirmado no código ou em configuração dos repositórios. Quando um documento antigo dos repositórios diverge do código, vale o código, e a divergência é anotada em [06-regras-fluxos-e-pendencias.md](06-regras-fluxos-e-pendencias.md). Textos de planejamento (`docs/DESIGN-*.md`) descrevem intenção e não foram usados como prova de que algo existe.

## Estado lido do código

Os repositórios estavam em branches diferentes quando este material foi escrito. Isto é o que foi lido (e, portanto, o que os documentos descrevem):

| Repositório | Branch lido | Último commit | Observação |
|---|---|---|---|
| `orion_back` | `master` | `9fcb1e6` (24/10/2026) | Base de referência da API |
| `orion-front` | `fix/sessao-nao-derruba` | `a88bdb3` (24/10/2026) | É a `main` mais 1 correção de sessão |
| `orion-mobile` | `feat/push-expo` | `cc8da3b` (24/10/2026) | É a `master` mais 2 commits de **push** |

**Trabalho em branches ainda não mesclados** (existe no código, mas não está na linha principal; os documentos o tratam como "em desenvolvimento"):
- **Push no celular** (`feat/push-expo`, back e app): o back ganha a tabela `PushToken` e as rotas `POST /me/push-token` e `/me/push-token/remove`; o app registra o aparelho e abre a tela do aviso ao tocar. Na `master` do back **não existe push**; o app deste branch chama rotas que a `master` não tem (a falha é silenciosa).
- **Resposta do paciente à consulta** (back: já na `master`; telas: `feat/confirmar-consulta` no app e `feat/resposta-do-paciente` no web, **não mesclados**): a API já recebe a confirmação ou o pedido de remarcação, mas nenhuma das duas telas aparece nos branches lidos.
- Outros branches do front e do app (`fix/agenda-solo-professional`, `fix/sinal-inativo-aviso`, `proto/antropometria-anamnese`, `fix/lembrete-some-apos-responder`, `teste/home-e-sessao`) não foram descritos aqui.

## O que é o Orion

Uma plataforma de acompanhamento de pacientes e alunos por profissionais de saúde, com um **copiloto de IA**. O profissional atende e decide pelo computador; o paciente registra o dia pelo celular. Hoje atende duas **áreas** de atuação: **Nutrição** e **Educação Física**.

Há três tipos de usuário (campo `role`) e quatro papéis dentro de uma clínica:

| Quem | O que faz | Onde usa |
|---|---|---|
| **Paciente** (ou aluno, na Educação Física) | Registra refeições, água, sono, treino e peso; conversa com a IA; vê plano alimentar e ficha de treino; responde formulários; envia exames | App Android |
| **Profissional** (nutricionista, médico, educador físico) | Cadastra pacientes, define protocolo e plano, monta ficha de treino, acompanha alertas e sinais, agenda consultas, emite relatórios | Web |
| **Secretária** | Vê a lista e o monitoramento e a agenda da clínica; **não** acessa dado clínico | Web |
| **Papéis na clínica** | `owner` (dono), `admin`, `professional`, `secretary` | Web |

## Os três repositórios

| Projeto | O que é | Tecnologia (conforme `package.json`) | Quem usa |
|---|---|---|---|
| `orion_back` | API e regras de negócio, banco, jobs agendados | Node 24, TypeScript, Fastify 5, Prisma 7, PostgreSQL, Better Auth, Zod | Web e app (nenhum usuário final usa direto) |
| `orion-front` | Site do profissional e da equipe da clínica | Next.js 14 (App Router), React 18, Tailwind, shadcn/ui, Recharts | Profissional, secretária, administrador |
| `orion-mobile` | App do paciente | Expo 57, React Native 0.86, React 19, expo-router | Paciente |

```
 Web do profissional (Next.js) ──┐
                                 ├──►  API (Fastify) ──►  PostgreSQL
 App do paciente (Expo) ─────────┘          │
                                            ├─ OpenAI: chat, transcrição de voz (Whisper), análise de foto (Vision), planos e receitas
                                            ├─ Resend: e-mails (confirmação, convite, relatórios, avisos)
                                            ├─ Armazenamento S3 privado: PDFs do InBody e exames dos pacientes
                                            └─ PDFKit: PDFs de plano, relatório, documentos, recibos
```

Os dois clientes falam com a **mesma API** e entram com o **mesmo login** (Better Auth). O web usa cookie de sessão; o app guarda o cookie no armazenamento seguro do celular e o reenvia a cada chamada.

### Endereços configurados nos repositórios

| | Local | Produção |
|---|---|---|
| API | porta 8081 (padrão de `PORT`) | `https://api.orion-copiloto.com.br` (aparece em `orion-mobile/eas.json`) |
| Web | porta 3000 | `https://app.orion-copiloto.com.br` (aparece nos `.env.example`) |
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

## Fontes lidas

- `orion_back`: `prisma/schema.prisma`, `src/app.ts`, `src/index.ts`, `src/lib/*`, `src/jobs/*`, todos os `*.route.ts`, e os arquivos de regra (`*.logic.ts`, `*.policy.ts`, catálogo de sinais, áreas); `.env.example`; `docs/STATUS.md` e `docs/TELAS-DO-ORION.md` (usados como roteiro e conferidos contra o código).
- `orion-front`: a árvore `src/app`, o menu (`light-app-shell.tsx`), `area-modules.ts`, `clinic-modules.ts`, `features.ts`, `feature-catalog.ts`, `next.config.mjs`.
- `orion-mobile`: a árvore `app/`, `app.json`, `eas.json`, `lib/features.ts`, o menu da aba Mais e os textos das telas.
