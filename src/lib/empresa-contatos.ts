/** Company contacts (pessoas linked to a lead or client through empresa_contatos). */
export interface ContatoDraft {
  /** empresa_contatos.id when already saved */
  linkId?: string;
  pessoaId?: string;
  nome: string;
  telefone: string;
  email: string;
  cargo: string;
  is_primary: boolean;
}

export const emptyContato = (primary = false): ContatoDraft => ({ nome: "", telefone: "", email: "", cargo: "", is_primary: primary });

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Brazilian phone/WhatsApp: 10–11 digits (optionally prefixed by 55). */
export function phoneOk(s: string) {
  const d = onlyDigits(s).replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 10 || d.length === 11;
}

/** Errors per contact index; `geral` when the list itself is invalid. */
export function validateContatos(list: ContatoDraft[], opts: { minOne: boolean }) {
  const errors: Record<string, string> = {};
  const filled = list.filter((c) => c.nome.trim() || c.telefone.trim() || c.email.trim());
  if (opts.minOne && filled.length === 0) errors.geral = "Informe pelo menos 1 contato com nome e telefone/WhatsApp";
  list.forEach((c, i) => {
    const any = c.nome.trim() || c.telefone.trim() || c.email.trim();
    if (!any) return;
    if (!c.nome.trim()) errors[`${i}.nome`] = "Nome obrigatório";
    if (!c.telefone.trim()) errors[`${i}.telefone`] = "Telefone/WhatsApp obrigatório";
    else if (!phoneOk(c.telefone)) errors[`${i}.telefone`] = "Telefone inválido";
  });
  return errors;
}

/** Keeps exactly one primary among filled contacts (first one if none chosen). */
export function normalizePrimary(list: ContatoDraft[]): ContatoDraft[] {
  const filled = list.filter((c) => c.nome.trim() && c.telefone.trim());
  const idx = filled.findIndex((c) => c.is_primary);
  return filled.map((c, i) => ({ ...c, is_primary: idx === -1 ? i === 0 : i === idx }));
}

/** Who may register a client directly (base existente) from the Clientes screen. */
export const canRegisterExistingClient = (roles: string[]) => roles.some((r) => ["admin", "gestor", "super_admin"].includes(r));

/** Stage types that represent a won company and trigger the conversion prompt. */
export const isConversionStageTipo = (tipo: string | null | undefined) => tipo === "ganho" || tipo === "cliente";
