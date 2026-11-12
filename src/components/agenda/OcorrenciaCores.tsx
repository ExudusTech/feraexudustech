import { CORES_OCORRENCIA, ORDEM_CORES, contarPorCor, corDaOcorrencia, type OcorrenciaLike } from "@/lib/ocorrencia-cores";
import { OCORRENCIA_LABEL, type OcorrenciaTipo } from "@/lib/coleta";
import { serviceKind } from "@/lib/service-kind";
import { cn } from "@/lib/utils";

/** Small legend: one dot + label per occurrence color. Wraps on narrow screens. */
export function OcorrenciaLegenda({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground", className)} aria-label="Legenda das cores">
      {ORDEM_CORES.map((c) => (
        <li key={c} className="flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-full shrink-0", CORES_OCORRENCIA[c].dot)} />{CORES_OCORRENCIA[c].label}</li>
      ))}
    </ul>
  );
}

/** Colored dots with the count per color (calendar day cells). */
export function OcorrenciaDots({ items, className }: { items: OcorrenciaLike[]; className?: string }) {
  const counts = contarPorCor(items);
  if (!counts.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-1.5 gap-y-0.5", className)} aria-label={counts.map((c) => `${c.n} ${CORES_OCORRENCIA[c.cor].label}`).join(", ")}>
      {counts.map(({ cor, n }) => (
        <span key={cor} className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums leading-none" title={CORES_OCORRENCIA[cor].label}>
          <span className={cn("h-2 w-2 rounded-full", CORES_OCORRENCIA[cor].dot)} />{n}
        </span>
      ))}
    </div>
  );
}

/** Type label shown on a visit: the occurrence type when set, else the service kind. */
export function tipoDaOcorrenciaLabel(s: OcorrenciaLike): string {
  return (s.ocorrencia_tipo && OCORRENCIA_LABEL[s.ocorrencia_tipo as OcorrenciaTipo]) || serviceKind(s.schedule_type, s.schedule_subtype);
}

/** Badge with the color dot and the visit's type. */
export function OcorrenciaTipoBadge({ s, className }: { s: OcorrenciaLike; className?: string }) {
  const info = CORES_OCORRENCIA[corDaOcorrencia(s)];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground", info.chip, className)}>
      <span className={cn("h-2 w-2 rounded-full shrink-0", info.dot)} />{tipoDaOcorrenciaLabel(s)}
    </span>
  );
}
