import { useEffect, useState } from "react";
import { useOrganization, useUpdateOrganization } from "@/hooks/use-organizations";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";

const FIELDS = [
  { key: "raio_checkin_m", label: "Raio do check-in (metros)", def: 300, min: 50, max: 5000 },
  { key: "confirmacao_dia_horas_antes", label: "Confirmação no dia (horas antes)", def: 2, min: 1, max: 12 },
  { key: "alerta_atraso_min", label: "Alerta de atraso sem check-in (min)", def: 15, min: 5, max: 120 },
  { key: "retencao_localizacao_dias", label: "Guardar localização exata (dias)", def: 180, min: 30, max: 730 },
  { key: "retencao_fotos_dias", label: "Guardar fotos (dias)", def: 730, min: 90, max: 3650 },
] as const;

export default function FieldOpsSettings() {
  const { data: org } = useOrganization();
  const update = useUpdateOrganization();
  const { isAdmin } = usePermissions();
  const o = (org ?? {}) as Record<string, any>;
  const [values, setValues] = useState<Record<string, string>>({});
  const [d1, setD1] = useState("17:00");
  useEffect(() => {
    if (!org) return;
    setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(o[f.key] ?? f.def)])));
    setD1(o.confirmacao_d1_hora ?? "17:00");
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const payload: Record<string, unknown> = { confirmacao_d1_hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(d1) ? d1 : "17:00" };
    for (const f of FIELDS) { const n = Math.round(Number(values[f.key])); payload[f.key] = Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.def; }
    update.mutate(payload as any);
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Visitas em campo</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Confirmação D-1 (horário)</Label><Input type="time" value={d1} onChange={(e) => setD1(e.target.value)} disabled={!isAdmin} /></div>
          {FIELDS.map((f) => (
            <div key={f.key}><Label>{f.label}</Label>
              <Input type="number" min={f.min} max={f.max} value={values[f.key] ?? ""} disabled={!isAdmin}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} /></div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">A localização do consultor é registrada só ao tocar em Iniciar. Depois do prazo, as coordenadas exatas são apagadas e fica só a distância.</p>
        {isAdmin && <Button onClick={save} disabled={update.isPending}>Salvar</Button>}
      </CardContent>
    </Card>
  );
}
