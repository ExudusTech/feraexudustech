import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { recipientConflict, type TeamRecipient } from "@/hooks/use-team-notifications";
describe("WhatsApp normalization", () => {
  it("keeps digits with country code", () => expect(normalizeWhatsapp("+55 (22) 99999-9999")).toBe("5522999999999"));
  it("adds 55 to DDD + number", () => { expect(normalizeWhatsapp("22 99999-9999")).toBe("5522999999999"); expect(normalizeWhatsapp("2233334444")).toBe("552233334444"); });
  it("rejects BR numbers outside 12–13 digits", () => { expect(normalizeWhatsapp("55229999")).toBeNull(); expect(normalizeWhatsapp("55229999999999")).toBeNull(); expect(normalizeWhatsapp("")).toBeNull(); });
  it("server copy matches the app copy", () => {
    const body = (f: string) => readFileSync(f, "utf8").replace(/^\/\/.*\n/, "");
    expect(body("supabase/functions/_shared/whatsapp.ts")).toBe(body("src/lib/whatsapp.ts"));
  });
});
describe("Recipient duplicates", () => {
  const base = { nome: "", email: null, papel: "", eventos: ["agendamento"], ativo: true };
  const existing: TeamRecipient[] = [
    { id: "a", tipo: "usuario", user_id: "u1", whatsapp: null, ...base },
    { id: "b", tipo: "externo", user_id: null, whatsapp: "5521977776666", ...base },
  ];
  const phones = { u1: "5522999990000", u2: "5521977776666", u3: null };
  it("blocks the same user twice", () => expect(recipientConflict({ tipo: "usuario", user_id: "u1", whatsapp: null, ...base }, existing, phones)).toMatch(/já é destinatário/));
  it("blocks a user whose WhatsApp is already an external contact", () => expect(recipientConflict({ tipo: "usuario", user_id: "u2", whatsapp: null, ...base }, existing, phones)).toMatch(/WhatsApp já está/));
  it("blocks an external contact with a linked user's WhatsApp", () => expect(recipientConflict({ tipo: "externo", user_id: null, whatsapp: "22 99999-0000", ...base }, existing, phones)).toMatch(/WhatsApp já está/));
  it("requires the user to have WhatsApp", () => expect(recipientConflict({ tipo: "usuario", user_id: "u3", whatsapp: null, ...base }, existing, phones)).toMatch(/não tem WhatsApp/));
  it("allows editing the same row", () => expect(recipientConflict({ id: "a", tipo: "usuario", user_id: "u1", whatsapp: null, ...base }, existing, phones)).toBeNull());
});
