# Implementation Plan

- [x] 1. Banco e configuração
  - Adicionar a tabela `incidentes` e o índice ao `db/schema.sql` (idempotente) e validar o `setup_db.py`
    duas vezes no pgserver
  - Novas funções em `config.py` para as variáveis do design e entradas no `.env.example`
  - _Requirements: 1.7, 4.1, 8.5_

- [x] 2. Receber e limpar eventos do Sentry
- [x] 2.1 `api/_orion/sentry.py`: `verificar_assinatura`, `interpretar_payload` (issue e event_alert),
  whitelist, `mascarar`, mapeamento de projeto
  - Fixtures em `tests/fixtures/` e testes de assinatura, parser tolerante, whitelist e máscara
  - _Requirements: 1.1, 1.2, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4_
- [x] 2.2 Upsert com deduplicação e atualização de status por `resolved`/`ignored`
  - Testes: evento repetido não duplica; resolved/ignored mudam o status
  - _Requirements: 1.3, 1.4, 1.6_
- [x] 2.3 Rota `POST /api/webhooks/sentry` em `index.py` (sem sessão, 401 na assinatura, 200 ignorado)
  - _Requirements: 1.1, 1.2, 1.5_

- [-] 3. Leitura do GitHub e do Sentry
  - `api/_orion/github_leitura.py`: `commits_recentes`, `ler_arquivo_repo` (recusa `.env*` e chaves,
    trunca em 40.000 caracteres); reaproveitar o cliente do webhook do GitHub se existir
  - Busca opcional do último evento no Sentry com `SENTRY_AUTH_TOKEN`, aplicando a mesma whitelist
  - Testes com `httpx.MockTransport`
  - _Requirements: 3.4, 3.10_

- [ ] 4. Diagnóstico do Rui
- [~] 4.1 Ferramentas do Rui e `pedir_ao_tobias` com atividades `delegou` de ida e volta
  - _Requirements: 3.2, 3.3, 7.3_
- [~] 4.2 `diagnosticar()`: loop do Rui (máx. 8 voltas), `Diagnostico` estruturado, tokens registrados,
  status `diagnosticado`, resumo do Orquestrador no chat, tratamento de falha
  - _Requirements: 3.1, 3.5, 3.7, 3.8, 3.9, 4.3, 4.4_
- [~] 4.3 Áreas proibidas aplicadas por código
  - Teste: arquivo suspeito em `prisma/` ou `auth` força `corrigivel_automaticamente=false`
  - _Requirements: 3.6_
- [~] 4.4 Limite por hora e aviso único de fila
  - Testes: 6º diagnóstico na hora fica na fila; só um aviso por hora
  - _Requirements: 4.1, 4.2_
- [~] 4.5 Ligar o webhook ao diagnóstico (só incidente novo, dentro do limite)
  - Teste de ponta a ponta com modelo simulado: webhook → incidente → diagnóstico → mensagem no chat
  - _Requirements: 3.1, 8.2_

- [~] 5. Rota `vigia` no supervisor
  - `Rota.proximo` com `"vigia"`, prompt atualizado e nó `no_vigia` que só lê incidentes
  - Testes: pergunta sobre erro vai para `vigia`; sem incidentes → resposta clara
  - _Requirements: 5.1, 5.2, 5.3_

- [~] 6. API de incidentes
  - `GET /api/incidentes`, `/resumo`, `/{id}`, `POST /{id}/status`, `POST /{id}/diagnosticar`
  - Testes: todas exigem sessão; diagnóstico manual respeita o limite
  - _Requirements: 6.4, 6.6_

- [~] 7. Front: tela de Incidentes
  - Página, navegação com contador, lista, detalhe do diagnóstico, botões de status, "Diagnosticar agora"
    e "Propor correção · em breve" desabilitado
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [~] 8. Front: escritório
  - Guarita com alerta ligada a `/api/incidentes/resumo`; Rui não vai à copa com incidente aberto;
    confirmar balão, log e envelope `vigia ↔ tech`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [~] 9. Script de teste e documentação
  - `scripts/seed_incidente.py` (payload de exemplo, assina com o segredo, URL por argumento)
  - README: seção "Conectar o Orion ao Vigia", novas variáveis, limitação do timeout do webhook
  - _Requirements: 8.3, 8.4_

- [~] 10. Verificação final
  - `.venv/bin/pytest -q` e `npm run build` sem erros; nenhum teste chama serviços reais
  - Relatório: arquivos alterados, mudanças no banco (para rodar o `setup_db.py` no Neon) e variáveis
    novas para cadastrar na Vercel
  - _Requirements: 8.1, 8.2_
