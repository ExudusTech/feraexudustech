import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateOrganization, type Organization } from "@/hooks/use-organizations";
import { Loader2 } from "lucide-react";

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
  { value: "custom", label: "Custom" },
];

const MAX_USERS_OPTIONS = [3, 5, 10, 15, 25, 50, 100];

interface Props {
  org: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OrganizationEditDialog({ org, open, onOpenChange }: Props) {
  const updateOrg = useUpdateOrganization();
  const [form, setForm] = useState({
    name: "",
    trading_name: "",
    cnpj: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    plan: "starter",
    max_users: 5,
    has_ekkoa_access: false,
    is_active: true,
    primary_color: "",
    secondary_color: "",
    accent_color: "",
  });

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name || "",
        trading_name: org.trading_name || "",
        cnpj: org.cnpj || "",
        email: org.email || "",
        phone: org.phone || "",
        website: org.website || "",
        address: org.address || "",
        city: org.city || "",
        state: org.state || "",
        zip_code: org.zip_code || "",
        plan: org.plan || "starter",
        max_users: org.max_users || 5,
        has_ekkoa_access: org.has_ekkoa_access ?? false,
        is_active: org.is_active ?? true,
        primary_color: org.primary_color || "",
        secondary_color: org.secondary_color || "",
        accent_color: org.accent_color || "",
      });
    }
  }, [org]);

  const handleChange = (field: string, value: string | number | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!org) return;
    updateOrg.mutate(
      {
        id: org.id,
        name: form.name,
        trading_name: form.trading_name || null,
        cnpj: form.cnpj || null,
        email: form.email,
        phone: form.phone || null,
        website: form.website || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip_code: form.zip_code || null,
        plan: form.plan,
        max_users: form.max_users,
        has_ekkoa_access: form.has_ekkoa_access,
        is_active: form.is_active,
        primary_color: form.primary_color || null,
        secondary_color: form.secondary_color || null,
        accent_color: form.accent_color || null,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Organização</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          {/* Identificação */}
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={e => handleChange("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nome Fantasia</Label>
            <Input value={form.trading_name} onChange={e => handleChange("trading_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input value={form.cnpj} onChange={e => handleChange("cnpj", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail *</Label>
            <Input type="email" value={form.email} onChange={e => handleChange("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={e => handleChange("phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={form.website} onChange={e => handleChange("website", e.target.value)} />
          </div>

          {/* Endereço */}
          <div className="space-y-2 sm:col-span-2">
            <Label>Endereço</Label>
            <Input value={form.address} onChange={e => handleChange("address", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input value={form.city} onChange={e => handleChange("city", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <Input value={form.state} onChange={e => handleChange("state", e.target.value)} maxLength={2} />
          </div>
          <div className="space-y-2">
            <Label>CEP</Label>
            <Input value={form.zip_code} onChange={e => handleChange("zip_code", e.target.value)} />
          </div>

          {/* Plano */}
          <div className="space-y-2">
            <Label>Plano</Label>
            <Select value={form.plan} onValueChange={v => handleChange("plan", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Máx. Usuários</Label>
            <Select value={String(form.max_users)} onValueChange={v => handleChange("max_users", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAX_USERS_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cores */}
          <div className="space-y-2">
            <Label>Cor Primária</Label>
            <Input value={form.primary_color} onChange={e => handleChange("primary_color", e.target.value)} placeholder="#000000" />
          </div>
          <div className="space-y-2">
            <Label>Cor Secundária</Label>
            <Input value={form.secondary_color} onChange={e => handleChange("secondary_color", e.target.value)} placeholder="#000000" />
          </div>
          <div className="space-y-2">
            <Label>Cor de Destaque</Label>
            <Input value={form.accent_color} onChange={e => handleChange("accent_color", e.target.value)} placeholder="#000000" />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={form.has_ekkoa_access} onCheckedChange={v => handleChange("has_ekkoa_access", v)} />
            <Label>Acesso Ekkoa</Label>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={form.is_active} onCheckedChange={v => handleChange("is_active", v)} />
            <Label>Organização Ativa</Label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.name || !form.email || updateOrg.isPending}>
            {updateOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
