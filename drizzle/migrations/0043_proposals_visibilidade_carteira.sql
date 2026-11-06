CREATE OR REPLACE FUNCTION public.can_see_proposal(_user uuid, _proposal uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = _proposal
    AND (has_role(_user,'super_admin') OR (p.organization_id = get_user_organization_id(_user)
      AND (is_privileged_user(_user) OR is_financeiro(_user) OR is_faturamento(_user)
        OR p.created_by = _user OR p.assigned_to = _user
        OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = p.lead_id AND l.assigned_to = _user)
        OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p.client_id AND c.assigned_user_id = _user)))))
$$;
DROP POLICY IF EXISTS "Users can view proposals in their org" ON public.proposals;
CREATE POLICY "Users can view proposals by portfolio" ON public.proposals FOR SELECT TO authenticated
  USING (public.can_see_proposal(auth.uid(), id));
DROP POLICY IF EXISTS "Users can update proposals in their org" ON public.proposals;
CREATE POLICY "Users can update proposals by portfolio" ON public.proposals FOR UPDATE TO authenticated
  USING (public.can_see_proposal(auth.uid(), id));
DROP POLICY IF EXISTS "Users can view proposal_items in their org" ON public.proposal_items;
CREATE POLICY "Users can view proposal_items by portfolio" ON public.proposal_items FOR SELECT TO authenticated
  USING (public.can_see_proposal(auth.uid(), proposal_id));