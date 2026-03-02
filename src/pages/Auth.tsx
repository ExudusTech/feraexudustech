import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Lock, Mail, User, ArrowRight } from "lucide-react";
import logoExudus from "@/assets/logo-exudus.jpeg";

export default function Auth() {
  const { signIn, signUp, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  if (session) {
    navigate("/");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
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

  return (
    <div className="flex min-h-screen bg-[hsl(0,0%,8%)]">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center p-16 overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `linear-gradient(hsl(0,0%,30%) 1px, transparent 1px), linear-gradient(90deg, hsl(0,0%,30%) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
        {/* Gradient orbs */}
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px]" />
        
        <div className="relative z-10 max-w-lg space-y-10 flex flex-col items-center text-center">
          <img 
            src={logoExudus} 
            alt="ExudusTech" 
            className="w-40 h-40 rounded-2xl object-contain ring-1 ring-white/10 shadow-2xl shadow-black/50" 
          />
          
          <h1 className="text-5xl font-bold text-white leading-[1.1] tracking-tight">
            Gerencie seu
            <br />
            negócio com
            <br />
            <span className="text-primary">inteligência.</span>
          </h1>
          
          <p className="text-white/40 text-lg leading-relaxed max-w-md">
            Clientes, leads, propostas e operações em uma plataforma unificada para distribuidoras.
          </p>

          <div className="flex gap-3 pt-2">
            {["Gestão", "Financeiro", "Operações", "Suporte"].map((item) => (
              <span 
                key={item} 
                className="text-xs font-medium tracking-wider uppercase px-3 py-1.5 rounded-full border border-white/10 text-white/30"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - auth forms */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16 bg-[hsl(0,0%,6%)]">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <img src={logoExudus} alt="ExudusTech" className="w-16 h-16 rounded-xl object-contain" />
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Bem-vindo de volta
            </h2>
            <p className="text-white/35 text-sm">
              Acesse sua conta para continuar
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-white/5 border border-white/10 p-1 rounded-xl h-11">
              <TabsTrigger 
                value="login" 
                className="rounded-lg text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 text-white/40 transition-all duration-200"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger 
                value="signup" 
                className="rounded-lg text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 text-white/40 transition-all duration-200"
              >
                Criar Conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-xs font-medium uppercase tracking-wider text-white/35">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                    <Input 
                      id="login-email" 
                      type="email" 
                      placeholder="seu@email.com" 
                      className="pl-11 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:border-primary/50 focus:ring-primary/20 transition-colors" 
                      value={loginEmail} 
                      onChange={(e) => setLoginEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-xs font-medium uppercase tracking-wider text-white/35">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                    <Input 
                      id="login-password" 
                      type="password" 
                      placeholder="••••••••" 
                      className="pl-11 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:border-primary/50 focus:ring-primary/20 transition-colors" 
                      value={loginPassword} 
                      onChange={(e) => setLoginPassword(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 group" 
                  disabled={isLoading}
                >
                  {isLoading ? "Entrando..." : (
                    <>
                      Entrar
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-xs font-medium uppercase tracking-wider text-white/35">
                    Nome completo
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                    <Input 
                      id="signup-name" 
                      placeholder="Seu nome" 
                      className="pl-11 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:border-primary/50 focus:ring-primary/20 transition-colors" 
                      value={signupName} 
                      onChange={(e) => setSignupName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-xs font-medium uppercase tracking-wider text-white/35">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                    <Input 
                      id="signup-email" 
                      type="email" 
                      placeholder="seu@email.com" 
                      className="pl-11 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:border-primary/50 focus:ring-primary/20 transition-colors" 
                      value={signupEmail} 
                      onChange={(e) => setSignupEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-xs font-medium uppercase tracking-wider text-white/35">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                    <Input 
                      id="signup-password" 
                      type="password" 
                      placeholder="Mínimo 6 caracteres" 
                      className="pl-11 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:border-primary/50 focus:ring-primary/20 transition-colors" 
                      value={signupPassword} 
                      onChange={(e) => setSignupPassword(e.target.value)} 
                      required 
                      minLength={6} 
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 group" 
                  disabled={isLoading}
                >
                  {isLoading ? "Criando conta..." : (
                    <>
                      Criar Conta
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-white/15 mt-10">
            © {new Date().getFullYear()} ExudusTech. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
