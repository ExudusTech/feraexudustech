import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  resumo: "Conversa", criar_lead: "Novo lead", agendamento: "Agendamento",
  transferencia: "Transferência", atendimento: "Atendimento", fora_perfil: "Fora de cobertura", encerramento: "Encerramento",
};
const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", MESSENGER: "Messenger", WIDGET: "Site", TELEGRAM: "Telegram", FERA: "Fera",
};

export default function LeadTimeline({ leadId }: { leadId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lead-timeline", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_timeline")
        .select("id, canal, tipo, resumo, proximo_passo, origem, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-6 text-center">Carregando histórico…</p>;
  if (error) return <p className="text-sm text-destructive py-6 text-center">Não foi possível carregar o histórico.</p>;
  if (!data?.length) return (
    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
      <History className="h-6 w-6" />
      <p className="text-sm">Nenhuma conversa registrada ainda</p>
    </div>
  );

  return (
    <ol className="space-y-3">
      {data.map((item) => (
        <li key={item.id} className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <time dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </time>
            {item.canal && <Badge variant="outline">{CHANNEL_LABEL[item.canal] ?? item.canal}</Badge>}
            <Badge variant="secondary">{TYPE_LABEL[item.tipo] ?? item.tipo}</Badge>
            <span className="ml-auto">{item.origem === "flora" ? "Flora" : "Fera"}</span>
          </div>
          <p className="text-sm break-words">{item.resumo}</p>
          {item.proximo_passo && (
            <p className="text-sm break-words"><span className="font-medium">Próximo passo:</span> {item.proximo_passo}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
