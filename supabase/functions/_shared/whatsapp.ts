// Keep identical to src/lib/whatsapp.ts (covered by src/test/whatsapp.test.ts).
/** Normalizes a WhatsApp number to digits with country code (BR: 55 + DDD + number). Returns null when invalid. */
export function normalizeWhatsapp(input: unknown): string | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  let digits = String(input).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^[1-9]\d{9,14}$/.test(digits)) return null;
  if (digits.startsWith("55") && digits.length !== 12 && digits.length !== 13) return null;
  return digits;
}
