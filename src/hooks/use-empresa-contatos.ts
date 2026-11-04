import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizePrimary, onlyDigits, type ContatoDraft } from "@/lib/empresa-contatos";

type Alvo = { lead_id: string } | { client_id: string };
const key = (a: Alvo) => ("lead_id" in a ? ["empresa_contatos", "lead", a.lead_id] : ["empresa_contatos", "client", a.client_id]);

export function useEmpresaContatos(alvo: Alvo | null) {
  return useQuery({
    queryKey: alvo ? key(alvo) : ["empresa_contatos", "none"],
    enabled: !!alvo,
    queryFn: async (): Promise<ContatoDraft[]> => {
      const col = "lead_id" in alvo! ? "lead_id" : "client_id";
      const val = "lead_id" in alvo! ? alvo!.lead_id : (alvo as { client_id: string }).client_id;
      const { data, error } = await supabase.from("empresa_contatos")
        .select("id, cargo, is_primary, pessoa:pessoas(id, nome, telefone, whatsapp, email)")
        .eq(col, val).order("is_primary", { ascending: false }).order("created_at");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        linkId: r.id, pessoaId: r.pessoa?.id, nome: r.pessoa?.nome ?? "", telefone: r.pessoa?.whatsapp || r.pessoa?.telefone || "",
        email: r.pessoa?.email ?? "", cargo: r.cargo ?? "", is_primary: r.is_primary,
      }));
    },
  });
}

/** Finds (by phone/WhatsApp) or creates the person in the tenant; never duplicates a person. */
async function upsertPessoa(orgId: string, c: ContatoDraft): Promise<string> {
  const phone = onlyDigits(c.telefone);
  if (c.pessoaId) {
    await supabase.from("pessoas").update({ nome: c.nome.trim(), telefone: phone, whatsapp: phone, email: c.email.trim() || null }).eq("id", c.pessoaId);
    return c.pessoaId;
  }
  const { data: found } = await supabase.from("pessoas").select("id")
    .eq("organization_id", orgId).or(`telefone.eq.${phone},whatsapp.eq.${phone}`).limit(1).maybeSingle();
  if (found?.id) return found.id;
  const { data, error } = await supabase.from("pessoas")
    .insert({ organization_id: orgId, nome: c.nome.trim(), telefone: phone, whatsapp: phone, email: c.email.trim() || null })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

/** Replaces the company's contact list with `list` (adds, updates, removes links; people are kept). */
export async function saveEmpresaContatos(orgId: string, alvo: Alvo, list: ContatoDraft[], userId?: string) {
  const final = normalizePrimary(list);
  const col = "lead_id" in alvo ? "lead_id" : "client_id";
  const val = "lead_id" in alvo ? alvo.lead_id : alvo.client_id;
  const { data: existing } = await supabase.from("empresa_contatos").select("id, pessoa_id").eq(col, val);
  const keep = new Set<string>();
  // clear primary first so the unique-primary index never trips
  await supabase.from("empresa_contatos").update({ is_primary: false }).eq(col, val).eq("is_primary", true);
  const primaryRows: { id: string }[] = [];
  for (const c of final) {
    const pessoaId = await upsertPessoa(orgId, c);
    const ex = existing?.find((e) => e.pessoa_id === pessoaId);
    if (ex) {
      keep.add(ex.id);
      const { error } = await supabase.from("empresa_contatos").update({ cargo: c.cargo.trim() || null }).eq("id", ex.id);
      if (error) throw error;
      if (c.is_primary) primaryRows.push({ id: ex.id });
    } else {
      const { data, error } = await supabase.from("empresa_contatos")
        .insert({ organization_id: orgId, pessoa_id: pessoaId, [col]: val, cargo: c.cargo.trim() || null, is_primary: false, created_by: userId ?? null } as any)
        .select("id").single();
      if (error) throw error;
      keep.add(data.id);
      if (c.is_primary) primaryRows.push({ id: data.id });
    }
  }
  for (const e of existing ?? []) if (!keep.has(e.id)) await supabase.from("empresa_contatos").delete().eq("id", e.id);
  if (primaryRows[0]) {
    const { error } = await supabase.from("empresa_contatos").update({ is_primary: true }).eq("id", primaryRows[0].id);
    if (error) throw error;
  }
}

export function useInvalidateContatos() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ["empresa_contatos"] }); qc.invalidateQueries({ queryKey: ["leads"] }); };
}
