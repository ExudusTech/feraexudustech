# Lote 10 — Execução da agenda em campo (PLANO)

## O que já existe (verificado)
- `schedules`: status em texto (hoje `agendado`, `em_andamento`, `concluido`, `cancelado`), `schedule_type/subtype`, `lead_id`, `assigned_to`, `source`, `zip_code`, `location`. **Sem** lat/long e sem campos de execução. Hoje não há nenhum agendamento gravado.
- `leads`: já tem `latitude`, `longitude`, `endereco`, `maps_url`, `gptmaker_chat_id`, `stage_id`.
- `lead_timeline` (tipo, resumo, proximo_passo, origem, referencia_id) — vai receber todos os eventos.
- `comodatos.ultima_manutencao / proxima_manutencao / periodicidade_manut`; `maintenance_schedule` (OS) com `comodato_id`, `tipo_os`.
- `notification_recipients.eventos[]`, fila QUEUED fora do horário humano, `release-notification-queue` (cron 5 min), `notify-schedule`, `atendimento-acoes` (envio GPT Maker com RLS do chamador).
- Bucket privado `visit-photos` já existe (URLs assinadas como nas imagens de produto).

## 1. Banco (migração, com backup `backup_<data>_schedules` das linhas alteradas)
- `schedules`: novos campos `latitude`, `longitude` (copiados do lead na criação; editáveis), `confirmacao_status` (pendente | confirmado | remarcar | sem_resposta | nao_aplicavel), `confirmado_em`, `checkin_em`, `checkout_em`, `duracao_min` (calculada), `resultado`, `resumo_execucao`, `nao_realizado_motivo`.
- Status passa a: `agendado → confirmado → em_atendimento → concluido | nao_realizado | cancelado`. Migração: `em_andamento → em_atendimento`. Gatilho de validação de transições (não pode encerrar sem próximo passo; não pode voltar de concluído).
- Nova tabela `schedule_checkins` (1 por agendamento): hora, lat/long, precisão, distância calculada no servidor, `fora_do_raio`, `sem_permissao`, justificativa.
- Nova tabela `schedule_evidencias`: foto (caminho no `visit-photos`), comodato_id opcional, observações, itens (refil reposto, problema encontrado — lista), autor.
- Nova tabela `schedule_proximo_passo`: tipo (novo_agendamento | proposta | follow_up | perdido), data alvo, motivo de perda, referência criada (novo schedule / proposta).
- `organizations`: `raio_checkin_m` (padrão 300), `confirmacao_d1_hora` (padrão 17:00), `confirmacao_dia_horas_antes` (padrão 2), `alerta_atraso_min` (padrão 15), `retencao_localizacao_dias`, `retencao_fotos_dias`.
- Novos eventos de notificação: `checkin_fora_do_local`, `visita_concluida` (+ `visita_sem_confirmacao` para o consultor).
- RLS: consultor lê/escreve só onde `assigned_to = auth.uid()`; gestor/admin vê toda a organização; tudo por `organization_id`. GRANTs para `authenticated` e `service_role`.
- Realtime ligado em `schedules` e `schedule_checkins` para o painel do gestor.

## 2. Funções no servidor
- **`visita-acoes`** (nova): check-in, evidência, check-out e não realizado. Lê o agendamento com o acesso de quem chama (mesmo padrão de `atendimento-acoes`), calcula distância (Haversine) no servidor, grava timeline, atualiza comodato (`ultima_manutencao = hoje`, `proxima_manutencao = hoje + periodicidade`), avança etapa do lead e dispara avisos em segundo plano. Duração calculada aqui.
- **`confirmar-visitas`** (nova, cron 15 min): manda D-1 às 17h e no dia 2h antes, via GPT Maker no chat do lead, só se houver `gptmaker_chat_id`/WhatsApp; respeita horário humano (D-1 fora do horário vai para o próximo período útil antes da visita; se não couber, não envia). Visitas manuais sem contato → `nao_aplicavel`. Sem resposta até 1h antes → aviso ao consultor. Deduplicação em `notification_logs`.
- **mcp (única mudança)**: nova ferramenta `responder_confirmacao_visita(chat_id, resposta: confirmo | remarcar)` — localiza o próximo agendamento desse chat/empresa; "confirmo" → status confirmado; "remarcar" → devolve `opcoes_horario` (mesma lógica de `consultar_rota_consultor`) e, após escolha, a Flora usa `agendar_visita_tecnica` normalmente (o antigo vira cancelado com motivo "remarcado"). Restante da mcp intacto.
- Alertas de atraso (15 min sem check-in) calculados no painel e enviados pelo mesmo cron ao gestor.

## 3. Telas
- **Hoje (consultor, celular)**: painel "Agora" no topo; lista do dia em ordem de horário com selo de tipo/status/confirmação e botões grandes: Rota (Maps), Ligar, WhatsApp, Iniciar / Encerrar.
- **Iniciar**: pede localização; mostra distância; fora do raio ou sem permissão → justificativa obrigatória.
- **Durante (manutenção/instalação/entrega)**: câmera do celular (foto obrigatória antes de encerrar), escolher comodato do cliente, observações, itens.
- **Encerrar**: resultado (visita boa/mediana/ruim ou concluída/com problema), resumo curto, próximo passo obrigatório; "novo agendamento" abre os horários sugeridos; "perdido" pede motivo e confirmação. Botão "Não realizado" separado (cliente ausente, cancelado no local, reagendar).
- **Painel do gestor (dashboard do dia)**: visitas por consultor com status ao vivo, mapa com check-ins (Google Maps já configurado), alertas (atrasado, fora do local), métricas da semana (realizadas/não realizadas, duração média, resultados). Cards clicáveis abrem a Agenda filtrada.
- Agenda: novos status e selo de confirmação em todas as visões; link do aviso abre `?agendamento=` (deep link já existente).
- Configurações: raio, horários de confirmação, atraso, retenção.

## 4. Etapas do lead
- Visita comercial concluída → "Visita realizada"; próximo passo proposta → "Proposta enviada" quando marcada como enviada; perdido → "Perdido" (com confirmação). Usa `lead_stages.chave`; se a etapa não existir na organização, só registra na timeline.

## 5. Avisos
- Check-out: cliente, consultor, tipo, resultado, duração, distância do check-in, próximo passo, link. Evento `visita_concluida`.
- Check-in fora do raio / sem localização: evento `checkin_fora_do_local`, imediato.
- Fora do horário humano: ficam na fila (regra atual). Proposta: `checkin_fora_do_local` é imediato mesmo fora do horário — confirmar.

## 6. LGPD e retenção
- Localização só do consultor, coletada **somente no clique** de Iniciar (sem rastreamento contínuo), com aviso na primeira vez. Não coletamos localização do cliente.
- Fotos: só do equipamento; orientar a não fotografar pessoas/documentos. Bucket privado, URL assinada 1h.
- Retenção padrão: coordenadas brutas apagadas após 180 dias (mantém distância e `fora_do_raio`); fotos após 24 meses ou fim do comodato + 6 meses. Limpeza por cron com registro em auditoria.
- Mensagens de confirmação: só para quem conversou com a Flora (base legal: execução do agendamento pedido). Texto sem dados sensíveis.
- Aviso ao gestor não inclui coordenadas, só distância.

## 7. Testes
- Transições de status (válidas/ inválidas; encerrar sem próximo passo é recusado).
- Distância Haversine e regra do raio (299 m ok, 301 m exige justificativa; sem permissão exige justificativa).
- Duração calculada.
- Confirmação: D-1 17h, dia −2h, respeito ao horário humano, sem envio sem contato, sem resposta → aviso ao consultor, sem duplicar.
- Comodato: próxima manutenção = hoje + periodicidade.
- Etapas do lead por resultado/próximo passo.
- Permissões: consultor não vê/edita agendamento de outro; gestor vê todos.
- mcp `responder_confirmacao_visita` e regressão do restante.

## 8. Ordem de entrega
A) Banco + `visita-acoes` + telas Iniciar/Encerrar/Hoje → B) avisos ao gestor → C) painel do gestor com mapa e ao vivo → D) confirmação D-1/dia + ferramenta mcp → E) retenção.

## Decisões para aprovar
1. Fotos obrigatórias só em manutenção/instalação/entrega (não em visita comercial) — ok?
2. Check-in fora do raio avisa imediatamente mesmo fora do horário humano?
3. Retenção: coordenadas 180 dias, fotos 24 meses?
4. Remarcação pela Flora cancela o antigo e cria um novo (histórico preservado) — ok?
5. Não existe tipo "entrega" hoje na Agenda; criar como novo tipo de serviço técnico.
6. Ação no GPT Maker: ativar a nova ferramenta `responder_confirmacao_visita` na Flora.
