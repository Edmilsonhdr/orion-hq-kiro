---
inclusion: always
---

# Orion HQ — produto

## O que é

O Orion HQ é o ecossistema de agentes de IA da empresa de Dimi e Jullyana, sócios do **Orion** (app B2C de saúde
com copiloto de IA). Ele funciona como um "chefe de gabinete" dos dois: responde perguntas sobre o projeto,
acompanha o que muda no código, marca reuniões e registra decisões.

O Orion HQ é um produto **separado** do app Orion. Ele observa o repositório do Orion, mas não altera o app.

## Usuários

Apenas dois usuários humanos, com o mesmo nível de acesso:

- **Dimi** — desenvolvedor, faz a maior parte das mudanças no código.
- **Jullyana** — sócia; pergunta sobre o andamento e decide junto.

Toda a interface e todas as respostas dos agentes são em **português do Brasil**. Fuso: `America/Sao_Paulo`.

## Hierarquia de agentes

| Nível | Agente (id) | Papel |
|---|---|---|
| N1 | Orquestrador (`orq`) | Único que fala com os humanos. Entende o pedido, delega, consolida e responde. Nunca executa tarefas. |
| N2 | Tech (`tech`) | O que mudou/foi construído no Orion: PRs, decisões técnicas. |
| N2 | Agenda (`agenda`) | Propõe reuniões e monta pautas. |
| N2 | Negócios (`negocios`) | Custos, métricas, assinaturas, decisões de negócio. |
| N3 | Workers (`work`) | Tarefas curtas e baratas (ex.: resumir o diff de um PR). Usam modelo menor. |

Novos especialistas devem poder ser adicionados só registrando um nó novo no grafo e um id novo no front.

## Regras de comportamento (inegociáveis)

1. **Nada inventado.** Especialistas consultam o histórico antes de responder e citam a fonte (PR ou nota + data).
   Se não encontrarem, dizem que não encontraram.
2. **Especialistas propõem, humanos aprovam.** Qualquer ação com efeito fora do sistema (criar reunião, enviar
   e-mail, e no futuro qualquer escrita externa) passa por aprovação explícita de Dimi ou Jullyana.
3. **Tudo é observável.** Cada passo de cada agente vira uma "atividade" registrada, que alimenta o escritório
   virtual e o log. Se não está no log, não aconteceu.
4. **Sem loops.** O Orquestrador tem um limite de delegações por pedido (4) e depois responde com o que tiver.

## Superfícies

- **Chat do grupo** — conversa compartilhada entre Dimi, Jullyana e o Orquestrador.
- **Escritório virtual** — visualização em pixel art dos agentes trabalhando em tempo real (quem está ativo,
  o que está fazendo, delegações "andando" entre mesas, tokens gastos).
- **Aprovações** — fila de ações esperando decisão, com Aprovar/Recusar.

## Fora do escopo desta fase

Telegram, integração real com Google Calendar via API (usamos link de "adicionar ao Google Agenda" + .ics),
busca vetorial (usamos full-text search do Postgres), e-mail, agentes de marketing/suporte/financeiro.
