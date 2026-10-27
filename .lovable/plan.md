# Fechar o ciclo de transferência para atendimento humano

Escopo: somente `solicitar_atendimento_humano`, o texto de transferência em `notificationText` e um filtro em `localizar_estabelecimento`. Nada muda em autenticação, secrets, `mcp_request_log`, normalizador, resolução de canal, regras de pessoas/dedup do `criar_lead` ou nas outras ferramentas. Nenhum dado existente é alterado (só o lead da própria transferência recebe a nota e a marcação).

## 1. Parâmetros novos
`chat_id`, `nome_contato`, `empresa`, `cidade`, `produto_interesse`, `resumo`, além de `motivo`, `urgencia` e `lead_id`. "Não informado", variações e vazio já viram ausentes pelo normalizador central, que continua igual. Limites de tamanho são validados (texto até 500 caracteres, `resumo` até 1000).

## 2. Pessoa
Pelo `chat_id`: `resolveChannelFromChatId` + o mesmo `resolvePessoa` usado em `buscar_contato`/`criar_lead`, com criação permitida. A pessoa recebe o telefone ou canal real, e `nome_contato` só quando ela ainda não tem nome. Os campos já preenchidos nunca são sobrescritos.

## 3. Lead (sempre visível no Fera)
Ordem de busca, sempre restrita à NitsClean:
1. `lead_id` recebido, se existir na organização
2. `interaction_id` (comportamento atual)
3. lead mais recente com o mesmo `gptmaker_chat_id`
4. lead mais recente da mesma pessoa

Se nenhum existir, cria-se um lead: stage `novo`, origem Flora, canal derivado do `chat_id`, `empresa_nome`, `city`, `category` = produto, `contact_name`, `contact_phone` (WhatsApp), `gptmaker_chat_id`, `pessoa_id`. Os campos são os mesmos usados hoje por `criar_lead`.

## 4. Marcação e histórico
- `precisa_humano = true`.
- Uma nota é **acrescentada** ao fim de `description`, preservando o texto existente: `[27/10/2026 18:22] Transferência — Motivo: … | Urgência: … | Resumo: …`, no horário de Brasília.

## 5. Notificação de transferência
```text
👤 Atendimento transferido pela Flora   (lead_matriz: 🏢 Lead recebido da Matriz)
Cliente: <empresa> — <nome>
WhatsApp: https://wa.me/<numero>        (só canal WhatsApp)
Instagram: @<handle>                    (só canal Instagram, se houver)
Cidade: …
Produto: …
O que o cliente pediu: <resumo>
Motivo: …
Urgência: …
Ver no Fera: https://fera.exudustech.com.br/leads?lead=<id>

(Mensagem automática — não responda aqui; abra o link.)
```
Linhas sem valor são omitidas. O texto do agendamento continua o mesmo.

## 6. Anti-duplicação (30 min)
Antes de notificar, o sistema procura em `notification_logs` um envio de `transferencia` ou `lead_matriz` com o mesmo `lead_id` nos últimos 30 minutos. Como o chat sempre leva ao mesmo lead, isso cobre "mesmo chat ou lead". Se houver envio recente:
- a nota é registrada, mas a equipe não é notificada de novo;
- com urgência `alta`, a equipe é notificada com o título "⏰ Cliente cobrando retorno".

A consulta roda junto com o envio em segundo plano. Uma falha nela nunca quebra a resposta.

## 7. `localizar_estabelecimento`
Candidatos fora do RJ são descartados: o componente `administrative_area_level_1` precisa ser "RJ" ou "Rio de Janeiro", ou o CEP precisa estar entre 20000-000 e 28999-999. Candidatos sem nenhum desses dados continuam valendo. O descarte acontece antes da correspondência exata e das mensagens. Sem candidatos restantes, vale o fallback atual.

## 8. Resposta
`success` com `{ solicitado: true, lead_id, lead_criado, notificado, urgencia }`, sem `next_action_hint` e sem frase pronta.

## 9. tools/list
O schema de `solicitar_atendimento_humano` passa a listar os novos parâmetros com descrições.

## Testes (mock de fetch e do banco)
- Sem lead: o lead é criado com `chat_id` de WhatsApp, pessoa, telefone e `pessoa_id`.
- Lead existente pelo `gptmaker_chat_id`: nenhum lead novo é criado, e a nota é acrescentada sem apagar a descrição.
- "não informado" em `empresa` e `cidade` é tratado como ausente.
- Notificação com wa.me, resumo e link exato do lead; Instagram mostra @.
- Segunda transferência em menos de 30 min: sem envio; com urgência alta, envia "⏰ Cliente cobrando retorno".
- MATRIZ mantém o título atual.
- Resposta sem `next_action_hint` nem frase pronta.
- `localizar_estabelecimento`: o candidato de Cariacica-ES é descartado.

Depois: rodar os testes MCP e fazer o deploy da `mcp`, com o `mcp_request_log` preservado.
