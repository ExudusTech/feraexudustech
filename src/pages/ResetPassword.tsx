import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import logoExudus from "@/assets/logo-exudus-new.jpeg";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Check hash for recovery type
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    // Check if there's already an active session (token already processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsRecovery(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Senha atualizada!", description: "Sua senha foi redefinida com sucesso." });
      navigate("/dashboard");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="text-center space-y-4">
          <img src={logoExudus} alt="Exudus" className="w-48 h-auto mx-auto rounded-2xl" />
          <p className="text-white/40 text-sm">Link inválido ou expirado.</p>
          <Button variant="outline" onClick={() => navigate("/auth")} className="border-white/10 text-white/60 hover:text-white hover:bg-white/5">
            Voltar ao login
          </Button>
        </div>
      </div>
    );
  }

  const inputClasses = "pl-11 pr-11 h-12 bg-black/40 border-white/10 text-white placeholder:text-white/25 rounded-xl focus:border-red-500/50 focus:ring-red-500/20 transition-colors backdrop-blur-sm";

  return (
    <div className="relative flex min-h-screen bg-black overflow-hidden items-center justify-center px-6">
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-red-600/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-sm space-y-8">
        <div className="flex justify-center">
          <img src={logoExudus} alt="Exudus" className="w-48 h-auto rounded-2xl shadow-2xl shadow-red-900/20" />
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-1">Redefinir senha</h2>
          <p className="text-white/30 text-sm mb-6">Digite sua nova senha abaixo.</p>

          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                <Input type={showPassword ? "text" : "password"} placeholder="Mínimo 6 caracteres" className={inputClasses} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">Confirmar senha</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                <Input type={showPassword ? "text" : "password"} placeholder="Repita a senha" className={inputClasses} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all duration-300 group" disabled={isLoading}>
              {isLoading ? "Salvando..." : (<>Salvar nova senha <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>)}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
