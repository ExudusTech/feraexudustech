import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import MobileNav from "./MobileNav";
import InstallHint from "./InstallHint";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {title && <AppHeader title={title} subtitle={subtitle} actions={actions} />}
        <main className="flex-1 overflow-y-auto p-3 pb-24 md:p-6 md:pb-6 bg-background">
          <InstallHint />
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
