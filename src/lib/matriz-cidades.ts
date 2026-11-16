/** Parses the gestão's Matriz list: one city per line or comma, trimmed, without duplicates (case/accent-insensitive). */
export function listaMatrizCidades(texto: string): string[] {
  const vistos = new Set<string>();
  const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return texto.split(/[\n,;]/).map((c) => c.trim().replace(/\s+/g, " ").slice(0, 80)).filter((c) => {
    if (!c || vistos.has(fold(c))) return false;
    vistos.add(fold(c));
    return true;
  });
}
