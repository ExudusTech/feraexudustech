import { ReactNode } from "react";
import { Bell, Search, Building2, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useOrganization } from "@/hooks/use-organizations";
import { useNavigate } from "react-router-dom";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { data: organization } = useOrganization();
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {/* Super Admin org indicator */}
        {isSuperAdmin && organization && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs h-8 border-primary/20 hover:border-primary/40"
            onClick={() => navigate("/admin/selecionar-organizacao")}
          >
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="max-w-[150px] truncate">{organization.name}</span>
            <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-10 w-64 h-9" />
        </div>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-destructive rounded-full" />
        </Button>
        {actions}
      </div>
    </header>
  );
}
