import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

const ASSIGNABLE: AppRole[] = ["admin", "gestor", "vendedor", "consultor_tecnico", "operacional", "financeiro", "user", "visitante"];

interface RolePickerProps {
  value: string[];
  onChange: (roles: string[]) => void;
  allowSuperAdmin?: boolean;
}

/** Multi-select of profiles; permissions are the union of the selected roles. */
export default function RolePicker({ value, onChange, allowSuperAdmin }: RolePickerProps) {
  const options = allowSuperAdmin ? (["super_admin", ...ASSIGNABLE] as AppRole[]) : ASSIGNABLE;
  const toggle = (r: string, on: boolean) =>
    onChange(on ? Array.from(new Set([...value, r])) : value.filter((x) => x !== r));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
      {options.map((r) => (
        <label key={r} className="flex items-center gap-3 rounded-md px-2 min-h-11 cursor-pointer hover:bg-muted/50">
          <Checkbox checked={value.includes(r)} onCheckedChange={(c) => toggle(r, c === true)} className="h-5 w-5" />
          <span className="text-sm">{ROLE_LABELS[r]}</span>
        </label>
      ))}
    </div>
  );
}
