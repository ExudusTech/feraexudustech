import AppLayout from "@/components/layout/AppLayout";
import { useOrganization, useUpdateOrganization } from "@/hooks/use-organizations";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, Palette, Globe, Save } from "lucide-react";
import { useState, useEffect } from "react";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
  custom: "Custom",
};

export default function Configuracoes() {
  const { isAdmin } = usePermissions();
  const { data: org, isLoading } = useOrganization();
  const updateOrg = useUpdateOrganization();

  const [form, setForm] = useState({
    name: "", trading_name: "", cnpj: "", email: "", phone: "",
    website: "", address: "", city: "", state: "", zip_code: "",
    primary_color: "", secondary_color: "", accent_color: "",
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
        primary_color: org.primary_color || "#1B365D",
        secondary_color: org.secondary_color || "#2C5F2D",
        accent_color: org.accent_color || "#7FCAD4",
      });
    }
  }, [org]);

  const handleSave = () => {
    if (!org) return;
    updateOrg.mutate({ id: org.id, ...form });
  };

  const Field = ({ label, name, type = "text", disabled = false }: { label: string; name: keyof typeof form; type?: string; disabled?: boolean }) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        value={form[name]}
        onChange={(e) => setForm(prev => ({ ...prev, [name]: e.target.value }))}
        disabled={disabled || !isAdmin}
      />
    </div>
  );

  if (isLoading) {
    return (
      <AppLayout title="Configurações" subtitle="Ajustes do sistema">
        <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Configurações"
      subtitle="Ajustes do sistema"
      actions={
        isAdmin ? (
          <Button onClick={handleSave} disabled={updateOrg.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6 max-w-4xl">
        {/* Plan info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Plano da Organização
              </span>
              <Badge variant="secondary" className="text-sm">
                {PLAN_LABELS[org?.plan || "starter"]}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Máximo de <strong className="text-foreground">{org?.max_users}</strong> usuários permitidos neste plano.
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Dados da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Razão Social" name="name" />
              <Field label="Nome Fantasia" name="trading_name" />
              <Field label="CNPJ" name="cnpj" />
              <Field label="E-mail" name="email" />
              <Field label="Telefone" name="phone" />
              <Field label="Website" name="website" />
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Field label="Endereço" name="address" />
              </div>
              <Field label="Cidade" name="city" />
              <Field label="Estado" name="state" />
              <Field label="CEP" name="zip_code" />
            </div>
          </CardContent>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Identidade Visual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Cor Primária</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={(e) => setForm(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="h-9 w-12 rounded border border-input cursor-pointer"
                    disabled={!isAdmin}
                  />
                  <Input
                    value={form.primary_color}
                    onChange={(e) => setForm(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="flex-1"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cor Secundária</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.secondary_color}
                    onChange={(e) => setForm(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="h-9 w-12 rounded border border-input cursor-pointer"
                    disabled={!isAdmin}
                  />
                  <Input
                    value={form.secondary_color}
                    onChange={(e) => setForm(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="flex-1"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cor de Destaque</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.accent_color}
                    onChange={(e) => setForm(prev => ({ ...prev, accent_color: e.target.value }))}
                    className="h-9 w-12 rounded border border-input cursor-pointer"
                    disabled={!isAdmin}
                  />
                  <Input
                    value={form.accent_color}
                    onChange={(e) => setForm(prev => ({ ...prev, accent_color: e.target.value }))}
                    className="flex-1"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30">
              <p className="text-sm text-muted-foreground mb-2">Pré-visualização</p>
              <div className="flex gap-3">
                <div className="h-12 w-12 rounded-lg" style={{ backgroundColor: form.primary_color }} />
                <div className="h-12 w-12 rounded-lg" style={{ backgroundColor: form.secondary_color }} />
                <div className="h-12 w-12 rounded-lg" style={{ backgroundColor: form.accent_color }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
