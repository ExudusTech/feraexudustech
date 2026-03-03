import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const callerRole = callerRoles?.[0]?.role;
    if (callerRole !== "super_admin" && callerRole !== "admin") {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, target_user_id, new_password } = await req.json();

    if (!action || !target_user_id) {
      return new Response(JSON.stringify({ error: "Ação e usuário são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent acting on self
    if (target_user_id === caller.id) {
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
      if (targetRoles?.[0]?.role === "super_admin") {
        return new Response(JSON.stringify({ error: "Permissão negada" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    switch (action) {
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
