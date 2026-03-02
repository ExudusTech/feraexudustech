import AppLayout from "@/components/layout/AppLayout";
import { useOrganizationUsers, useUpdateUserProfile, useUpdateUserRole } from "@/hooks/use-users";
import { usePermissions, AppRole } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, Shield, UserCheck, UserX, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import UserFormDialog from "@/components/usuarios/UserFormDialog";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "vendedor", label: "Vendedor" },
  { value: "consultor_tecnico", label: "Consultor Técnico" },
  { value: "operacional", label: "Operacional" },
  { value: "user", label: "Usuário" },
  { value: "financeiro", label: "Financeiro" },
  { value: "visitante", label: "Visitante" },
];

export default function Usuarios() {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin, getRoleLabel } = usePermissions();
  const { data: users, isLoading } = useOrganizationUsers();
  const updateProfile = useUpdateUserProfile();
  const updateRole = useUpdateUserRole();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleToggleActive = (profileId: string, currentActive: boolean) => {
    updateProfile.mutate({ id: profileId, is_active: !currentActive });
  };

  const handleRoleChange = (userId: string, role: string) => {
    updateRole.mutate({ userId, role });
  };

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin": return "destructive";
      case "admin": return "default";
      case "gestor": return "secondary";
      default: return "outline";
    }
  };

  return (
    <AppLayout
      title="Usuários"
      subtitle="Gestão de usuários da organização"
      actions={isAdmin ? (
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Usuário
        </Button>
      ) : undefined}
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{users?.length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-[hsl(var(--success))]/10">
                <UserCheck className="h-5 w-5 text-[hsl(var(--success))]" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ativos</p>
                <p className="text-2xl font-bold">{users?.filter(u => u.is_active).length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-destructive/10">
                <UserX className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inativos</p>
                <p className="text-2xl font-bold">{users?.filter(u => !u.is_active).length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Usuários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>E-mail Verificado</TableHead>
                  {isAdmin && <TableHead>Ativo</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : users?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  users?.map(u => {
                    const isCurrentUser = u.user_id === user?.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                {getInitials(u.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{u.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          {isAdmin && !isCurrentUser ? (
                            <Select
                              value={u.role}
                              onValueChange={(v) => handleRoleChange(u.user_id, v)}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map(r => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={roleBadgeVariant(u.role) as any}>
                              {getRoleLabel(u.role)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? "default" : "destructive"}>
                            {u.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_email_verified ? "outline" : "secondary"}>
                            {u.is_email_verified ? "Verificado" : "Pendente"}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Switch
                              checked={u.is_active}
                              onCheckedChange={() => handleToggleActive(u.id, u.is_active)}
                              disabled={isCurrentUser}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <UserFormDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </AppLayout>
  );
}
