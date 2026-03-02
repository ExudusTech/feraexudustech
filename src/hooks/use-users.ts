import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface UserProfile {
  id: string;
  user_id: string;
  organization_id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface UserWithRole extends UserProfile {
  role: string;
}

export function useOrganizationUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org_users", user?.organization_id],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch roles for each user
      const userIds = profiles.map((p: any) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const roleMap = new Map<string, string>();
      roles?.forEach((r: any) => roleMap.set(r.user_id, r.role));

      return profiles.map((p: any) => ({
        ...p,
        role: roleMap.get(p.user_id) || "user",
      })) as UserWithRole[];
    },
    enabled: !!user,
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<UserProfile> & { id: string }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_users"] });
      toast({ title: "Usuário atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: role as any })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_users"] });
      toast({ title: "Perfil atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
