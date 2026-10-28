import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isManager, resolveRequestedRoles } from "../_shared/roles.ts";
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

    // Verify the caller is admin/super_admin
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

    // Check caller role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
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

    // Get caller's organization
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("user_id", caller.id)
      .single();

    if (!callerProfile?.organization_id) {
      return new Response(JSON.stringify({ error: "Organização não encontrada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { name, email, password, organization_id: requestedOrgId } = body;
    const assignedRoles = resolveRequestedRoles(body, callerRoleList);
    if (!assignedRoles) {
      return new Response(JSON.stringify({ error: "Perfis inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Super admins can specify a target org; otherwise use caller's org
    const targetOrgId = (callerRole === "super_admin" && requestedOrgId) 
      ? requestedOrgId 
      : callerProfile.organization_id;

    const phone = normalizeWhatsapp(body.whatsapp);
    if (!name || !email || !password || !phone) {
      return new Response(JSON.stringify({ error: !phone && name && email && password ? "WhatsApp inválido: use DDD + número (ex.: 5522999999999)" : "Nome, e-mail, WhatsApp e senha são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user via admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The trigger handle_new_user will create the profile and org automatically.
    // We need to update the profile to point to the caller's org and set the correct role.
    const userId = newUser.user.id;

    // Profile is created here (the signup trigger no longer creates profiles/orgs)
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        user_id: userId,
        organization_id: targetOrgId,
        name,
        email,
        phone,
        is_active: true,
        is_email_verified: true,
      }, { onConflict: "user_id" });
    if (profileError) {
      console.error("[create-user] profile upsert failed", profileError.code);
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "Erro interno ao criar usuário" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("user_roles").delete().eq("user_id", userId);
    const { error: rolesError } = await adminClient.from("user_roles").insert(assignedRoles.map((r) => ({ user_id: userId, role: r })));
    if (rolesError) console.error("[create-user] roles insert failed", rolesError.code);

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-user] unexpected error");
    return new Response(JSON.stringify({ error: "Erro interno ao criar usuário" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
