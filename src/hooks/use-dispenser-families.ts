import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface DispenserFamily {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  is_active: boolean;

  created_at: string;
}

export function useDispenserFamilies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dispenser_families", user?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispenser_families")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as DispenserFamily[];
    },
    enabled: !!user,
  });
}

export function familyLabel(families: DispenserFamily[], id: string | null | undefined) {
  if (!id) return null;
  return families.find((f) => f.id === id)?.name ?? null;
}
