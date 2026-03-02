import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results = {
      d1_reminders_created: 0,
      expiring_tests_notified: 0,
      errors: [] as string[],
    };

    // ===================================================
    // 1. D-1 REMINDERS: Create NF Remessa reminders for
    //    installations scheduled for tomorrow
    // ===================================================
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: tomorrowInstallations, error: instError } = await supabase
      .from("ekkoa_installations")
      .select("id, title, client_id, assigned_to, organization_id, address, city, state")
      .eq("start_date", tomorrowStr)
      .in("status", ["planejada", "em_teste"]);

    if (instError) {
      results.errors.push(`Erro ao buscar instalações: ${instError.message}`);
    } else if (tomorrowInstallations && tomorrowInstallations.length > 0) {
      for (const inst of tomorrowInstallations) {
        // Check if reminder already exists for this installation
        const { data: existingOps } = await supabase
          .from("operations")
          .select("id")
          .eq("title", `[D-1] NF Remessa - ${inst.title}`)
          .eq("organization_id", inst.organization_id)
          .limit(1);

        // Get a system user (first admin) for created_by
        const { data: adminUser } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1)
          .single();

        const systemUserId = inst.assigned_to || adminUser?.user_id;
        if (!systemUserId) continue;

        // Create D-1 reminder operation
        const { error: opError } = await supabase
          .from("operations")
          .insert({
            title: `[D-1] NF Remessa - ${inst.title}`,
            description: `Lembrete automático: emitir Nota Fiscal de Remessa para instalação agendada amanhã (${tomorrowStr}).`,
            status: "pendente",
            priority: "alta",
            client_id: inst.client_id,
            assigned_to: inst.assigned_to,
            start_date: new Date().toISOString(),
            end_date: new Date(tomorrowStr).toISOString(),
            location: [inst.address, inst.city, inst.state].filter(Boolean).join(", "),
            organization_id: inst.organization_id,
            created_by: systemUserId,
          });

        if (opError) {
          results.errors.push(`Erro ao criar lembrete D-1 para ${inst.title}: ${opError.message}`);
        } else {
          results.d1_reminders_created++;
        }
      }
    }

    // ===================================================
    // 2. EXPIRING TESTS: Flag tests expiring in 2 days
    // ===================================================
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const twoDaysStr = twoDaysFromNow.toISOString().split("T")[0];

    const { data: expiringTests, error: testError } = await supabase
      .from("ekkoa_installations")
      .select("id, title, client_id, assigned_to, organization_id, end_date")
      .eq("status", "em_teste")
      .lte("end_date", twoDaysStr)
      .gte("end_date", new Date().toISOString().split("T")[0]);

    if (testError) {
      results.errors.push(`Erro ao buscar testes expirando: ${testError.message}`);
    } else if (expiringTests && expiringTests.length > 0) {
      for (const test of expiringTests) {
        // Check if alert already exists
        const { data: existingAlerts } = await supabase
          .from("operations")
          .select("id")
          .eq("title", `[ALERTA] Teste expirando - ${test.title}`)
          .eq("organization_id", test.organization_id)
          .limit(1);

        if (existingAlerts && existingAlerts.length > 0) continue;

        // Get system user for created_by
        const { data: adminUser } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1)
          .single();

        const systemUserId = test.assigned_to || adminUser?.user_id;
        if (!systemUserId) continue;

        const { error: alertError } = await supabase
          .from("operations")
          .insert({
            title: `[ALERTA] Teste expirando - ${test.title}`,
            description: `O período de teste expira em ${test.end_date}. Necessário coletar feedback do cliente e decidir sobre conversão ou retirada.`,
            status: "pendente",
            priority: "urgente",
            client_id: test.client_id,
            assigned_to: test.assigned_to,
            start_date: new Date().toISOString(),
            end_date: new Date(test.end_date!).toISOString(),
            organization_id: test.organization_id,
            created_by: systemUserId,
          });

        if (alertError) {
          results.errors.push(`Erro ao criar alerta para ${test.title}: ${alertError.message}`);
        } else {
          results.expiring_tests_notified++;
        }
      }
    }

    // ===================================================
    // 3. AUTO-CLOSE EXPIRED TESTS: Mark tests past end_date
    // ===================================================
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: expiredTests } = await supabase
      .from("ekkoa_installations")
      .select("id, title")
      .eq("status", "em_teste")
      .lt("end_date", todayStr);

    if (expiredTests && expiredTests.length > 0) {
      for (const expired of expiredTests) {
        await supabase
          .from("ekkoa_installations")
          .update({ status: "teste_expirado" })
          .eq("id", expired.id);
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
