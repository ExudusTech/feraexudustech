
-- =============================================
-- SISTEMA CENTRAL + SUPORTE
-- =============================================

-- 1. Super Admins
CREATE TABLE public.super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view super_admins" ON public.super_admins FOR SELECT USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins can manage super_admins" ON public.super_admins FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_super_admins_updated_at BEFORE UPDATE ON public.super_admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Audit Logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);

CREATE POLICY "Admins can view audit_logs in their org" ON public.audit_logs FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Super admins can view all audit_logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'super_admin'));

-- 3. SaaS Plans
CREATE TABLE public.saas_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC NOT NULL DEFAULT 0,
  price_yearly NUMERIC DEFAULT 0,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_storage_mb INTEGER NOT NULL DEFAULT 500,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active plans" ON public.saas_plans FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Super admins can manage plans" ON public.saas_plans FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_saas_plans_updated_at BEFORE UPDATE ON public.saas_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. SaaS Modules
CREATE TABLE public.saas_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.saas_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active modules" ON public.saas_modules FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Super admins can manage modules" ON public.saas_modules FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_saas_modules_updated_at BEFORE UPDATE ON public.saas_modules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Plan-Module junction
CREATE TABLE public.saas_plan_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.saas_plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.saas_modules(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, module_id)
);

ALTER TABLE public.saas_plan_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view plan_modules" ON public.saas_plan_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins can manage plan_modules" ON public.saas_plan_modules FOR ALL USING (has_role(auth.uid(), 'super_admin'));

-- 6. Support Tickets
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  ticket_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  priority TEXT NOT NULL DEFAULT 'media',
  status TEXT NOT NULL DEFAULT 'aberto',
  assigned_to UUID,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_support_tickets_org ON public.support_tickets(organization_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_created_by ON public.support_tickets(created_by);

CREATE POLICY "Users can view tickets in their org" ON public.support_tickets FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert tickets in their org" ON public.support_tickets FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update tickets in their org" ON public.support_tickets FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete tickets" ON public.support_tickets FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Super admins can view all tickets" ON public.support_tickets FOR SELECT USING (has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Internal Messages
CREATE TABLE public.internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  subject TEXT,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'texto',
  is_internal BOOLEAN NOT NULL DEFAULT false,
  sender_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_internal_messages_org ON public.internal_messages(organization_id);
CREATE INDEX idx_internal_messages_ticket ON public.internal_messages(ticket_id);
CREATE INDEX idx_internal_messages_sender ON public.internal_messages(sender_id);

CREATE POLICY "Users can view messages in their org" ON public.internal_messages FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert messages in their org" ON public.internal_messages FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND sender_id = auth.uid());
CREATE POLICY "Users can update their own messages" ON public.internal_messages FOR UPDATE USING (sender_id = auth.uid());
CREATE POLICY "Admins can delete messages" ON public.internal_messages FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_internal_messages_updated_at BEFORE UPDATE ON public.internal_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Message Participants
CREATE TABLE public.message_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  message_id UUID NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_participants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_message_participants_org ON public.message_participants(organization_id);
CREATE INDEX idx_message_participants_message ON public.message_participants(message_id);
CREATE INDEX idx_message_participants_user ON public.message_participants(user_id);

CREATE POLICY "Users can view their participations" ON public.message_participants FOR SELECT USING (user_id = auth.uid() OR organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert participants in their org" ON public.message_participants FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update their own read status" ON public.message_participants FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins can delete participants" ON public.message_participants FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'));
