import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/use-organizations";
import { normalizeHumanHours, type ClosedDay } from "@/lib/business-hours";

export interface UpcomingHoliday { date: string; name: string; city: string | null }

/** Holidays that close human service (shared national/RJ + tenant). Source moves to the Google cache in Phase E. */
export function useClosedDays() {
  const { data: org } = useOrganization();
  return useQuery({
    queryKey: ["closed-days", org?.id],
    enabled: !!org?.id,
    queryFn: async (): Promise<UpcomingHoliday[]> => {
      const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("holidays").select("date, name, city")
        .or(`organization_id.is.null,organization_id.eq.${org!.id}`).gte("date", from).order("date");
      if (error) throw error;
      return (data ?? []) as UpcomingHoliday[];
    },
  });
}

export function useHumanService() {
  const { data: org } = useOrganization();
  const { data: holidays = [] } = useClosedDays();
  const o = (org ?? {}) as Record<string, any>;
  return {
    config: normalizeHumanHours(o.human_hours, o.human_timezone),
    closed: holidays.map((h) => ({ date: h.date, city: h.city })) as ClosedDay[],
    city: (o.city as string | null) ?? null,
    amarelo: Number(o.atendimento_alerta_amarelo_min ?? 15) || 15,
    vermelho: Number(o.atendimento_alerta_vermelho_min ?? 60) || 60,
    holidays,
  };
}
