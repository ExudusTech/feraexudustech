-- ============================================================
-- Fera MCP — Onda 3 / Fase A: Sistema de Notificações
-- NitsClean / ExudusTech — Agosto 2026
-- ============================================================

-- ─── 1. notification_recipients ──────────────────────────────────────────────
-- Quem deve receber notificações, por papel/role.
-- Roles disponíveis: admin, consultor, financeiro, vendas
-- Um recipient pode ter múltiplos roles.

CREATE TABLE IF NOT EXISTS notification_recipients (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome            TEXT        NOT NULL,
  roles           TEXT[]      NOT NULL DEFAULT '{}',
  whatsapp        TEXT,                        -- E.164 sem + (ex: 5522999990001)
  email           TEXT,
  ativo           BOOLEAN     NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notification_recipients
  IS 'Destinatários de notificações internas do Fera. Roles: admin, consultor, financeiro, vendas.';
COMMENT ON COLUMN notification_recipients.roles
  IS 'Array de papéis. Ex: {admin, consultor}. Um recipient pode acumular múltiplos roles.';
COMMENT ON COLUMN notification_recipients.whatsapp
  IS 'Número WhatsApp formato E.164 sem + (ex: 5522999990001). Usado para envio via Florazap.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;

ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_recipients_org_access" ON notification_recipients
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_notif_recipients_org   ON notification_recipients (organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_recipients_roles ON notification_recipients USING GIN (roles);
CREATE INDEX IF NOT EXISTS idx_notif_recipients_ativo ON notification_recipients (ativo) WHERE ativo = TRUE;

-- ─── 2. notification_logs ────────────────────────────────────────────────────
-- Histórico de cada notificação enviada. Para auditoria e debug.

CREATE TABLE IF NOT EXISTS notification_logs (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,        -- ex: visita_agendada, manutencao_vencendo
  recipient_id    UUID        REFERENCES notification_recipients(id) ON DELETE SET NULL,
  recipient_name  TEXT,                        -- snapshot do nome no momento do envio
  channel         TEXT        NOT NULL DEFAULT 'WHATSAPP'
    CHECK (channel IN ('WHATSAPP','EMAIL','INTERNAL')),
  destination     TEXT,                        -- número ou e-mail de destino
  payload         JSONB,                       -- dados da notificação
  status          TEXT        NOT NULL DEFAULT 'SENT'
    CHECK (status IN ('SENT','FAILED','SKIPPED')),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notification_logs
  IS 'Log de todas as notificações disparadas pelo sistema Fera. Para auditoria e debug.';
COMMENT ON COLUMN notification_logs.event_type
  IS 'Tipo do evento. Ex: visita_agendada, visita_concluida, manutencao_vencendo, pedido_adicional.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_logs_org_access" ON notification_logs
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_notif_logs_org      ON notification_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event    ON notification_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_notif_logs_status   ON notification_logs (status);
CREATE INDEX IF NOT EXISTS idx_notif_logs_sent_at  ON notification_logs (sent_at DESC);
