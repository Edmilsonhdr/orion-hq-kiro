---
pai: "Documentação técnica do Orion"
pai_pasta: "Orion (produto)"
---
# Versão web do paciente

O app do paciente, no navegador, para quem não quiser (ou não puder) instalar o aplicativo. É uma **área nova dentro do `orion-front`** (o mesmo projeto do site do profissional), em `/paciente/*`. Usa a **mesma API e o mesmo login** do app; o desenho segue o do app, pensado primeiro para celular e adaptado para tablet e computador.

Entrou na linha principal do `orion-front` em 06/11/2026 (PR #9, sobre o PR #5 da sessão que não derruba) e está em produção em `https://app.orion-copiloto.com.br/paciente`. Conferido em 06/11/2026 sobre a `main` (`1feca24`). As pendências conhecidas estão em [06](06-regras-fluxos-e-pendencias.md), seção 4, e no `docs/STATUS.md` do back.

## 1. Quem usa e como entra

- **Só o paciente** (ou aluno, na Educação Física). O profissional e a secretária continuam no site: se entrarem em `/paciente`, o layout manda o profissional ou o administrador para `/painel` e a secretária para `/agenda`.
- **Login** (`/login`): a tela ganhou a escolha **"Sou paciente" / "Sou profissional"**. A escolha muda o painel lateral (variante do paciente) e o texto do campo de e-mail. A tela confere o papel da conta: quem escolhe "paciente" com conta de profissional (ou o contrário) recebe um aviso e não entra.
- **Sem cadastro próprio.** O paciente entra pelo convite do profissional (link por e-mail para definir a senha), igual ao app. "Esqueci minha senha" e a redefinição valem para qualquer papel.
- **Sessão:** a mesma do site, em cookie do Better Auth. Como a web do paciente fica no **mesmo domínio** do site do profissional, o back já confia na origem (`WEB_APP_BASE_URL`) e não precisou mudar. Uma falha de rede ao consultar a sessão **não derruba** o paciente: aparece "Não conseguimos conectar", com nova tentativa a cada 5 segundos.

### Ordem de entrada (`src/app/(paciente)/paciente/layout.tsx`)
1. **Sem sessão:** vai para `/login`.
2. **Termos** (`/paciente/termos`): se o aceite estiver pendente, bloqueia o resto até o paciente aceitar.
3. **Onboarding** (`/paciente/onboarding`): na primeira vez, as cinco etapas em formato de conversa, com rascunho salvo por etapa.
4. **Abas.** Só então abre a moldura com o menu. Se a consulta de termos ou perfil falhar, deixa entrar (travar por falha de rede seria pior do que perguntar de novo na próxima visita).

Termos e onboarding abrem **sem menu**, em tela cheia.

## 2. Moldura e responsividade

| Largura | Moldura |
|---|---|
| Celular e tablet (abaixo de `lg`) | Cabeçalho de vidro (logo, sino de avisos com selo de não lidos, inicial do paciente que leva a "Mais") e **barra de baixo flutuante** em cápsula, com o botão "+" saltando no centro. Cinco abas: Início, Jornada, Registro, Meu corpo e Mais |
| Computador (`lg` em diante) | **Menu lateral** com todas as telas (as abas e os atalhos de "Mais" juntos) e o nome do paciente com o botão Sair; a barra de baixo some |

O conteúdo ocupa no máximo `3xl` no tablet e `5xl` no computador. Cores e componentes seguem o tema do app (roxo `#5B4EE8`, cartões de raio 26, cabeçalho de página com título de 34 px).

## 3. Telas e o que cada uma faz

Todas ficam em `src/app/(paciente)/paciente/`. O que cada tela faz é o mesmo do app (ver [05](05-app-paciente.md)); a tabela mostra só o mapa.

| Rota na web | Tela do app | Observação |
|---|---|---|
| `/paciente` | Início | O dia em um relance; atalho de água leva a `registrar?mode=water` |
| `/paciente/jornada` | Jornada | Últimos 7 dias, com anéis e barras animados |
| `/paciente/registrar` | Registro | Refeição (texto e voz), água, treino e sono; `?mode=` abre direto o painel certo |
| `/paciente/corpo` | Meu corpo | Peso, composição e medidas |
| `/paciente/mais` | Mais | Conta, equipe (vincular por código, aceitar, desvincular), preferências do Orion, atalhos, baixar meus dados, sair |
| `/paciente/plano` | Meu plano | Plano alimentar, trocas e "Comi isso" |
| `/paciente/compras` | Lista de compras | 7, 14 ou 30 dias; copiar a lista |
| `/paciente/chat` | Chat com o Orion | Respostas em tempo real, histórico, avaliação das respostas |
| `/paciente/orion-sabe` | O que o Orion sabe sobre mim | Ver e apagar as notas guardadas |
| `/paciente/treino` e `/paciente/treino/sessao` | Treino e sessão | Ficha, séries, cronômetro de descanso |
| `/paciente/exames` | Exames | Enviar, baixar e apagar arquivos |
| `/paciente/formularios` e `/paciente/formularios/[id]` | Formulários (anamnese) | Resposta com salvamento automático |
| `/paciente/avisos` | Avisos | Marcar todos como lidos |
| `/paciente/excluir-conta` | Excluir minha conta | Mesma regra do app: exportar, senha e confirmação |
| `/paciente/documentos` | Meus documentos | **Escondida:** o recurso está desligado no back; `next.config.mjs` redireciona `/documentos` e `/paciente/documentos` para `/paciente/mais` |

## 4. O que a web ainda não tem (existe no app)

- **Relógio** (Health Connect): cartão, tela e sincronização.
- **Widgets** (só Android) e **push**.
- **Perguntas rápidas** (tela "Notificações" do app: fome, água, sono e energia) e o **lembrete diário de treino**.
- **Iniciar uma sessão de treino a partir do Registro.**
- **Cronômetro de descanso em segundo plano:** na web ele conta com a aba aberta e não dispara alarme depois que a aba fecha.

## 5. Diferenças de funcionamento

- **Voz:** a transcrição passa pela rota `/registrar/transcribe` do próprio Next (Whisper, variável `OPENAI_API_KEY` do front), não pela API do back.
- **Lista de compras:** o que o paciente marca fica no **navegador** (`localStorage`, por plano), não no servidor. Trocar de navegador ou limpar os dados zera as marcações.
- **Avisos:** o selo do sino é atualizado a cada troca de tela.
- **Sem instalação e sem loja:** a atualização chega a todos no deploy do front.

## 6. Testes e estado

- Testes automatizados: a lógica do Início (`patient-home.test.ts`) e a navegação (`nav.test.ts`), além dos testes da tela de login com a escolha de público. Faltam testes das telas e dos fluxos.
- Em produção desde 06/11/2026; o login e as rotas foram conferidos, e o teste visual com pacientes reais começou com a sócia.
- O **preview da Vercel não loga**: o back só aceita a origem oficial e o cookie fica no domínio da API. Teste a web do paciente em produção ou no local.
