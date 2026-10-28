import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, user, isLoading } = useAuth();
  const { canAccessRoute, isSuperAdmin, homeRoute } = usePermissions();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} state={{ returnTo }} replace />;
  }

  if (!user) return null;

  // Super admin must select an org first (unless going to admin pages or selector)
  if (isSuperAdmin && !user?.organization_id && location.pathname !== "/admin/organizacoes") {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/admin/selecionar-organizacao?returnTo=${encodeURIComponent(returnTo)}`} state={{ returnTo }} replace />;
  }

  if (!canAccessRoute(location.pathname)) {
    return <Navigate to={homeRoute} replace />;
  }

  return <>{children}</>;
}
