import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Lock, Mail, User, ArrowRight, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoExudus from "@/assets/logo-exudus-new.jpeg";

export default function Auth() {
  const { signIn, signUp, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  if (session) {
    navigate("/");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
      await new Promise((r) => setTimeout(r, 500));
      const blockReason = sessionStorage.getItem("auth_block_reason");
      if (blockReason) {
        sessionStorage.removeItem("auth_block_reason");
        toast({ title: "Acesso negado", description: blockReason, variant: "destructive" });
        setIsLoading(false);
        return;
      }
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Erro ao entrar",
        description: error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos"
          : error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupName);
      toast({
        title: "Conta criada!",
        description: "Verifique seu e-mail para confirmar o cadastro.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail) {
      toast({
        title: "Informe seu e-mail",
        description: "Preencha o campo de e-mail para solicitar a recuperação de senha.",
        variant: "destructive",
      });
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
        redirectTo: `${window.location.origin}/reset-password?flow=recovery`,
      });
      if (error) throw error;
      toast({
        title: "E-mail enviado",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const inputClasses = "pl-11 pr-11 h-12 bg-black/40 border-white/10 text-white placeholder:text-white/25 rounded-xl focus:border-red-500/50 focus:ring-red-500/20 transition-colors backdrop-blur-sm";
  const labelClasses = "text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40";

  return (
    <div className="relative flex min-h-screen bg-black overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-red-600/12 blur-[120px]" />
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
      <div className="relative z-10 flex flex-col items-center justify-center w-full px-6 py-12">
        <div className="mb-10">
          <img src={logoExudus} alt="Exudus" className="w-64 md:w-80 h-auto rounded-2xl shadow-2xl shadow-red-900/20" />
        </div>

        <p className="text-white/30 text-sm md:text-base tracking-wide mb-10 text-center max-w-md">
          Sistema de gestão integrado para distribuidoras
        </p>

        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-7 bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl h-11">
                <TabsTrigger value="login" className="rounded-lg text-sm font-semibold data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-red-600/30 text-white/35 transition-all duration-200">
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg text-sm font-semibold data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-red-600/30 text-white/35 transition-all duration-200">
                  Criar Conta
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className={labelClasses}>E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <Input id="login-email" type="email" placeholder="seu@email.com" className={inputClasses} value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password" className={labelClasses}>Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <Input id="login-password" type={showLoginPassword ? "text" : "password"} placeholder="••••••••" className={inputClasses} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                      <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotLoading}
                      className="text-xs text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {forgotLoading ? "Enviando..." : "Esqueci minha senha"}
                    </button>
                  </div>
                  <Button type="submit" className="w-full h-12 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 hover:shadow-xl hover:shadow-red-500/40 transition-all duration-300 group" disabled={isLoading}>
                    {isLoading ? "Entrando..." : (<>Entrar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>)}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-name" className={labelClasses}>Nome completo</Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <Input id="signup-name" placeholder="Seu nome" className={inputClasses} value={signupName} onChange={(e) => setSignupName(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className={labelClasses}>E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <Input id="signup-email" type="email" placeholder="seu@email.com" className={inputClasses} value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className={labelClasses}>Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <Input id="signup-password" type={showSignupPassword ? "text" : "password"} placeholder="Mínimo 6 caracteres" className={inputClasses} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} />
                      <button type="button" onClick={() => setShowSignupPassword(!showSignupPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 hover:shadow-xl hover:shadow-red-500/40 transition-all duration-300 group mt-2" disabled={isLoading}>
                    {isLoading ? "Criando conta..." : (<>Criar Conta <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>)}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex justify-center gap-2 mt-8 flex-wrap">
            {["Gestão", "Financeiro", "Operações", "CRM"].map((item) => (
              <span key={item} className="text-[10px] font-medium tracking-wider uppercase px-3 py-1 rounded-full border border-white/[0.06] text-white/15">
                {item}
              </span>
            ))}
          </div>

          <p className="text-center text-[11px] text-white/10 mt-8">
            © {new Date().getFullYear()} Exudus. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
