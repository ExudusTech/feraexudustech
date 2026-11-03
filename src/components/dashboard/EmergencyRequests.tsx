import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { baseAction } from "@/lib/base-instalada";

/** Manager queue: approve (pick date/time) or refuse urgent maintenance visit requests. */
export default function EmergencyRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { roles = [] } = usePermissions() as any;
  const isManager = (roles as string[]).some((r) => ["admin", "gestor", "super_admin"].includes(r));
  const { data = [] } = useQuery({
    queryKey: ["pedidos-emergenciais", user?.organization_id], enabled: !!user?.organization_id && isManager, refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("maintenance_schedule").select("id, title, description, created_at, clients(name, city)")
        .eq("organization_id", user!.organization_id).eq("urgente", true).eq("aprovacao_status", "pendente").order("created_at");
      return (data ?? []) as any[];
    },
  });
  const [form, setForm] = useState<Record<string, { data: string; hora: string; motivo: string }>>({});
  if (!isManager || !data.length) return null;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const decide = async (id: string, aprovar: boolean) => {
    const f = form[id] ?? { data: tomorrow, hora: "09:00", motivo: "" };
    try {
      await baseAction({ action: "pedido_decidir", id, aprovar, data: f.data || tomorrow, hora: f.hora || "09:00", motivo: f.motivo });
      qc.invalidateQueries({ queryKey: ["pedidos-emergenciais"] }); qc.invalidateQueries({ queryKey: ["schedules"] });
      toast({ title: aprovar ? "Visita emergencial agendada" : "Pedido recusado" });
    } catch (e) { toast({ title: "Atenção", description: e instanceof Error ? e.message : "Erro", variant: "destructive" }); }
  };
  return (
    <Card className="border-destructive">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Siren className="h-4 w-4 text-destructive" />Pedidos emergenciais ({data.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {data.map((p) => {
          const f = form[p.id] ?? { data: tomorrow, hora: "09:00", motivo: "" };
          const set = (patch: Partial<typeof f>) => setForm({ ...form, [p.id]: { ...f, ...patch } });
          return (
            <div key={p.id} className="rounded-md border p-3 space-y-2 text-sm">
              <p><strong>{p.clients?.name}</strong>{p.clients?.city && ` · ${p.clients.city}`} — {p.title}{p.description && ` · ${p.description}`}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <Input type="date" className="w-40" value={f.data} onChange={(e) => set({ data: e.target.value })} aria-label="Data" />
                <Input type="time" className="w-28" value={f.hora} onChange={(e) => set({ hora: e.target.value })} aria-label="Horário" />
                <Button size="sm" onClick={() => decide(p.id, true)}>Aprovar e agendar</Button>
                <Input className="w-48" placeholder="Motivo da recusa" value={f.motivo} onChange={(e) => set({ motivo: e.target.value })} maxLength={200} />
                <Button size="sm" variant="outline" disabled={f.motivo.trim().length < 3} onClick={() => decide(p.id, false)}>Recusar</Button>
              </div>
            </div>);
        })}
      </CardContent>
    </Card>
  );
}
