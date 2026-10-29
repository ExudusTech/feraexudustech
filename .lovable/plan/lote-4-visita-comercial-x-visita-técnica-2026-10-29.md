# Lote 4 — Visita comercial x Visita técnica

## Situação atual (verificada)
- Destinatários hoje: 3, todos com o evento "agendamento" (1 sem "Lead da Matriz").
- A Flora grava a visita com tipo `visita_tecnica` + subtipo `PROSPECCAO`; a notificação diz "📅 Nova visita agendada pela Flora" e a mensagem ao lead diz "visita técnica".
- A Agenda já tem um classificador (Visita comercial / Visita técnica / Entrega / Manutenção) usado só no celular; o filtro atual é por subtipo (Prospecção, Diagnóstico...).
- Dentro do Fera, visitas nascem em: Agenda (formulário de agendamento), fluxo de instalação de teste/NF, e Manutenções (OS em tabela própria, tipos instalação/teste/manutenção/retirada). Comodatos hoje NÃO cria agendamento — nada a disparar ali.
- Nenhum agendamento criado no Fera notifica a equipe hoje.

## Passo 0 — Backup
`backup_20261029_notification_recipients` e `backup_20261029_schedules` (só linhas Flora alteradas), service-role-only.

## 1. Eventos de notificação
- "agendamento" vira `agendamento_comercial` + `agendamento_tecnico`.
- Tela Notificações: caixas "Agendamento — visita comercial", "Agendamento — visita técnica", "Transferência", "Lead da Matriz".
- Migração: quem tem "agendamento" passa a ter os dois (os 3 destinatários atuais).

## 2. Flora (`agendar_visita_tecnica`, nome mantido)
- Grava tipo `visita_comercial`, subtipo `PROSPECCAO` → exibido "Visita comercial".
- Título: "Visita Comercial — <empresa> — <cidade> [<produto>]".
- Notificação: evento `agendamento_comercial`, título "📅 Nova visita comercial agendada pela Flora".
- mensagem_para_lead: "visita comercial" no lugar de "visita técnica".
- Backfill: agendamentos já criados pela Flora passam ao tipo `visita_comercial` (com backup). Nada mais muda na mcp.

## 3. Notificação de agendamentos criados no Fera
Disparo no servidor: nova função de backend `notify-schedule`, chamada logo após salvar (Agenda, fluxo de instalação de teste, Manutenções). Ela:
- valida o login do usuário e lê o registro com as permissões dele (só da própria organização);
- classifica: visita comercial → `agendamento_comercial`; instalação de teste / manutenção / retirada / diagnóstico → `agendamento_tecnico`; entrega/NF → não notifica; criados pela Flora → ignorados (a mcp já avisa);
- envia em segundo plano para os destinatários do evento, no mesmo formato (cliente, onde, mapa, quando, tipo de serviço, link `/agenda?agendamento=<id>`; OS de Manutenções linkam `/manutencoes`) e registra em notification_logs;
- falha no aviso nunca impede o agendamento; evita envio duplicado do mesmo registro.

Por que não gatilho no banco: chamar a função a partir do banco exigiria um novo segredo compartilhado, e o lote proíbe mexer em secrets. A chamada acontece após gravar e toda a lógica/envio fica no servidor.

## 4. Agenda
- Selo de tipo em todas as visões: Visita comercial / Visita técnica / Entrega / Manutenção.
- Novo filtro "Tipo de serviço" com essas 4 opções (filtro de subtipo continua).
- Formulário da Agenda ganha campo "Tipo de serviço" para o tipo ficar explícito ao criar.

## 5. Testes
- Migração: lista com "agendamento" vira os dois eventos; demais mantidos.
- Flora: tipo `visita_comercial`, título novo, evento `agendamento_comercial`, mensagem "visita comercial".
- Interno técnico notifica só quem marcou `agendamento_tecnico`; comercial interno só `agendamento_comercial`; entrega e Flora não disparam.
- Classificador da Agenda e filtro.
- Rodar todos os testes, publicar `mcp` e `notify-schedule`.

## Fora do escopo
Autenticação, secrets, demais ferramentas da Flora.

## Detalhes técnicos
- Formatação/envio das mensagens extraída para `supabase/functions/_shared/team-notify.ts`, usado pela mcp e pela nova função (mesma saída da mcp hoje, só título/evento mudam).
- Classificação única em `src/lib/service-kind.ts` espelhada no compartilhado; `visita_comercial` reconhecido como comercial.
- Anti-duplicidade: consulta notification_logs por payload `schedule_id`/`maintenance_id` antes de enviar.
