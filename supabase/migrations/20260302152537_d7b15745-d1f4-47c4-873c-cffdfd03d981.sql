
-- Função helper: verifica se o usuário tem perfil restrito (vendedor)
CREATE OR REPLACE FUNCTION public.is_vendedor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'vendedor'
  )
$$;

-- Função helper: verifica se o usuário tem perfil consultor_tecnico
CREATE OR REPLACE FUNCTION public.is_consultor_tecnico(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'consultor_tecnico'
  )
$$;

-- Função helper: verifica se o usuário tem perfil operacional
CREATE OR REPLACE FUNCTION public.is_operacional(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'operacional'
  )
$$;

-- Função helper: verifica se o usuário tem perfil financeiro
CREATE OR REPLACE FUNCTION public.is_financeiro(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'financeiro'
  )
$$;

-- Função que verifica se o usuário tem perfil privilegiado (admin, super_admin, gestor)
CREATE OR REPLACE FUNCTION public.is_privileged_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'super_admin', 'gestor')
  )
$$;

-- =====================================================
-- CLIENTS: Vendedor vê apenas clientes atribuídos ou criados por ele
-- =====================================================
DROP POLICY IF EXISTS "Users can view clients in their org" ON public.clients;

CREATE POLICY "Users can view clients in their org"
ON public.clients
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    is_privileged_user(auth.uid())
    OR is_financeiro(auth.uid())
    OR created_by = auth.uid()
    OR assigned_user_id = auth.uid()
  )
);

-- =====================================================
-- LEADS: Vendedor vê apenas leads atribuídos ou criados por ele
-- =====================================================
DROP POLICY IF EXISTS "Users can view leads in their org" ON public.leads;

CREATE POLICY "Users can view leads in their org"
ON public.leads
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    is_privileged_user(auth.uid())
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

-- =====================================================
-- EKKOA_INSTALLATIONS: Consultor técnico vê apenas instalações atribuídas
-- =====================================================
DROP POLICY IF EXISTS "Users can view ekkoa_installations in their org" ON public.ekkoa_installations;

CREATE POLICY "Users can view ekkoa_installations in their org"
ON public.ekkoa_installations
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    is_privileged_user(auth.uid())
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

-- =====================================================
-- EKKOA_TECHNICAL_VISITS: Consultor técnico vê apenas suas visitas
-- =====================================================
DROP POLICY IF EXISTS "Users can view ekkoa_technical_visits in their org" ON public.ekkoa_technical_visits;

CREATE POLICY "Users can view ekkoa_technical_visits in their org"
ON public.ekkoa_technical_visits
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    is_privileged_user(auth.uid())
    OR created_by = auth.uid()
    OR technician_id = auth.uid()
  )
);

-- =====================================================
-- OPERATIONS: Operacional vê apenas operações atribuídas
-- =====================================================
DROP POLICY IF EXISTS "Users can view operations in their org" ON public.operations;

CREATE POLICY "Users can view operations in their org"
ON public.operations
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    is_privileged_user(auth.uid())
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

-- =====================================================
-- FINANCIAL_TRANSACTIONS: Financeiro + privilegiados
-- =====================================================
DROP POLICY IF EXISTS "Users can view financial_transactions in their org" ON public.financial_transactions;

CREATE POLICY "Users can view financial_transactions in their org"
ON public.financial_transactions
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    is_privileged_user(auth.uid())
    OR is_financeiro(auth.uid())
    OR created_by = auth.uid()
  )
);

-- =====================================================
-- OPERATIONAL_EXPENSES: Financeiro + privilegiados
-- =====================================================
DROP POLICY IF EXISTS "Users can view operational_expenses in their org" ON public.operational_expenses;

CREATE POLICY "Users can view operational_expenses in their org"
ON public.operational_expenses
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    is_privileged_user(auth.uid())
    OR is_financeiro(auth.uid())
    OR created_by = auth.uid()
  )
);
