import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function ColorInput({ label, value, onChange, placeholder = "#000000" }: ColorInputProps) {
  const isValidColor = /^#([0-9A-Fa-f]{3}){1,2}$/.test(value);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <div
          className="h-9 w-9 rounded-md border border-border shrink-0"
          style={{ backgroundColor: isValidColor ? value : "transparent" }}
        />
      </div>
    </div>
  );
}
