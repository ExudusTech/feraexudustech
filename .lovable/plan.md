# Lote 8 — Horário de atendimento humano e feriados

## Situação atual (verificada)
- Já existe a tabela `holidays` (data, nome, cidade, organization_id) com 28 feriados compartilhados (nacionais + RJ, 2026 e 2027). Hoje ela só é usada para pular dias em rotas/agendamentos.
- Transferência e Matriz notificam a equipe na hora (`solicitar_atendimento_humano`, eventos `transferencia` / `lead_matriz`), com anti-dup de 30 min, exceto urgência alta.
- Não existe horário de atendimento configurado nem fila de avisos.

## Recomendações de regra
- **Agendamentos (comercial e técnico): continuam avisando na hora.** É informativo, a visita já tem data, e o consultor pode querer planejar no fim de semana. Nada muda neles.
- **Transferência, Matriz e cobrança de retorno: seguem o horário humano** (fila fora do horário).
- **Urgência alta:** padrão "também espera", com chave configurável "Urgência alta avisa na hora mesmo fora do horário" (desligada).
- **Mensagem dentro do horário:** "Já passei sua solicitação para nossa equipe, que vai te responder por aqui em breve."
- **Fora do horário:** "Nossa equipe de atendimento retoma na terça-feira, 03/11, a partir das 8h. Já deixei sua solicitação registrada e ela será a primeira a ser encaminhada nesse horário. 😊"

## 1. Banco
- `organizations`: novos campos `human_hours` (dias da semana + início/fim, padrão seg–sex 08:00–18:00), `human_timezone` (padrão America/Sao_Paulo), `human_urgent_bypass` (padrão falso).
- `holidays`: novo campo `scope` (`nacional` | `estadual_rj` | `municipal`); municipal exige cidade. Backfill dos 28 atuais (nacionais vs. estaduais RJ por data/nome). Os compartilhados continuam editáveis só por super admin; o admin da org cadastra os municipais e ajustes próprios (regra do AGENTS.md mantida). Conferir que os 28 cobrem 2026–2027 por completo e incluir os faltantes.
- Fila: `notification_logs` ganha `status` `queued`, `queued_at` e `release_at`. Avisos fora do horário ficam `queued` com o payload pronto.
- Backup `backup_20261102_*` das linhas alteradas antes da migração.

## 2. Utilitário de horário (compartilhado)
- `supabase/functions/_shared/business-hours.ts` (e cópia testável no front): `estaEmHorario(agora, config, feriados, cidade?)` e `proximoHorarioUtil(agora, ...)` → data/hora + texto "terça-feira, 03/11, a partir das 8h". Considera fuso, fins de semana, feriados nacionais/RJ e municipais da cidade da org. Antes do horário no mesmo dia útil → "hoje, a partir das 8h".

## 3. mcp — solicitar_atendimento_humano (transferência, Matriz, cobrança)
- Calcula horário. Retorno ganha `em_horario` e `retorno_previsto` (ISO + texto) e a `mensagem_para_lead` acima.
- Dentro: comportamento atual.
- Fora: lead marcado precisa_humano normalmente; aviso entra na fila com `release_at` = próximo período útil; texto do aviso ganha "Recebido fora do horário em <data/hora>".
- Repetições fora do horário com aviso já na fila para o mesmo lead: só linha do tempo, sem novo aviso, mesma mensagem/retorno.
- Linha do tempo: "Transferência recebida fora do horário" na entrada; "encaminhada em <data/hora>" quando a fila envia.
- Agendar, imagens, produto, categoria e demais ferramentas: sem mudança.

## 4. Agendador
- Nova função `release-notification-queue`: pega `queued` com `release_at <= agora`, envia pelo GPT Maker com o mesmo token já existente, marca `sent`/`failed`, grava a linha do tempo. Execução única por aviso (trava por linha).
- Agendamento a cada 5 min (pg_cron + pg_net, habilitados se faltarem), protegido por um segredo interno gerado automaticamente — você não precisa configurar nada.

## 5. Telas (Configurações)
- Nova aba "Horário de atendimento": dias, início/fim, chave de urgência alta, prévia "Se alguém pedir atendimento agora: ...".
- Aba "Feriados": lista por ano, com abrangência; incluir/editar/remover (municipal pede cidade). Só admin/super admin.
- Linha do lead mostra "Aguardando abertura — enviará em <data>" enquanto o aviso estiver na fila.

## 6. Testes
- Utilitário: domingo à tarde → segunda 8h; 02/11/2026 (Finados, segunda) → terça 03/11 8h; sexta 19h → segunda; antes das 8h em dia útil → hoje 8h; feriado municipal só na cidade certa.
- mcp: dentro do horário avisa na hora + mensagem; fora → fila, `em_horario=false`, retorno previsto correto; repetição fora → só timeline; urgência alta com chave ligada/desligada; Matriz segue a mesma regra; agendamento continua avisando na hora.
- Fila: libera só após `release_at`, uma vez, grava timeline "encaminhada em".

## O que você precisa fazer
Nada a configurar. Depois de aplicado: publicar o site para as novas telas e revisar/incluir os feriados municipais.
