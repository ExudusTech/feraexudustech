import { useEffect, useState } from "react";
import { useOrganization, useUpdateOrganization } from "@/hooks/use-organizations";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText } from "lucide-react";
import { DEFAULT_PROPOSTA_CONFIG, type PropostaConfig } from "@/lib/proposta-config";
import PropostaLogos from "@/components/settings/PropostaLogos";

const LONG: [keyof PropostaConfig, string][] = [
  ["txt_empresa", "Nit's Clean (quem somos)"], ["txt_parcerias", "Parcerias com marcas líderes"],
  ["txt_tecnologia", "Tecnologia"], ["txt_consultoria", "Consultoria personalizada"],
];
const SHORT: [keyof PropostaConfig, string][] = [
  ["slogan", "Frase da capa"], ["experiencia", "Experiência (capa)"], ["faixa", "Faixa de destaque"],
  ["forma_pagamento", "Forma de pagamento padrão"], ["prazo_entrega", "Prazo de entrega padrão"], ["periodicidade_manutencao", "Manutenção padrão"],
  ["validade_dias", "Validade padrão (dias)"], ["whatsapp", "WhatsApp (Flora)"], ["site", "Site"], ["instagram", "Instagram"],
];

/** Texts and defaults of the proposal PDF. Empty field = standard text. */
export default function PropostaSettings() {
  const { data: org } = useOrganization();
  const update = useUpdateOrganization();
  const { isAdmin } = usePermissions();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    const c = ((org as Record<string, any> | undefined)?.proposta_config ?? {}) as Record<string, unknown>;
    setV(Object.fromEntries(Object.keys(DEFAULT_PROPOSTA_CONFIG).map((k) => [k, c[k] != null ? String(c[k]) : ""])));
  }, [org]);
  const save = () => {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const t = val.trim(); if (!t) continue;
      if (k === "validade_dias") { const n = Math.round(Number(t)); if (n > 0 && n <= 365) out[k] = n; } else out[k] = t.slice(0, 1000);
    }
    const atual = ((org as Record<string, any> | undefined)?.proposta_config ?? {}) as Record<string, unknown>;
    if (Array.isArray(atual.logos)) out.logos = atual.logos; // logos are managed by their own area
    update.mutate({ id: (org as any)?.id, proposta_config: out } as any);
  };
  const ph = (k: keyof PropostaConfig) => String(DEFAULT_PROPOSTA_CONFIG[k]);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Proposta em PDF</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Deixe em branco para usar o texto padrão (mostrado em cinza).</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {SHORT.map(([k, label]) => (
            <div key={k}><Label>{label}</Label><Input value={v[k] ?? ""} placeholder={ph(k)} disabled={!isAdmin} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
          ))}
        </div>
        {LONG.map(([k, label]) => (
          <div key={k}><Label>{label}</Label><Textarea rows={3} value={v[k] ?? ""} placeholder={ph(k)} disabled={!isAdmin} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
        {isAdmin && <Button onClick={save} disabled={update.isPending}>Salvar</Button>}
        {(org as any)?.id && <PropostaLogos orgId={(org as any).id} config={((org as any).proposta_config ?? {}) as Record<string, unknown>} canEdit={isAdmin} />}
      </CardContent>
    </Card>
  );
}
