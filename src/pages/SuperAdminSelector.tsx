import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useAllOrganizations, type Organization } from "@/hooks/use-organizations";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Building2, Users, Zap, ArrowRight, LogOut, Loader2 } from "lucide-react";
import logoExudus from "@/assets/logo-exudus-new.jpeg";

export default function SuperAdminSelector() {
  const { user, signOut, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const { data: organizations = [], isLoading } = useAllOrganizations();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return organizations.filter(o =>
      [o.name, o.trading_name, o.cnpj, o.email, o.city, o.state]
        .some(f => f?.toLowerCase().includes(s))
    );
  }, [organizations, search]);

  const handleSelect = (org: Organization) => {
    switchOrganization(org.id);
    navigate("/dashboard");
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="relative flex min-h-screen bg-black overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-red-600/12 blur-[120px]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-red-950/8 to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full px-6 py-8">
        <div className="mb-6">
          <img src={logoExudus} alt="Exudus" className="w-48 h-auto rounded-2xl shadow-2xl shadow-red-900/20" />
        </div>

        <div className="mb-2">
          <Badge className="bg-red-600/20 text-red-400 border-red-500/30 text-xs font-bold tracking-wider uppercase px-3 py-1">
            Super Administrador
          </Badge>
        </div>

        <p className="text-white/50 text-sm mb-1">
          Olá, <span className="text-white/70 font-medium">{user?.name}</span>
        </p>
        <p className="text-white/30 text-xs mb-8">
          Selecione uma organização para acessar
        </p>

        <div className="w-full max-w-2xl">
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
            <Input
              placeholder="Buscar organização..."
              className="pl-11 h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-red-500/50 focus:ring-red-500/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Organizations List */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-white/30" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-white/30 text-sm">
              {search ? "Nenhuma organização encontrada." : "Nenhuma organização cadastrada."}
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {filtered.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelect(org)}
                  className="w-full group rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-red-500/20 p-5 text-left transition-all duration-200 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="shrink-0 w-11 h-11 rounded-lg bg-red-600/10 border border-red-500/20 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-red-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-white font-semibold text-sm truncate">{org.name}</h3>
                        {org.trading_name && (
                          <p className="text-white/30 text-xs truncate">{org.trading_name}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-white/20 text-[10px] uppercase tracking-wider">{org.plan}</span>
                          {org.cnpj && <span className="text-white/15 text-[10px]">{org.cnpj}</span>}
                          <span className="flex items-center gap-1 text-white/20 text-[10px]">
                            <Users className="h-3 w-3" /> {org.max_users}
                          </span>
                          {org.has_ekkoa_access && (
                            <span className="flex items-center gap-1 text-red-400/50 text-[10px]">
                              <Zap className="h-3 w-3" /> Ekkoa
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={org.is_active ? "default" : "destructive"}
                        className={`text-[10px] ${org.is_active ? "bg-green-500/10 text-green-400 border-green-500/20" : ""}`}
                      >
                        {org.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-white/10 group-hover:text-red-400 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-white/20 hover:text-white/50 hover:bg-white/5 text-xs gap-2"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </Button>
        </div>

        <p className="text-center text-[11px] text-white/10 mt-6">
          © {new Date().getFullYear()} Exudus. Painel Super Admin.
        </p>
      </div>
    </div>
  );
}
