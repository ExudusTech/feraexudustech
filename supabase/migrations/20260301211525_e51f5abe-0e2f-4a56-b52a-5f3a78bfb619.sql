
-- 1. client_visits - Visitas registradas a clientes
CREATE TABLE public.client_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  visited_by UUID NOT NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_type TEXT NOT NULL DEFAULT 'presencial',
  subject TEXT,
  notes TEXT,
  outcome TEXT,
  next_visit_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.client_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view client_visits in their org" ON public.client_visits FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert client_visits in their org" ON public.client_visits FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND visited_by = auth.uid());
CREATE POLICY "Users can update client_visits in their org" ON public.client_visits FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete client_visits" ON public.client_visits FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- 2. ekkoa_coverage_areas - Áreas de cobertura geográfica
CREATE TABLE public.ekkoa_coverage_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  city TEXT,
  state TEXT,
  zip_code_start TEXT,
  zip_code_end TEXT,
  radius_km NUMERIC,
  latitude NUMERIC,
  longitude NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.ekkoa_coverage_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ekkoa_coverage_areas in their org" ON public.ekkoa_coverage_areas FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_coverage_areas in their org" ON public.ekkoa_coverage_areas FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_coverage_areas in their org" ON public.ekkoa_coverage_areas FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_coverage_areas" ON public.ekkoa_coverage_areas FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- 3. ekkoa_fragrance_lines - Linhas de fragrâncias disponíveis
CREATE TABLE public.ekkoa_fragrance_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  intensity TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.ekkoa_fragrance_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ekkoa_fragrance_lines in their org" ON public.ekkoa_fragrance_lines FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_fragrance_lines in their org" ON public.ekkoa_fragrance_lines FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_fragrance_lines in their org" ON public.ekkoa_fragrance_lines FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_fragrance_lines" ON public.ekkoa_fragrance_lines FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- 4. ekkoa_product_fragrance_lines - Relação entre produtos e fragrâncias
CREATE TABLE public.ekkoa_product_fragrance_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  fragrance_line_id UUID NOT NULL REFERENCES public.ekkoa_fragrance_lines(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ekkoa_product_fragrance_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ekkoa_product_fragrance_lines in their org" ON public.ekkoa_product_fragrance_lines FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_product_fragrance_lines in their org" ON public.ekkoa_product_fragrance_lines FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update ekkoa_product_fragrance_lines in their org" ON public.ekkoa_product_fragrance_lines FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_product_fragrance_lines" ON public.ekkoa_product_fragrance_lines FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- 5. ekkoa_technical_visits - Visitas técnicas registradas
CREATE TABLE public.ekkoa_technical_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  installation_id UUID REFERENCES public.ekkoa_installations(id),
  client_id UUID REFERENCES public.ekkoa_clients(id),
  technician_id UUID,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_type TEXT NOT NULL DEFAULT 'manutencao',
  status TEXT NOT NULL DEFAULT 'agendada',
  description TEXT,
  findings TEXT,
  recommendations TEXT,
  next_visit_date DATE,
  duration_minutes INTEGER,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.ekkoa_technical_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ekkoa_technical_visits in their org" ON public.ekkoa_technical_visits FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert ekkoa_technical_visits in their org" ON public.ekkoa_technical_visits FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Users can update ekkoa_technical_visits in their org" ON public.ekkoa_technical_visits FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Admins can delete ekkoa_technical_visits" ON public.ekkoa_technical_visits FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));
