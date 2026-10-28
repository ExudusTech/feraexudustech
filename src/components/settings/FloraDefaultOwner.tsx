import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organizations";
import { useOrganizationUsers } from "@/hooks/use-users";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const NONE = "__none__";

export default function FloraDefaultOwner() {
  const { user } = useAuth();
  const { role, isSuperAdmin } = usePermissions();
  const { data: org } = useOrganization();
  const { data: users = [] } = useOrganizationUsers();
  const qc = useQueryClient();
  const [owner, setOwner] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);
  const canEdit = isSuperAdmin || role === "admin" || role === "gestor";

  useEffect(() => {
    setOwner(((org as any)?.flora_default_lead_owner as string | null) ?? NONE);
  }, [org]);

  const save = async () => {
    if (!user?.organization_id) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("apply_flora_default_owner", {
      _org: user.organization_id,
      _owner: owner === NONE ? null : owner,
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível salvar", description: "Verifique o usuário escolhido e tente novamente.", variant: "destructive" });
      return;
    }
    const r = (data ?? {}) as { leads?: number; schedules?: number };
    qc.invalidateQueries({ queryKey: ["organization"] });
    toast({ title: "Responsável salvo", description: `${r.leads ?? 0} lead(s) e ${r.schedules ?? 0} visita(s) da Flora atribuídos.` });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Responsável padrão dos leads da Flora</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Leads e visitas criados pela Flora ficam com este responsável. Ao salvar, os que estão sem responsável também passam para ele.
        </p>
        <div className="space-y-1.5 max-w-sm">
          <Label>Responsável</Label>
          <Select value={owner} onValueChange={setOwner} disabled={!canEdit}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem responsável padrão</SelectItem>
              {users.filter((u) => u.is_active).map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canEdit && <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>}
      </CardContent>
    </Card>
  );
}
