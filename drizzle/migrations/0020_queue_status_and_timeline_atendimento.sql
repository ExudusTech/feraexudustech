ALTER TABLE public.notification_logs DROP CONSTRAINT notification_logs_status_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_status_check CHECK (status = ANY (ARRAY['SENT','FAILED','SKIPPED','QUEUED','SENDING']));
ALTER TABLE public.lead_timeline DROP CONSTRAINT lead_timeline_tipo_check;
ALTER TABLE public.lead_timeline ADD CONSTRAINT lead_timeline_tipo_check CHECK (tipo = ANY (ARRAY['resumo','criar_lead','agendamento','transferencia','fora_perfil','encerramento','atendimento']));