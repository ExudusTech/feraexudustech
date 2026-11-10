import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { formatEtiqueta, mensagemEtiqueta, parseEtiqueta, waLink, waNumero, WHATSAPP_PADRAO } from "@/lib/etiquetas";

/** /q/<numero> from the printed QR. Signed-in team → device screen. Anyone else → Flora's WhatsApp with a ready message (no internal data on this page). */
export default function EtiquetaQr() {
  const { numero } = useParams();
  const navigate = useNavigate();
  const { session, user, isLoading } = useAuth();
  const { roles = [] } = usePermissions() as any;
  const [link, setLink] = useState<string | null>(null);
  const n = parseEtiqueta(numero);
  const equipe = !!session && !!user && (roles as string[]).some((r) => r !== "visitante");

  useEffect(() => {
    if (isLoading || (session && !user)) return;
    if (equipe && n) { navigate(`/aparelho/${formatEtiqueta(n)}`, { replace: true }); return; }
    let vivo = true;
    (async () => {
      const fallback = waLink(waNumero(WHATSAPP_PADRAO)!, mensagemEtiqueta({ marca: "NitsClean", numero: 0, ativo: false }));
      const { data } = await supabase.functions.invoke("etiqueta-publica", { body: { numero: n } }).catch(() => ({ data: null }));
      const url = typeof (data as any)?.url === "string" && (data as any).url.startsWith("https://wa.me/") ? (data as any).url : fallback;
      if (!vivo) return;
      setLink(url);
      window.location.replace(url);
    })();
    return () => { vivo = false; };
  }, [isLoading, session, user, equipe, n, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-3 max-w-sm">
        <MessageCircle className="h-10 w-10 mx-auto text-primary" />
        <p className="text-lg font-semibold">Abrindo a conversa com a Flora…</p>
        {link && <a href={link} className="inline-block underline text-primary">Toque aqui se o WhatsApp não abrir</a>}
      </div>
    </div>
  );
}
