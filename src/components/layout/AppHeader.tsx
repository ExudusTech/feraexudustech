import { ReactNode } from "react";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
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
