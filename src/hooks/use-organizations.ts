import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";

export interface Organization {
  id: string;
  name: string;
  trading_name: string | null;
  cnpj: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  plan: string;
  max_users: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export function useOrganization() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["organization", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", user!.organization_id!)
        .single();
      if (error) throw error;
      return data as Organization;
    },
    enabled: !!user?.organization_id,
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Organization> & { id: string }) => {
      const { data, error } = await supabase
        .from("organizations")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization"] });
      toast({ title: "Organização atualizada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// Super Admin: view all organizations
export function useAllOrganizations() {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: ["all_organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Organization[];
    },
    enabled: isSuperAdmin,
  });
}
