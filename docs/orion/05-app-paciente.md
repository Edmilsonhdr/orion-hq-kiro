# Orion — app do paciente (`orion-mobile`)

O aplicativo que o paciente (ou aluno, na Educação Física) usa no celular entre as consultas. Expo 57, React Native 0.86, `expo-router`. **Só o paciente usa o app**; profissional e secretária usam o site ([04](04-web-profissional.md)). O foco é **Android**: o código serve ao iPhone, mas a leitura do relógio (Health Connect) e os widgets são só de Android, e não há build iOS publicado nas configurações lidas.

Lido do código em 29/10/2026 (branch `feat/push-expo`, que é a `master` mais 2 commits de push; ver [00](00-visao-geral.md)): a árvore `app/`, `app.json`, `eas.json`, `lib/features.ts`, o menu da aba Mais, `lib/checkins.ts`, `lib/onboarding.ts`, `lib/push.ts` e os textos das telas.

## 1. Estrutura de navegação

Cinco abas na barra de baixo, e as demais telas abrem por cima delas.

| Aba | Arquivo | Para que serve |
|---|---|---|
| **Início** | `app/(tabs)/index.tsx` | O dia em um relance |
| **Jornada** | `app/(tabs)/jornada.tsx` | Como o paciente vem indo nos últimos 7 dias |
| **Registro** | `app/(tabs)/registrar.tsx` | Registrar o dia em poucos toques |
| **Meu corpo** | `app/(tabs)/corpo.tsx` | Peso, composição e medidas |
| **Mais** | `app/(tabs)/mais.tsx` | Conta, equipe, atalhos e preferências |

Telas fora das abas: `login`, `onboarding`, `termos`, `chat`, `plano`, `compras`, `treino`, `treino-sessao`, `exames`, `anamnese`, `avisos`, `notificacoes`, `relogio`, `widgets`, `documentos` (escondida) e `excluir-conta`.

### Ordem de entrada (`app/_layout.tsx`)
1. **Login.** Sem sessão válida, abre o login.
2. **Termos.** Se o aceite dos Termos de Uso e da Política de Privacidade está pendente (versão nova), a tela `termos` ("Antes de continuar") bloqueia o resto até o paciente marcar "Li e aceito" e confirmar.
3. **Onboarding.** Na primeira vez, o paciente responde o onboarding em formato de conversa, que salva o rascunho por etapa.
4. **Abas.** Só então o app carrega as abas, busca em segundo plano o que elas vão mostrar e, se o relógio estiver liberado e consentido, sincroniza ao abrir e ao voltar para o app (no máximo a cada 30 minutos; qualquer falha é silenciosa).

Se a verificação de sessão falhar por rede, a regra é **não deslogar** o paciente à toa (correção recente no branch `fix/sessao-nao-derruba`, ainda não mesclada no app).

## 2. Entrada

- **Login:** e-mail e senha definidos pelo link de convite do profissional (ou pelo cadastro próprio). O paciente usa o **mesmo Better Auth** da web: o cookie de sessão fica no armazenamento seguro do celular e é enviado em cada chamada.
- **Onboarding** (5 etapas, todas obrigatórias para avançar): **rotina** (hora de acordar e de dormir, rotina de trabalho, regularidade dos horários), **alimentação** (onde come, quem cozinha, quanto come fora, refeição mais difícil), **movimento** (atividade física e restrição física), **sono e hidratação** (horas de sono, regularidade, água, energia) e **como quer ser acompanhado** (estilo de ajuda e de aviso). As preferências podem ser ajustadas depois, na aba Mais.
- **Termos** (tela `termos`): texto provisório até a revisão jurídica; ver [01](01-backend.md), seção 5.14.

## 3. As cinco abas

### Início
O dia do paciente. Os blocos aparecem conforme houver dados:
- **Faixas no topo**, quando existirem: **Meu plano** (próxima refeição do plano ativo), **formulário para responder** (se o profissional enviou uma anamnese), **consulta online** (com o botão de entrar na sala, em destaque de 15 minutos antes até 1 hora depois do horário), **caixa de avisos** (com contador de não lidos) e o **treino de hoje** (sugerido, em andamento ou feito, quando há ficha ativa).
- **Cartão principal ("Seu dia em tempo real"):** a **prioridade agora** (por exemplo, quanto falta de proteína para a meta), o diagnóstico do dia e o botão **Sugestões de refeição**, que abre o chat já com o pedido.
- **Próximo retorno** (consulta marcada).
- **Sua semana:** um anel por dia e a **sequência** de dias seguidos de registro.
- **Seus pilares:** nutrição, água, treino e sono, com atalho "Ver jornada".
- **Progresso de hoje:** proteína, carboidrato, gordura e calorias contra a meta.
- **Evolução:** peso (com minigráfico) e composição corporal, quando houver.
- **Conversar com o Orion:** cartão "Seu copiloto de nutrição, a qualquer hora", com atalho para o chat.

### Jornada
Mostra de forma amigável os **últimos 7 dias**: a alimentação em relação à meta de cada dia (dentro, abaixo, sem registro), as **calorias por dia** com a meta, os **pilares da semana** ("só aparece o que você registrou") e o **acompanhamento**, com a linha do tempo de protocolo, consultas e retornos. O paciente vê **apenas o que ele mesmo registrou**: não vê sinais nem anotações internas do profissional.

### Registro
**Seis atalhos:**

| Atalho | O que faz |
|---|---|
| **Refeição** | Digita o que comeu. Se há plano ativo, aparece o cartão do plano ("Comi isso") |
| **Foto** | Tira ou escolhe a foto do prato |
| **Áudio** | Fala o que comeu |
| **Água** | Registra em ml (mostra o total do dia em litros) |
| **Treino** | Com ficha ativa, começa pelo **treino da ficha do dia**; o registro livre vira **"Outro treino"** (por exemplo, musculação, corrida) |
| **Sono** | Registra a noite (duração) |

Nas refeições, a IA identifica os alimentos e o **servidor calcula os macros pela Tabela TACO**; o profissional revisa o que foi estimado. Abaixo dos atalhos, a lista das refeições de hoje. **O peso não é registrado aqui**: fica em *Meu corpo*.

### Meu corpo
Peso atual com a variação e o **IMC** ("uma referência, não um diagnóstico"), o botão **Registrar peso**, o resumo do **relógio** (passos, sono, frequência cardíaca, variabilidade, gasto, treinos, VO₂ máx., oxigênio, com avisos), o gráfico de **evolução do peso**, a **composição corporal** (bioimpedância/InBody feita na clínica) e o **histórico de pesagens**.

### Mais
- **Dados do paciente** (idade, altura, peso).
- **Minha equipe:** profissionais vinculados, com a **área** de cada um e **o que ele vê** de você; aceitar o vínculo criado pelo profissional, **Desvincular** e o campo para **vincular com um código** `OR-XXXXXX`.
- **Relógio:** conectar ou gerenciar.
- **Atalhos:** Meu plano, Lista de compras, Meus exames, Meus documentos (só se o recurso estiver ligado), Formulários, Notificações e Widgets.
- **Como o Orion te acompanha:** estilo de ajuda e de aviso, para as próximas conversas.
- **Meus dados:** baixa uma cópia de tudo o que o Orion guarda sobre o paciente, em JSON.
- **Excluir minha conta** (link no fim).

## 4. Telas de alimentação

### Meu plano (`plano`)
O plano alimentar ativo do profissional, no bolso.
- Cada refeição lista os alimentos com a **medida caseira** e as gramas.
- **N trocas** mostra as **substituições** que o profissional deixou para cada alimento.
- **Comi isso** registra a refeição do plano no diário: por alimento, o paciente marca se comeu o **previsto**, **pulou** ou fez uma **troca**, escolhe o horário (de hoje) e o servidor monta o registro e os macros. Vale **só para hoje, uma vez por refeição**. Exige marcar ao menos um alimento.
- **Como fazer** abre a receita da refeição (ingredientes do plano e modo de preparo), **quando o profissional a liberou** e ela está em dia com o plano.
- No rodapé: **Lista de compras** e **Ver o PDF**. Sem plano ativo, a tela explica que ele aparece quando o profissional ativar um.

### Lista de compras (`compras`)
Montada a partir do plano para **7, 15 ou 30 dias**, agrupada por corredor, com "X de Y faltam" por grupo. Os itens são **marcados** à medida que o paciente compra (a marcação fica **no celular**) e há **Limpar marcados** e compartilhar. Para arroz, feijão, lentilha, frango e carne, a quantidade para comprar crua é **aproximada** (o rendimento varia com a marca e o preparo), e o app avisa que os pesos de alimentos cozidos, grelhados ou assados são do alimento já pronto.

### Copiloto de IA (`chat`)
O paciente conversa sobre o dia e o Orion responde com base nos dados reais (protocolo, plano, registros, relógio). As respostas podem trazer **cartões** com opções para tocar (sugestão de refeição dentro do plano, estimativa de macros, dicas) e **ações rápidas** (sugerir refeição, registrar refeição, falar com o profissional, ver progresso). Numa refeição sugerida, **um toque registra no diário**. O histórico de conversas fica guardado. O rodapé lembra que o Orion **não substitui o nutricionista ou o médico**. Limite de 30 mensagens por minuto.

## 5. Treino *(para quem tem ficha ativa de um educador físico)*

- **Meu treino (`treino`):** mostra a ficha ativa com suas divisões; sugere a de hoje (**a que está há mais tempo sem fazer**) e oferece **retomar** um treino em andamento. Sem ficha, avisa "quando o seu profissional ativar uma ficha, ela aparece aqui". Tem **Lembrete de treino** diário, com o horário escolhido pelo paciente (precisa das notificações do celular permitidas). O item aparece em Mais só quando há ficha ativa.
- **Sessão (`treino-sessao`):** para cada exercício, carga e repetições por série, com "última vez"; marca-se série a série. Há **cronômetro de descanso** que começa ao marcar a série (descanso da ficha ou 60 segundos) e agenda um alarme local. Ao concluir: esforço ("Como foi o treino?") e anotação. Sem conexão, as marcações **são enviadas ao concluir**. É possível **descartar** o treino não concluído. Concluir cria o treino do dia, que entra na meta semanal e na sequência.

## 6. Saúde e acompanhamento

- **Meus exames (`exames`):** envia exames de sangue, bioimpedância e outros (PDF ou foto, **até 10 MB**), com título e data opcionais; baixa de novo quando precisar; apaga o que enviou. O profissional vinculado também consegue ver e baixar.
- **Formulários (`anamnese`):** as anamneses que o profissional enviou. O paciente responde **uma pergunta por vez**; o que escreve é **salvo sozinho** (pode parar e continuar). **Enviar ao profissional** só liga depois da primeira resposta, e as respostas voltam ao profissional **como rascunho**.
- **Notificações (`notificacoes`):** o Orion faz **perguntas rápidas** por notificação (sono, fome, energia e hidratação), que o paciente responde **com um toque, sem abrir o app**; as respostas entram no acompanhamento e aparecem para o profissional na aba Rotina. O paciente liga ou desliga cada pergunta; cada uma vem em horário próprio, todos os dias. A resposta é enviada por uma tarefa em segundo plano.
- **Relógio (`relogio`):** conecta o relógio ou a balança pelo **Health Connect** do Android, para passos, sono, frequência cardíaca, treinos e composição entrarem sem digitar. A tela explica o que será lido, pede o **consentimento** (o paciente escolhe os tipos de dado, e o texto tem versão), oferece **Sincronizar agora**, **Gerenciar permissões no Health Connect**, a sincronização em segundo plano e **Desconectar** (com a escolha de apagar ou manter os dados enviados). Sem o recurso liberado para a conta, a tela diz "Em breve para você"; sem o Health Connect, pede para instalar ou atualizar. É estimativa, não diagnóstico.
- **Widgets (`widgets`):** seis widgets para a tela inicial do Android, declarados em `app.json`: **Próxima ação**, **Meta de proteína**, **Meu compromisso**, **Hidratação**, **Sono** e **Atividade**. Mudam ao longo do dia conforme o progresso.

## 7. Avisos, privacidade e conta

- **Caixa de avisos (`avisos`):** avisos do profissional (plano atualizado, ficha de treino atualizada, consulta marcada, remarcada ou cancelada, formulário recebido, documento emitido ou cancelado). Cada aviso leva à tela certa ao tocar. "Marcar todos como lidos". O paciente pode **receber também por e-mail** (plano, formulários e consultas; os detalhes ficam só no app). Com a caixa vazia, a tela explica quando aparecem avisos. Avisos lidos são apagados depois de 90 dias.
- **Push no celular:** no branch lido, o app pede a permissão, registra o aparelho no servidor (`/me/push-token`) e abre a tela do aviso ao tocar; um canal Android "Avisos do seu profissional" é criado. **Isso depende do branch `feat/push-expo` do back, que ainda não está na `master`**: sem ele, o registro falha em silêncio e os avisos continuam só na caixa do app.
- **Meus documentos (`documentos`):** prescrições e declarações em PDF emitidos pelo profissional. **Escondida:** só aparece com `DOCUMENTS_ENABLED = true` em `lib/features.ts` (hoje `false`) e novo build, junto com `DOCUMENTS_ENABLED=true` na API.
- **Excluir minha conta (`excluir-conta`):** a tela lista **o que é apagado na hora** e **o que fica guardado pelos profissionais** (por obrigação legal, sem acesso pelo app), oferece **Baixar meus dados antes**, exige a **senha** e uma caixa "Entendi que a minha conta será excluída e que isso não pode ser desfeito". Regras de retenção em [01](01-backend.md), seção 5.14.

## 8. Dados e funcionamento técnico
- **Cache:** as abas usam um cache de consultas (`lib/query*.ts`) e carregam em segundo plano para abrirem já preenchidas; puxar para atualizar refaz a consulta.
- **API:** `lib/api.ts` (cliente HTTP com o cookie nativo); a URL vem de `EXPO_PUBLIC_API_URL` (e `EXPO_PUBLIC_API_LAN_URL` para testar em celular físico na rede local).
- **Builds** (`eas.json`): `development` (APK com cliente de desenvolvimento), `preview` (APK, aponta para a API de produção) e `production` (pacote `app-bundle` para a loja). Pacote Android `br.com.orion.paciente`; esquema `orion`.
- **Permissões Android declaradas:** leitura do Health Connect de passos, frequência cardíaca, sono, calorias ativas e totais, exercício, frequência em repouso, variabilidade, peso, gordura corporal, massa magra, VO₂ máx., saturação de oxigênio, histórico e leitura em segundo plano.
- **Comandos** (`package.json`): `npm run go` (Expo em túnel, porta 8082), `npm run android`, `npm run web`, `npm run build:android` (EAS, perfil de desenvolvimento).
