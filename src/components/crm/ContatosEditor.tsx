import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Star, Trash2 } from "lucide-react";
import { formatPhone } from "@/lib/validations";
import { emptyContato, type ContatoDraft } from "@/lib/empresa-contatos";

interface Props { value: ContatoDraft[]; onChange: (v: ContatoDraft[]) => void; errors?: Record<string, string>; required?: boolean }

/** "Contatos" section: N people behind the company, one marked as principal. */
export default function ContatosEditor({ value, onChange, errors = {}, required }: Props) {
  const set = (i: number, patch: Partial<ContatoDraft>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setPrimary = (i: number) => onChange(value.map((c, j) => ({ ...c, is_primary: j === i })));
  const remove = (i: number) => {
    const next = value.filter((_, j) => j !== i);
    if (next.length && !next.some((c) => c.is_primary)) next[0] = { ...next[0], is_primary: true };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Contatos{required && " *"}</Label>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, emptyContato(value.length === 0)])}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar contato
        </Button>
      </div>
      {errors.geral && <p className="text-xs text-destructive">{errors.geral}</p>}
      {value.map((c, i) => (
        <div key={c.linkId ?? i} className="rounded-md border p-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Input aria-label="Nome do contato" placeholder="Nome *" value={c.nome} onChange={(e) => set(i, { nome: e.target.value })} />
              {errors[`${i}.nome`] && <p className="text-xs text-destructive mt-1">{errors[`${i}.nome`]}</p>}
            </div>
            <div>
              <Input aria-label="Telefone/WhatsApp" placeholder="Telefone/WhatsApp *" maxLength={15} value={c.telefone}
                onChange={(e) => set(i, { telefone: formatPhone(e.target.value) })} />
              {errors[`${i}.telefone`] && <p className="text-xs text-destructive mt-1">{errors[`${i}.telefone`]}</p>}
            </div>
            <Input aria-label="Cargo" placeholder="Cargo" value={c.cargo} onChange={(e) => set(i, { cargo: e.target.value })} />
            <Input aria-label="E-mail" type="email" placeholder="E-mail" value={c.email} onChange={(e) => set(i, { email: e.target.value })} />
          </div>
          <div className="flex justify-between">
            <Button type="button" size="sm" variant={c.is_primary ? "secondary" : "ghost"} onClick={() => setPrimary(i)}>
              <Star className="h-4 w-4 mr-1" /> {c.is_primary ? "Principal" : "Marcar como principal"}
            </Button>
            <Button type="button" size="sm" variant="ghost" aria-label="Remover contato" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}
