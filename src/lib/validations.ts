/**
 * Centralized validation utilities matching original system rules
 */

/** CEP (Brazilian ZIP) validation */
export function validateCEP(cep: string): boolean {
  return /^\d{5}-?\d{3}$/.test(cep);
}

/** Email validation */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Phone validation (Brazilian) */
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 10 && cleaned.length <= 11;
}

/** Password minimum 6 characters */
export function validatePassword(password: string): string | null {
  if (password.length < 6) return "Senha deve ter no mínimo 6 caracteres";
  return null;
}

/** Name minimum 2 characters */
export function validateName(name: string): string | null {
  if (name.trim().length < 2) return "Nome deve ter no mínimo 2 caracteres";
  return null;
}

/** Support ticket title min 5 chars */
export function validateTicketTitle(title: string): string | null {
  if (title.trim().length < 5) return "Título deve ter no mínimo 5 caracteres";
  return null;
}

/** Support ticket description min 20 chars */
export function validateTicketDescription(desc: string): string | null {
  if (desc.trim().length < 20) return "Descrição deve ter no mínimo 20 caracteres";
  return null;
}

/** Time format HH:MM */
export function validateTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

/** Billing day 1-31 */
export function validateBillingDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

/** Format CEP with mask */
export function formatCEP(cep: string): string {
  const cleaned = cep.replace(/\D/g, "");
  if (cleaned.length <= 5) return cleaned;
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 8)}`;
}

/** Format phone with mask */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length <= 2) return `(${cleaned}`;
  if (cleaned.length <= 7) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
  if (cleaned.length <= 10) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
}

/** Format CPF/CNPJ */
export function formatDocument(doc: string): string {
  const cleaned = doc.replace(/\D/g, "");
  if (cleaned.length <= 11) {
    // CPF: 000.000.000-00
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  // CNPJ: 00.000.000/0000-00
  return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
