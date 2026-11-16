import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { listaMatrizCidades } from "@/lib/matriz-cidades";

const GESTAO = ["gestor", "admin", "super_admin"];

/** Municipalities served by the Matriz; every other RJ city is Distribuidora (Flora reads this list). */
export default function MatrizCidadesCard() {
  const { user } = useAuth();
  const orgId = user?.organization_id;
  const podeEditar = (user?.roles ?? []).some((r) => GESTAO.includes(r));
  const qc = useQueryClient();
  const { data: cidades = [], isLoading } = useQuery({
    queryKey: ["matriz-cidades", orgId], enabled: !!orgId,
    queryFn: async () => ((await supabase.from("organizations").select("matriz_cidades").eq("id", orgId!).maybeSingle()).data?.matriz_cidades ?? []) as string[],
  });
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (!editando) setTexto(cidades.join("\n")); }, [cidades, editando]);

  const salvar = async () => {
    setSalvando(true);
    const { error } = await (supabase as any).rpc("definir_matriz_cidades", { _cidades: listaMatrizCidades(texto) });
    setSalvando(false);
    if (error) { toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cidades da Matriz salvas", description: "A Flora passa a usar a nova lista em até 5 minutos." });
    setEditando(false);
    qc.invalidateQueries({ queryKey: ["matriz-cidades", orgId] });
  };

  return (
    <div className="glass-card rounded-xl border border-border p-4 space-y-3 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <h3 className="font-semibold">Cidades atendidas pela Matriz</h3>
        </div>
        {podeEditar && !editando && <Button variant="outline" size="sm" onClick={() => setEditando(true)}>Editar</Button>}
      </div>
      <p className="text-sm text-muted-foreground">
        Só estas cidades vão para a Matriz. Qualquer outra cidade do RJ é da Distribuidora — sem região própria, usa a região mais próxima.
      </p>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : editando ? (
        <div className="space-y-2">
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Uma cidade por linha" aria-label="Cidades da Matriz" />
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {cidades.length ? cidades.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)
            : <span className="text-sm text-muted-foreground">Nenhuma cidade: nada vai para a Matriz.</span>}
        </div>
      )}
    </div>
  );
}
