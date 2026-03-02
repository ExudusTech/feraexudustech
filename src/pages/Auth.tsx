import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Lock, Mail, User, ArrowRight } from "lucide-react";
import logoExudus from "@/assets/logo-exudus-nova.png";

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
      // Check if account was blocked by fetchUserProfile
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

  return (
    <div className="flex min-h-screen bg-[hsl(215,30%,6%)]">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center overflow-hidden">
        {/* Deep dark-blue radial glow matching the logo sun */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(15,80%,12%)] via-[hsl(215,30%,6%)] to-[hsl(215,30%,6%)]" />
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[hsl(15,90%,45%)]/15 blur-[150px]" />
        
        <div className="relative z-10 flex flex-col items-center text-center space-y-8 px-16">
          <img 
            src={logoExudus} 
            alt="Exudus" 
            className="w-72 h-auto drop-shadow-2xl" 
          />
          
          <p className="text-[hsl(30,60%,75%)]/60 text-lg leading-relaxed max-w-md">
            Clientes, leads, propostas e operações em uma plataforma unificada para distribuidoras.
          </p>

          <div className="flex gap-3 pt-2">
            {["Gestão", "Financeiro", "Operações", "Suporte"].map((item) => (
              <span 
                key={item} 
                className="text-xs font-medium tracking-wider uppercase px-3 py-1.5 rounded-full border border-[hsl(15,70%,50%)]/20 text-[hsl(30,60%,75%)]/40"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - auth forms */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16 bg-[hsl(215,25%,5%)]">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex justify-center mb-10 lg:hidden">
            <img src={logoExudus} alt="Exudus" className="w-48 h-auto" />
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-bold text-[hsl(30,50%,90%)] tracking-tight">
              Bem-vindo de volta
            </h2>
            <p className="text-[hsl(215,15%,50%)] text-sm">
              Acesse sua conta para continuar
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-[hsl(215,20%,12%)] border border-[hsl(215,20%,18%)] p-1 rounded-xl h-11">
              <TabsTrigger 
                value="login" 
                className="rounded-lg text-sm font-medium data-[state=active]:bg-[hsl(15,80%,50%)] data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-[hsl(15,80%,50%)]/25 text-[hsl(215,15%,45%)] transition-all duration-200"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger 
                value="signup" 
                className="rounded-lg text-sm font-medium data-[state=active]:bg-[hsl(15,80%,50%)] data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-[hsl(15,80%,50%)]/25 text-[hsl(215,15%,45%)] transition-all duration-200"
              >
                Criar Conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-xs font-medium uppercase tracking-wider text-[hsl(215,15%,45%)]">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(215,15%,30%)]" />
                    <Input 
                      id="login-email" 
                      type="email" 
                      placeholder="seu@email.com" 
                      className="pl-11 h-12 bg-[hsl(215,20%,10%)] border-[hsl(215,20%,18%)] text-[hsl(30,50%,90%)] placeholder:text-[hsl(215,15%,30%)] rounded-xl focus:border-[hsl(15,80%,50%)]/50 focus:ring-[hsl(15,80%,50%)]/20 transition-colors" 
                      value={loginEmail} 
                      onChange={(e) => setLoginEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-xs font-medium uppercase tracking-wider text-[hsl(215,15%,45%)]">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(215,15%,30%)]" />
                    <Input 
                      id="login-password" 
                      type="password" 
                      placeholder="••••••••" 
                      className="pl-11 h-12 bg-[hsl(215,20%,10%)] border-[hsl(215,20%,18%)] text-[hsl(30,50%,90%)] placeholder:text-[hsl(215,15%,30%)] rounded-xl focus:border-[hsl(15,80%,50%)]/50 focus:ring-[hsl(15,80%,50%)]/20 transition-colors" 
                      value={loginPassword} 
                      onChange={(e) => setLoginPassword(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-[hsl(15,80%,50%)] hover:bg-[hsl(15,80%,45%)] text-white shadow-lg shadow-[hsl(15,80%,50%)]/25 hover:shadow-xl hover:shadow-[hsl(15,80%,50%)]/30 transition-all duration-200 group" 
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
                  <Label htmlFor="signup-name" className="text-xs font-medium uppercase tracking-wider text-[hsl(215,15%,45%)]">
                    Nome completo
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(215,15%,30%)]" />
                    <Input 
                      id="signup-name" 
                      placeholder="Seu nome" 
                      className="pl-11 h-12 bg-[hsl(215,20%,10%)] border-[hsl(215,20%,18%)] text-[hsl(30,50%,90%)] placeholder:text-[hsl(215,15%,30%)] rounded-xl focus:border-[hsl(15,80%,50%)]/50 focus:ring-[hsl(15,80%,50%)]/20 transition-colors" 
                      value={signupName} 
                      onChange={(e) => setSignupName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-xs font-medium uppercase tracking-wider text-[hsl(215,15%,45%)]">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(215,15%,30%)]" />
                    <Input 
                      id="signup-email" 
                      type="email" 
                      placeholder="seu@email.com" 
                      className="pl-11 h-12 bg-[hsl(215,20%,10%)] border-[hsl(215,20%,18%)] text-[hsl(30,50%,90%)] placeholder:text-[hsl(215,15%,30%)] rounded-xl focus:border-[hsl(15,80%,50%)]/50 focus:ring-[hsl(15,80%,50%)]/20 transition-colors" 
                      value={signupEmail} 
                      onChange={(e) => setSignupEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-xs font-medium uppercase tracking-wider text-[hsl(215,15%,45%)]">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(215,15%,30%)]" />
                    <Input 
                      id="signup-password" 
                      type="password" 
                      placeholder="Mínimo 6 caracteres" 
                      className="pl-11 h-12 bg-[hsl(215,20%,10%)] border-[hsl(215,20%,18%)] text-[hsl(30,50%,90%)] placeholder:text-[hsl(215,15%,30%)] rounded-xl focus:border-[hsl(15,80%,50%)]/50 focus:ring-[hsl(15,80%,50%)]/20 transition-colors" 
                      value={signupPassword} 
                      onChange={(e) => setSignupPassword(e.target.value)} 
                      required 
                      minLength={6} 
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-[hsl(15,80%,50%)] hover:bg-[hsl(15,80%,45%)] text-white shadow-lg shadow-[hsl(15,80%,50%)]/25 hover:shadow-xl hover:shadow-[hsl(15,80%,50%)]/30 transition-all duration-200 group" 
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

          <p className="text-center text-xs text-[hsl(215,15%,25%)] mt-10">
            © {new Date().getFullYear()} Exudus. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
