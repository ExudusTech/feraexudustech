import { useState } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { TEAM_EVENTS, useTeamRecipients, useSaveTeamRecipient, type TeamRecipient, type TeamEvent } from "@/hooks/use-team-notifications";
const empty = { nome: "", whatsapp: "", email: "", papel: "gestor", eventos: [] as string[], ativo: true };
export default function TeamNotifications() {
  const { isAdmin, role } = usePermissions(); const canEdit = isAdmin || role === "gestor";
  const { data: recipients = [], isLoading, error, refetch } = useTeamRecipients(); const save = useSaveTeamRecipient();
  const [open, setOpen] = useState(false); const [form, setForm] = useState<Omit<TeamRecipient, "id"> & { id?: string }>(empty);
  const edit = (recipient?: TeamRecipient) => { setForm(recipient ?? { ...empty, eventos: [] }); setOpen(true); };
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando destinatários" />;
  if (error) return <div role="alert" className="space-y-3 text-destructive">Não foi possível carregar os destinatários.<Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div>;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Notificações da equipe</h2>{canEdit && <Button onClick={() => edit()}><Plus className="mr-2 h-4 w-4" />Novo destinatário</Button>}</div>
    {recipients.length === 0 && <p className="text-muted-foreground">Nenhum destinatário cadastrado.</p>}
    <div className="divide-y divide-border">{recipients.map(recipient => <div key={recipient.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium break-words">{recipient.nome}</h3><Badge variant="secondary">{recipient.papel}</Badge></div><p className="text-sm text-muted-foreground break-all">{recipient.whatsapp}{recipient.email ? ` · ${recipient.email}` : ""}</p><div className="flex flex-wrap gap-2">{recipient.eventos.map(event => <Badge variant="outline" key={event}>{TEAM_EVENTS[event as TeamEvent] ?? event}</Badge>)}</div></div>
      <div className="flex items-center gap-3"><Switch aria-label={`Ativar ${recipient.nome}`} checked={recipient.ativo} disabled={!canEdit || save.isPending} onCheckedChange={ativo => save.mutate({ ...recipient, ativo })} />{canEdit && <Button title={`Editar ${recipient.nome}`} aria-label={`Editar ${recipient.nome}`} variant="ghost" size="icon" onClick={() => edit(recipient)}><Pencil className="h-4 w-4" /></Button>}</div>
    </div>)}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{form.id ? "Editar destinatário" : "Novo destinatário"}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={async event => { event.preventDefault(); try { await save.mutateAsync({ ...form, nome: form.nome.trim(), email: form.email?.trim() || null }); setOpen(false); } catch { /* mutation displays error */ } }}>
        <div className="space-y-2"><Label htmlFor="recipient-name">Nome</Label><Input id="recipient-name" required maxLength={120} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="recipient-phone">WhatsApp (com código do país, sem +)</Label><Input id="recipient-phone" inputMode="tel" required pattern="[1-9][0-9]{7,14}" maxLength={15} value={form.whatsapp ?? ""} onChange={e => setForm({ ...form, whatsapp: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="recipient-email">E-mail (opcional)</Label><Input id="recipient-email" type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="recipient-role">Papel</Label><Input id="recipient-role" required maxLength={80} value={form.papel} onChange={e => setForm({ ...form, papel: e.target.value })} /></div>
        <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Eventos</legend>{Object.entries(TEAM_EVENTS).map(([event, label]) => <div className="flex items-center gap-2" key={event}><Checkbox id={`event-${event}`} checked={form.eventos.includes(event)} onCheckedChange={checked => setForm({ ...form, eventos: checked ? [...form.eventos, event] : form.eventos.filter(value => value !== event) })} /><Label htmlFor={`event-${event}`}>{label}</Label></div>)}</fieldset>
        <div className="flex items-center gap-2"><Switch id="recipient-active" checked={form.ativo} onCheckedChange={ativo => setForm({ ...form, ativo })} /><Label htmlFor="recipient-active">Ativo</Label></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar destinatário"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </section>;
}
