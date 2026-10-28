import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isManager } from "../_shared/roles.ts";
import { saveRoles } from "./set-roles.ts";
import { normalizeWhatsapp } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseServiceKey || !anonKey) throw new Error("configuration_missing");

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check caller role
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRoleList = (callerRoles ?? []).map((r: any) => r.role as string);
    const callerRole = callerRoleList.includes("super_admin") ? "super_admin" : callerRoleList.includes("admin") ? "admin" : null;
    if (!isManager(callerRoleList)) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, target_user_id, new_password } = body;

    if (!action || !target_user_id) {
      return new Response(JSON.stringify({ error: "Ação e usuário são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent acting on self (except updating own WhatsApp)
    if (target_user_id === caller.id && action !== "set_whatsapp") {
      return new Response(JSON.stringify({ error: "Não é possível realizar esta ação em sua própria conta" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Non-super_admin cannot act on super_admin users
    if (callerRole !== "super_admin") {
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", target_user_id);
      if ((targetRoles ?? []).some((r: any) => r.role === "super_admin")) {
        return new Response(JSON.stringify({ error: "Permissão negada" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Non-super_admin may only act on users of their own organization
    if (callerRole !== "super_admin") {
      const { data: profs } = await adminClient.from("profiles").select("user_id, organization_id").in("user_id", [caller.id, target_user_id]);
      const callerOrg = profs?.find((p: any) => p.user_id === caller.id)?.organization_id;
      const targetOrg = profs?.find((p: any) => p.user_id === target_user_id)?.organization_id;
      if (!callerOrg || callerOrg !== targetOrg) {
        return new Response(JSON.stringify({ error: "Permissão negada" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    switch (action) {
      case "set_whatsapp": {
        const phone = normalizeWhatsapp(body.whatsapp);
        if (!phone) {
          return new Response(JSON.stringify({ error: "WhatsApp inválido: use DDD + número (ex.: 5522999999999)" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await adminClient.from("profiles").update({ phone }).eq("user_id", target_user_id);
        if (error) {
          console.error("[manage-user] set_whatsapp", error.code);
          return new Response(JSON.stringify({ error: "Não foi possível salvar o WhatsApp" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, whatsapp: phone }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "set_roles": {
        const result = await saveRoles(body, callerRoleList, {
          read: async () => {
            const { data, error } = await adminClient.from("user_roles").select("role").eq("user_id", target_user_id);
            return { error, roles: (data ?? []).map((r) => r.role as string) };
          },
          backup: async (roles) => adminClient.from("backup_20261028b_user_roles").insert(roles.map((role) => ({ user_id: target_user_id, role }))),
          add: async (roles) => adminClient.from("user_roles").upsert(roles.map((role) => ({ user_id: target_user_id, role })), { onConflict: "user_id,role", ignoreDuplicates: true }),
          remove: async (roles) => adminClient.from("user_roles").delete().eq("user_id", target_user_id).in("role", roles),
        }, (stage, code) => console.error("[manage-user] set_roles", stage, code));
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "reset_password": {
        if (!new_password || new_password.length < 6) {
          return new Response(JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await adminClient.auth.admin.updateUser(target_user_id, {
          password: new_password,
        });
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, message: "Senha redefinida com sucesso" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "block_user": {
        // Deactivate profile
        await adminClient
          .from("profiles")
          .update({ is_active: false })
          .eq("user_id", target_user_id);

        // Ban user in auth (prevents login)
        const { error } = await adminClient.auth.admin.updateUser(target_user_id, {
          ban_duration: "876600h", // ~100 years
        });
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, message: "Usuário bloqueado com sucesso" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "unblock_user": {
        await adminClient
          .from("profiles")
          .update({ is_active: true })
          .eq("user_id", target_user_id);

        const { error } = await adminClient.auth.admin.updateUser(target_user_id, {
          ban_duration: "none",
        });
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, message: "Usuário desbloqueado com sucesso" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("[manage-user] unexpected error");
    return new Response(JSON.stringify({ error: "Erro interno ao gerenciar usuário" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
