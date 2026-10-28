import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RolePicker from "@/components/usuarios/RolePicker";
import { usePermissions } from "@/hooks/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeWhatsapp } from "@/lib/whatsapp";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UserFormDialog({ open, onOpenChange }: UserFormDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [roles, setRoles] = useState<string[]>(["user"]);
  const { isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || !whatsapp.trim()) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    const phone = normalizeWhatsapp(whatsapp);
    if (!phone) {
      toast({ title: "WhatsApp inválido", description: "Use DDD + número, ex.: 22 99999-9999.", variant: "destructive" });
      return;
    }
    if (roles.length === 0) {
      toast({ title: "Selecione pelo menos um perfil", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Edge function validates caller's role server-side and uses their profile org_id
      const res = await supabase.functions.invoke("create-user", {
        body: { name: name.trim(), email: email.trim(), password, whatsapp: phone, roles },
      });

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || res.error?.message || "Erro ao criar usuário");
      }

      toast({ title: "Usuário criado com sucesso" });
      qc.invalidateQueries({ queryKey: ["org_users"] });
      onOpenChange(false);
      setName("");
      setEmail("");
      setPassword("");
      setWhatsapp("");
      setRoles(["user"]);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail *</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp *</Label>
            <Input id="whatsapp" inputMode="tel" autoComplete="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="22 99999-9999" />
            <p className="text-xs text-muted-foreground">DDD + número. O código do Brasil (55) é colocado automaticamente.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha *</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="space-y-2">
            <Label>Perfis (pode marcar mais de um)</Label>
            <RolePicker value={roles} onChange={setRoles} allowSuperAdmin={isSuperAdmin} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar Usuário"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
