---
pai: "Guia de uso do Orion"
pai_pasta: "Orion (guia de uso)"
---
# Novidades do Orion (21/10 a 07/11/2026)

O que mudou no Orion nas últimas semanas, por tema. A lista vem do histórico de código; **não foi conferido o que de fato já está em produção**. Os prints, tirados com dados de demonstração, estão nos **anexos** deste documento, numerados na ordem em que aparecem aqui.

## Educação física (22 a 24/10)

Web e app. O Orion passou a atender também o educador físico, não só a nutrição.

- O profissional escolhe a área (nutrição ou educação física) e o menu mostra só os módulos dela.
- Biblioteca de exercícios e programas de treino, com link de vídeo (YouTube ou Vimeo) em cada exercício.
- Modelos de treino reutilizáveis: salvar um programa e usar em qualquer aluno.
- O aluno executa o treino ativo no app: vê como fazer cada exercício, usa o cronômetro de descanso com alarme que toca com o app em segundo plano e recebe o treino do dia na tela inicial, com lembrete diário.
- O treino medido pelo relógio é unido ao treino do programa.
- O profissional acompanha as sessões do aluno e vê todos os treinos dele.
- Painel do educador físico, com faixa de retenção por aluno (quem está sumindo).
- Modelos de anamnese para o educador, alerta de PAR-Q e relatório de evolução do treino.
- Relatório do treino enviado por e-mail ao aluno e resumo mensal para o educador.

Prints: anexos 01 a 04 (painel, acompanhamento do treino, biblioteca de exercícios, fichas de treino).

## Equipe de profissionais (23/10)

Web e app.

- O aluno aceita o vínculo com cada profissional que o acompanha; enquanto não aceita, o profissional recebe um aviso.
- No app, o aluno vê o que cada profissional enxerga dele.
- Resumo entre as áreas na ficha do paciente (nutrição e treino lado a lado).

Print: anexo 05 (paciente aceita o vínculo).

## Financeiro: cobrança e recibo (24/10 e 07/11)

Web.

- Cobranças manuais e recibo em PDF de uma página.
- Página Financeiro, aba na ficha do paciente e botão "Cobrar esta consulta" na agenda.
- Em 07/11 o financeiro passou a vir ligado por padrão (antes ficava escondido). Esta mudança está em dois pedidos de revisão abertos e ainda não foi para produção.

Prints: anexos 06 e 07 (página Financeiro e cobranças na ficha).

## Agenda (24/10 e 06/11)

Web e app.

- Linha do tempo do dia e destaque das consultas atrasadas.
- Cancelamento com motivo e consulta com duração; o sistema avisa quando há conflito de horário.
- Confirmação da consulta por WhatsApp.
- O profissional autônomo agenda na própria agenda.
- O paciente confirma ou pede para remarcar a próxima consulta pelo app, e o profissional vê a resposta na agenda.

Prints: anexos 08 e 09 (agenda do dia e da semana).

## Exames e arquivos do paciente (24/10)

Web e app.

- O paciente envia exames e bioimpedância pelo app e pode listar, baixar e apagar.
- O profissional vê e baixa os arquivos na aba Exames da ficha.

Prints: anexos 10 e 11 (aba Exames do profissional e envio pelo paciente).

## Privacidade e segurança (23 e 24/10)

App e sistema.

- Aceite dos termos de uso e da política de privacidade depois do login, com registro de cada versão aceita.
- Botão "Baixar meus dados" na tela Mais: o paciente leva tudo o que é dele.
- Exclusão de conta pelo próprio paciente (os registros clínicos são mantidos) e rotina diária que apaga as contas excluídas ao fim do prazo de guarda.
- Só o primeiro nome do paciente vai para a IA.
- Limite de tentativas de senha erradas por conta, e a checagem da sessão deixou de gastar esse limite.

Prints: anexos 12 e 13 (aceite dos termos e exclusão de conta).

## Avisos ao paciente (23/10 a 06/11)

App e sistema.

- Caixa de avisos com sino de não lidos na tela inicial.
- Aviso por e-mail, ligado por padrão, que o paciente pode desligar.
- Avisos lidos há mais de 90 dias são apagados automaticamente.
- Aviso no celular (notificação) a cada aviso novo; ao tocar, abre a tela certa.
- A notificação de check-in some depois que o paciente responde.
- O envio antigo de notificações foi removido e trocado pelo novo.

Print: anexo 14 (aviso de ficha de treino atualizada).

## Chat do Orion (05 e 06/11)

App, web e sistema.

- O Orion decide e orienta em vez de só registrar; quando faz sentido, leva o paciente à tela de registro.
- Memória do que a pessoa conta, com tela para ver e apagar o que ele guardou e para avaliar as respostas. A memória esquece o que já passou e protege o que dura.
- Resumo dos últimos 7 dias entra no contexto, para ele enxergar padrões da semana.
- Trava de alergia e trava de sinais de alerta no servidor; o aviso de risco passa mesmo depois do limite diário.
- Limite diário de mensagens e regra de escopo (o que o Orion responde e o que não).
- Medição do chat e cenários difíceis de teste.
- No app: resposta que aparece enquanto é escrita, "bom dia" local, notas do Orion e menu ao segurar a mensagem.

Print: anexo 15 (chat do paciente).

## Sinais de alerta (24/10)

Web e sistema.

- Os sinais de padrão olham os últimos 14 dias, e não a vida toda do paciente.
- "Sem registro" só aparece depois de dois dias completos sem refeições.
- Registro esparso deixou de ser lido como "comeu pouco"; proteína é avaliada só em dias completos.
- O sistema avisa quando um sinal não está mais ativo.

Prints: anexos 16 e 17 (Sinais do Orion e Alertas).

## App do paciente na web (05 e 06/11)

Web.

- Versão web do app do paciente, no mesmo desenho do app: Jornada, Corpo, Plano e Registrar.
- Demais telas: Treino, Formulários, Exames, Mais, Chat, Compras e Avisos.

Prints: anexos 18 a 21 (onboarding, início, Jornada e Meu treino).

## App do celular: ajustes (23/10 a 06/11)

- Em Registro, a próxima refeição do plano e o treino do programa aparecem primeiro.
- O sono vem do relógio quando ele está conectado.
- Início mais correto: "dia encerrado" aparece antes da meia-noite e o próximo retorno é sempre futuro.
- Foto do perfil abre a aba Mais, e a área de toque do sino ficou maior.
- Se a checagem de sessão falhar na abertura, o app tenta de novo e oferece repetir, em vez de deslogar o usuário.

## Decisões e bastidores (22/10 a 07/11)

- A versão 1 vai para as lojas de aplicativos.
- A tabela de alimentos TBCA fica para a versão 2: a licença não permite embutir sem autorização por escrito.
- Foram escritos o rascunho do modelo de cobrança, o roteiro de conversa do piloto sobre o financeiro e o roteiro do piloto para educadores físicos.
- Contas de demonstração com histórico fictício de alimentação e treino, para testar sem dados reais.
- Ajustes internos de estabilidade nas atualizações do banco de dados.

## Em aberto

- Financeiro ligado por padrão: aguarda a revisão e a aprovação dos dois pedidos abertos (back e front).
- Notificações no celular: há passos pendentes registrados no status do projeto, e a primeira tentativa de atualização do banco falhou em produção e foi corrigida em 06/11.
- A lista vem do histórico de código; o que já está em produção não foi conferido.

Fonte: histórico de alterações do sistema (back), do site (web) e do app do celular, de 21/10 a 07/11/2026.
