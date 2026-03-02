import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useUnreadMessageCount } from "@/hooks/use-unread-messages";
import { useOrgBranding } from "@/hooks/use-org-branding";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Target, FileText, Package, DollarSign,
  BarChart3, Settings, LogOut, Leaf, MapPin, UserCog, HelpCircle,
  ChevronLeft, Sun, Moon, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import logoExudus from "@/assets/logo-exudus-nova.png";

const mainNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Leaf, label: "Ekkoa", path: "/ekkoa" },
  { icon: Users, label: "Clientes", path: "/clientes" },
  { icon: Target, label: "Leads", path: "/leads" },
  { icon: FileText, label: "Propostas", path: "/propostas" },
  { icon: Package, label: "Produtos", path: "/produtos" },
  { icon: DollarSign, label: "Financeiro", path: "/financeiro" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios" },
  { icon: MapPin, label: "Áreas de Cobertura", path: "/areas-cobertura" },
];

const bottomNavItems = [
  { icon: Crown, label: "Organizações", path: "/admin/organizacoes", superAdminOnly: true },
  { icon: UserCog, label: "Usuários", path: "/usuarios" },
  { icon: Settings, label: "Configurações", path: "/configuracoes" },
  { icon: HelpCircle, label: "Suporte", path: "/suporte", showBadge: true },
];

export default function AppSidebar() {
  const { user, signOut } = useAuth();
  const { canAccessRoute, roleLabel, isSuperAdmin } = usePermissions();
  const { data: unreadCount = 0 } = useUnreadMessageCount();
  const { logoUrl } = useOrgBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const NavItem = ({ icon: Icon, label, path, showBadge, superAdminOnly }: { icon: any; label: string; path: string; showBadge?: boolean; superAdminOnly?: boolean }) => {
    const isActive = location.pathname === path;
    const badgeCount = showBadge ? unreadCount : 0;

    const button = (
      <button
        onClick={() => navigate(path)}
        className={cn(
          "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/25"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
        {badgeCount > 0 && (
          <span className="ml-auto bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1.5">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              {button}
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-[68px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-3">
        <img
          src={logoUrl || logoExudus}
          alt="Logo"
          className={cn(
            "rounded-lg object-contain shrink-0 transition-all",
            collapsed ? "w-10 h-10" : "w-full max-h-14"
          )}
        />
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "ml-auto h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent",
            collapsed && "ml-0"
          )}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-3">
        <nav className="space-y-1">
          {mainNavItems.filter((item) => canAccessRoute(item.path)).map((item) => (
            <NavItem key={item.path} {...item} />
          ))}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* Bottom nav */}
      <div className="px-3 py-2 space-y-1">
        {bottomNavItems
          .filter((item) => canAccessRoute(item.path))
          .filter((item) => !item.superAdminOnly || isSuperAdmin)
          .map((item) => (
          <NavItem key={item.path} {...item} />
        ))}
        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
            >
              {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
              {!collapsed && <span>{isDark ? "Tema Claro" : "Tema Escuro"}</span>}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">{isDark ? "Tema Claro" : "Tema Escuro"}</TooltipContent>}
        </Tooltip>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* User section */}
      <div className="p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{roleLabel}</p>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
