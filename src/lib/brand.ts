/** Brand color helpers (WCAG contrast) used by the per-organization branding. */

const HEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

/** Colors that every organization received by default; treated as "not customized". */
const LEGACY_DEFAULTS = ["#1b365d", "#2c5f2d", "#7fcad4"];

export function parseHex(hex: string | null | undefined): [number, number, number] | null {
  const m = hex ? HEX.exec(hex.trim()) : null;
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text color (white or near-black) that reaches the best contrast over the given background. */
export function readableForeground(bg: string): "#ffffff" | "#0a0a0a" {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#0a0a0a") ? "#ffffff" : "#0a0a0a";
}

function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** Lightens a color toward white until it reaches `min` contrast against `against` (dark backgrounds). */
export function ensureContrastOn(color: string, against: string, min = 4.5): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  let current = toHex(...rgb);
  for (let t = 0.05; t <= 1 && contrastRatio(current, against) < min; t += 0.05) {
    current = toHex(...(rgb.map((v) => v + (255 - v) * t) as [number, number, number]));
  }
  return current;
}

export function hexToHslString(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function isCustomBrand(primary: string | null | undefined): boolean {
  return !!parseHex(primary) && !LEGACY_DEFAULTS.includes(primary!.trim().toLowerCase());
}

/** Dark theme background used by the app (absolute black). */
export const DARK_BG = "#000000";

export interface BrandCssInput {
  primary: string;
  secondary?: string | null;
  accent?: string | null;
}

/** Builds CSS variables for light and dark themes with AA-safe foregrounds. */
export function buildBrandCss({ primary, secondary, accent }: BrandCssInput): string {
  const lightPrimary = primary;
  const darkPrimary = ensureContrastOn(primary, DARK_BG, 3);
  const vars = (p: string) => {
    const hsl = hexToHslString(p)!;
    const fg = hexToHslString(readableForeground(p))!;
    const out = [
      `--primary:${hsl}`, `--primary-foreground:${fg}`, `--ring:${hsl}`,
      `--sidebar-primary:${hsl}`, `--sidebar-primary-foreground:${fg}`, `--sidebar-ring:${hsl}`,
    ];
    if (parseHex(secondary)) out.push(`--brand-secondary:${hexToHslString(secondary!)}`, `--brand-secondary-foreground:${hexToHslString(readableForeground(secondary!))}`);
    if (parseHex(accent)) out.push(`--brand-accent:${hexToHslString(accent!)}`, `--brand-accent-foreground:${hexToHslString(readableForeground(accent!))}`);
    return out.join(";");
  };
  return `:root{${vars(lightPrimary)}}.dark{${vars(darkPrimary)}}`;
}
