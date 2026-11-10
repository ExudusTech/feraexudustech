Deno.test("env disponível", () => {
  console.log("URL", !!Deno.env.get("SUPABASE_URL"), "SRK", !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
});
