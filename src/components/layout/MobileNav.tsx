import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Target, Users, Menu, LogOut, Sun, Moon, UserCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useOrgBranding } from "@/hooks/use-org-branding";
import { cn } from "@/lib/utils";
import { mainNavItems, bottomNavItems } from "./AppSidebar";

const PRIMARY = [
  { icon: CalendarDays, label: "Agenda", path: "/agenda" },
  { icon: Target, label: "Leads", path: "/leads" },
  { icon: Users, label: "Clientes", path: "/clientes" },
];

/** Bottom navigation for phones; replaces the side menu below the md breakpoint. */
export default function MobileNav() {
  const { canAccessRoute, isSuperAdmin, roleLabel } = usePermissions();
  const { user, signOut } = useAuth();
  const { logoUrl, orgName } = useOrgBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const go = (path: string) => { setOpen(false); navigate(path); };
  const primary = PRIMARY.filter((i) => canAccessRoute(i.path));
  const more = [...mainNavItems, ...bottomNavItems]
    .filter((i) => canAccessRoute(i.path))
    .filter((i: any) => !i.superAdminOnly || isSuperAdmin)
    .filter((i) => !primary.some((p) => p.path === i.path));

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const Item = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
      <Icon className="h-6 w-6" />
      {label}
    </button>
  );

  return (
    <>
      <nav aria-label="Navegação principal" className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {primary.map((i) => (
          <Item key={i.path} icon={i.icon} label={i.label} active={location.pathname.startsWith(i.path)} onClick={() => go(i.path)} />
        ))}
        <Item icon={Menu} label="Mais" active={open} onClick={() => setOpen(true)} />
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-3">
              {logoUrl && <span className="rounded-lg bg-white p-1"><img src={logoUrl} alt="" className="h-8 max-w-[100px] object-contain" /></span>}
              <span className="truncate">{orgName || "Menu"}</span>
            </SheetTitle>
            <p className="text-sm text-muted-foreground truncate">{user?.name} · {roleLabel}</p>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {more.map((i) => (
              <button key={i.path} onClick={() => go(i.path)} className={cn("flex flex-col items-center justify-center gap-1 rounded-xl border min-h-20 p-2 text-xs font-medium text-center", location.pathname.startsWith(i.path) ? "border-primary text-primary" : "text-foreground")}>
                <i.icon className="h-6 w-6" />
                {i.label}
              </button>
            ))}
            <button onClick={() => go("/meu-perfil")} className="flex flex-col items-center justify-center gap-1 rounded-xl border min-h-20 p-2 text-xs font-medium"><UserCircle className="h-6 w-6" />Meu perfil</button>
            <button onClick={toggleTheme} className="flex flex-col items-center justify-center gap-1 rounded-xl border min-h-20 p-2 text-xs font-medium"><Sun className="h-6 w-6 dark:hidden" /><Moon className="h-6 w-6 hidden dark:block" />Tema</button>
            <button onClick={signOut} className="flex flex-col items-center justify-center gap-1 rounded-xl border min-h-20 p-2 text-xs font-medium text-destructive"><LogOut className="h-6 w-6" />Sair</button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
