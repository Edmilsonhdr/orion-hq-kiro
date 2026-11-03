# Pendências para produção

O que ficou fora do código desta rodada porque depende de credenciais, de acesso a produção ou de uma decisão. Nada abaixo
foi feito em produção.

Atualizado em 03/11/2026. Conforme cada item for resolvido, apague-o daqui.

## Precisa de você (acesso a produção)

1. **Rodar o setup do banco em produção.** Há tabelas novas (`negocio_metricas`, `auditoria`, `totp`).
   `DATABASE_URL="<url de produção>" .venv/bin/python scripts/setup_db.py` (só cria o que falta, não mexe nos dados).
   Enquanto não rodar: auditoria e 2FA ficam desligados sem erro (o login segue só com senha) e "Uso do piloto" mostra a
   lista vazia, mas registrar uma medição dá erro.
2. **Trocar a senha do Neon e atualizar a `DATABASE_URL` na Vercel** (a URL anterior foi colada numa conversa), com um novo
   deploy depois.
3. **`ANTHROPIC_API_KEY` válida na Vercel.** Sem ela falham: Testar e Rascunho dos Agentes, o Guardião de docs e o título
   gerado pela IA no chat.
4. **Resumo diário por e-mail (opcional):** criar a conta no Resend, verificar o remetente e definir na Vercel
   `RESEND_API_KEY`, `ORION_EMAILS` (`dimi:email,jullyana:email`) e, se quiser, `ORION_EMAIL_REMETENTE`. Sem isso o resumo
   vai só para o chat.
5. **Conferir os crons na Vercel após o deploy.** O projeto agora declara dois: `resumo-semanal` (segundas, 12h UTC; roda
   também o Guardião de docs) e `resumo-diario` (dias úteis, 11h UTC). O plano gratuito limita a 2 crons por conta; se a
   conta já usa outros, um deles não será criado. `CRON_SECRET` precisa estar definido.
6. **Cada pessoa ativar a verificação em duas etapas** em Segurança, depois que o item 1 estiver feito. Quem perder o
   aplicativo precisa que alguém apague a linha em `totp`.
7. **Conferir no navegador** o calendário, o chat, as telas de Agentes (uso), Segurança e o negócio (uso do piloto): os
   testes cobrem a lógica, não o visual.

## Decisões em aberto

- **Números reais do Orion dentro do HQ.** O "Uso do piloto" é manual. Trazer os números sozinhos (profissionais ativos,
  pacientes registrando) exige uma leitura segura do backend do Orion que devolva só contagens por clínica, sem dado de
  saúde. Precisa de um endpoint novo no `orion_back` e de uma credencial de leitura. Não foi feito.
- **Revogação de sessão:** o cookie vale até expirar (trocar o `ORION_SESSION_SECRET` derruba todas as sessões e também
  invalida os endereços de assinatura do calendário).
- **Teste com requisições realmente simultâneas** para a dupla decisão de aprovação.
- **Passo a passo para rodar direto no Windows** (o README assume WSL/Linux).
