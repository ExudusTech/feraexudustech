/** Only same-origin application destinations may survive authentication redirects. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  const url = new URL(value, "https://fera.invalid");
  if (url.origin !== "https://fera.invalid" || ["/auth", "/admin/selecionar-organizacao"].includes(url.pathname)) return "/dashboard";
  return `${url.pathname}${url.search}`;
}

export function destinationFrom(search: string, state: unknown): string {
  const statePath = state && typeof state === "object" && "returnTo" in state ? state.returnTo : undefined;
  return safeReturnTo(new URLSearchParams(search).get("returnTo") ?? statePath);
}