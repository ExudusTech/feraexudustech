const safeMessages = new Set([
  "Não autorizado",
  "Permissão negada",
  "Ação e usuário são obrigatórios",
  "Não é possível realizar esta ação em sua própria conta",
  "Perfis inválidos",
  "Selecione perfis válidos para sua permissão.",
  "Somente um super administrador pode alterar os perfis de outro super administrador.",
  "Não foi possível salvar os perfis. Tente novamente; se persistir, informe o responsável pelo sistema.",
]);

export async function userRoleError(data: unknown, error: unknown): Promise<string> {
  const fallback = "Não foi possível salvar os perfis. Tente novamente; se persistir, informe o responsável pelo sistema.";
  const message = (body: unknown) => {
    if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
    return typeof body.error === "string" && safeMessages.has(body.error) ? body.error : undefined;
  };
  const direct = message(data);
  if (direct) return direct;
  if (typeof error === "object" && error !== null && "context" in error && error.context instanceof Response) {
    if (error.context.status === 401) return "Sua sessão expirou. Entre novamente para salvar os perfis.";
    try { return message(await error.context.clone().json()) ?? fallback; } catch { return fallback; }
  }
  return fallback;
}