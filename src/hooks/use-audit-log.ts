import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AuditAction = "LOGIN" | "LOGOUT" | "CREATE" | "UPDATE" | "DELETE" | "IMPORT" | "VERIFY_EMAIL" | "CONVERT";

interface AuditLogInput {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

/**
 * Hook to create audit log entries.
 * Tracks: LOGIN, CREATE, UPDATE, DELETE, IMPORT, CONVERT, etc.
 */
export function useCreateAuditLog() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: AuditLogInput) => {
      if (!user?.organization_id) return; // silent fail if no org

      const { error } = await supabase.from("audit_logs").insert([{
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId || null,
        old_data: (input.oldData as any) || null,
        new_data: (input.newData as any) || null,
        user_id: user.id,
        user_email: user.email,
        organization_id: user.organization_id,
        user_agent: navigator.userAgent,
      }]);
      if (error) console.error("Audit log error:", error);
    },
  });
}

/**
 * Hook to read audit logs (admin only)
 */
export function useAuditLogs(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["audit_logs", user?.organization_id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
