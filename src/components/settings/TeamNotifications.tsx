import { useMemo, useState } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import { useOrganizationUsers } from "@/hooks/use-users";
import { toast } from "@/hooks/use-toast";
import { TEAM_EVENTS, recipientConflict, useTeamRecipients, useSaveTeamRecipient, type RecipientInput, type TeamRecipient, type TeamEvent } from "@/hooks/use-team-notifications";
const empty: RecipientInput = { tipo: "usuario", user_id: null, nome: "", whatsapp: "", email: "", papel: "", eventos: [], ativo: true };
export default function TeamNotifications() {
  const { isAdmin, role, getRoleLabel } = usePermissions(); const canEdit = isAdmin || role === "gestor";
  const { data: recipients = [], isLoading, error, refetch } = useTeamRecipients(); const save = useSaveTeamRecipient();
  const { data: users = [] } = useOrganizationUsers();
  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.user_id, u])), [users]);
  const userPhones = useMemo(() => Object.fromEntries(users.map(u => [u.user_id, u.phone ?? null])), [users]);
  const label = (r: string) => (getRoleLabel ? getRoleLabel(r) : r);
  const [open, setOpen] = useState(false); const [form, setForm] = useState<RecipientInput>(empty);
  const edit = (recipient?: TeamRecipient) => { setForm(recipient ? { ...recipient, whatsapp: recipient.whatsapp ?? "" } : { ...empty, eventos: [] }); setOpen(true); };
  const view = (r: TeamRecipient) => {
    const u = r.user_id ? usersById[r.user_id] : undefined;
    return { nome: u?.name ?? r.nome, whatsapp: r.user_id ? u?.phone ?? null : r.whatsapp, email: u?.email ?? r.email, roles: u?.roles ?? [] };
  };
  const activeUsers = users.filter(u => u.is_active);
  const selected = form.user_id ? usersById[form.user_id] : undefined;
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando destinatários" />;
  if (error) return <div role="alert" className="space-y-3 text-destructive">Não foi possível carregar os destinatários.<Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div>;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input: RecipientInput = form.tipo === "usuario"
      ? { ...form, nome: selected?.name ?? form.nome, papel: (selected?.roles ?? []).map(label).join(" + ") || "equipe" }
      : { ...form, nome: form.nome.trim(), email: form.email?.trim() || null };
    const conflict = recipientConflict(input, recipients, userPhones);
    if (conflict) { toast({ title: "Não foi possível salvar", description: conflict, variant: "destructive" }); return; }
    try { await save.mutateAsync(input); setOpen(false); } catch { /* mutation displays error */ }
  };
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Notificações da equipe</h2>{canEdit && <Button onClick={() => edit()}><Plus className="mr-2 h-4 w-4" />Novo destinatário</Button>}</div>
    {recipients.length === 0 && <p className="text-muted-foreground">Nenhum destinatário cadastrado.</p>}
    <div className="divide-y divide-border">{recipients.map(recipient => { const v = view(recipient); return <div key={recipient.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium break-words">{v.nome}</h3>
          {recipient.user_id ? v.roles.map(r => <Badge key={r} variant="secondary">{label(r)}</Badge>) : <Badge variant="outline">externo</Badge>}</div>
        <p className="text-sm text-muted-foreground break-all">{v.whatsapp ?? <span className="text-destructive">sem WhatsApp no cadastro</span>}{v.email ? ` · ${v.email}` : ""}</p>
        <div className="flex flex-wrap gap-2">{recipient.eventos.map(event => <Badge variant="outline" key={event}>{TEAM_EVENTS[event as TeamEvent] ?? event}</Badge>)}</div></div>
      <div className="flex items-center gap-3"><Switch aria-label={`Ativar ${v.nome}`} checked={recipient.ativo} disabled={!canEdit || save.isPending} onCheckedChange={ativo => save.mutate({ ...recipient, ativo })} />{canEdit && <Button title={`Editar ${v.nome}`} aria-label={`Editar ${v.nome}`} variant="ghost" size="icon" onClick={() => edit(recipient)}><Pencil className="h-4 w-4" /></Button>}</div>
    </div>; })}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{form.id ? "Editar destinatário" : "Novo destinatário"}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="recipient-kind">Tipo</Label>
          <Select value={form.tipo} onValueChange={tipo => setForm({ ...form, tipo: tipo as RecipientInput["tipo"] })}>
            <SelectTrigger id="recipient-kind" aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="usuario">Usuário da organização</SelectItem><SelectItem value="externo">Contato externo</SelectItem></SelectContent>
          </Select></div>
        {form.tipo === "usuario" ? <>
          <div className="space-y-2"><Label htmlFor="recipient-user">Usuário</Label>
            <Select value={form.user_id ?? undefined} onValueChange={user_id => setForm({ ...form, user_id })}>
              <SelectTrigger id="recipient-user" aria-label="Usuário"><SelectValue placeholder="Escolha um usuário" /></SelectTrigger>
              <SelectContent>{activeUsers.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}</SelectContent>
            </Select></div>
          {selected && <div className="rounded-md border border-border p-3 text-sm space-y-1">
            <p>{selected.phone ? `WhatsApp: ${selected.phone}` : <span className="text-destructive">Sem WhatsApp — complete o cadastro em Usuários.</span>}</p>
            <p className="text-muted-foreground">{selected.email}</p>
            <div className="flex flex-wrap gap-1">{selected.roles.map(r => <Badge key={r} variant="secondary">{label(r)}</Badge>)}</div>
          </div>}
        </> : <>
          <div className="space-y-2"><Label htmlFor="recipient-name">Nome</Label><Input id="recipient-name" required maxLength={120} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="recipient-phone">WhatsApp</Label><Input id="recipient-phone" inputMode="tel" required maxLength={20} placeholder="22 99999-9999" value={form.whatsapp ?? ""} onChange={e => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="recipient-email">E-mail (opcional)</Label><Input id="recipient-email" type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        </>}
        <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Eventos</legend>{Object.entries(TEAM_EVENTS).map(([event, text]) => <div className="flex items-center gap-2" key={event}><Checkbox id={`event-${event}`} checked={form.eventos.includes(event)} onCheckedChange={checked => setForm({ ...form, eventos: checked ? [...form.eventos, event] : form.eventos.filter(value => value !== event) })} /><Label htmlFor={`event-${event}`}>{text}</Label></div>)}</fieldset>
        <div className="flex items-center gap-2"><Switch id="recipient-active" checked={form.ativo} onCheckedChange={ativo => setForm({ ...form, ativo })} /><Label htmlFor="recipient-active">Ativo</Label></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar destinatário"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </section>;
}
