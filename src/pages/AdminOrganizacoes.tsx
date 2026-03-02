import AppLayout from "@/components/layout/AppLayout";
import { useAllOrganizations, useUpdateOrganization } from "@/hooks/use-organizations";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Crown } from "lucide-react";
import { Navigate } from "react-router-dom";

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
  { value: "custom", label: "Custom" },
];

export default function AdminOrganizacoes() {
  const { isSuperAdmin } = usePermissions();
  const { data: orgs, isLoading } = useAllOrganizations();
  const updateOrg = useUpdateOrganization();

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleToggleActive = (id: string, isActive: boolean) => {
    updateOrg.mutate({ id, is_active: !isActive });
  };

  const handleToggleEkkoa = (id: string, hasAccess: boolean) => {
    updateOrg.mutate({ id, has_ekkoa_access: !hasAccess });
  };

  const handlePlanChange = (id: string, plan: string) => {
    updateOrg.mutate({ id, plan });
  };

  const handleMaxUsersChange = (id: string, maxUsers: number) => {
    updateOrg.mutate({ id, max_users: maxUsers });
  };

  return (
    <AppLayout title="Painel Super Admin" subtitle="Gestão de organizações">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Organizações</p>
                <p className="text-2xl font-bold">{orgs?.length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-[hsl(var(--success))]/10">
                <Building2 className="h-5 w-5 text-[hsl(var(--success))]" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ativas</p>
                <p className="text-2xl font-bold">{orgs?.filter(o => o.is_active).length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-[hsl(var(--warning))]/10">
                <Crown className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Enterprise</p>
                <p className="text-2xl font-bold">{orgs?.filter(o => o.plan === "enterprise").length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-destructive/10">
                <Building2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inativas</p>
                <p className="text-2xl font-bold">{orgs?.filter(o => !o.is_active).length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Organizações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Plano</TableHead>
                   <TableHead>Máx. Usuários</TableHead>
                   <TableHead>Ekkoa</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead>Ativa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                     <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : orgs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhuma organização encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  orgs?.map(org => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{org.name}</p>
                          {org.trading_name && (
                            <p className="text-xs text-muted-foreground">{org.trading_name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{org.email}</TableCell>
                      <TableCell className="text-muted-foreground">{org.cnpj || "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={org.plan}
                          onValueChange={(v) => handlePlanChange(org.id, v)}
                        >
                          <SelectTrigger className="w-[130px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLAN_OPTIONS.map(p => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(org.max_users)}
                          onValueChange={(v) => handleMaxUsersChange(org.id, Number(v))}
                        >
                          <SelectTrigger className="w-[80px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[3, 5, 10, 15, 25, 50, 100].map(n => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={org.has_ekkoa_access}
                          onCheckedChange={() => handleToggleEkkoa(org.id, org.has_ekkoa_access)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={org.is_active ? "default" : "destructive"}>
                          {org.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={org.is_active}
                          onCheckedChange={() => handleToggleActive(org.id, org.is_active)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
