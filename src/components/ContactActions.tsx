import { Navigation, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizePhoneBR } from "@/lib/service-kind";

interface Props { phone?: string | null; whatsapp?: string | null; mapUrl?: string | null }

/** Large Ligar / WhatsApp / Maps buttons shown at the top of detail windows. */
export default function ContactActions({ phone, whatsapp, mapUrl }: Props) {
  const tel = normalizePhoneBR(phone || whatsapp);
  const wa = normalizePhoneBR(whatsapp || phone);
  if (!tel && !wa && !mapUrl) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {tel ? (
        <Button asChild variant="outline" className="min-h-12 flex-col gap-0.5 text-xs"><a href={`tel:+${tel}`}><Phone className="h-5 w-5" />Ligar</a></Button>
      ) : <span />}
      {wa ? (
        <Button asChild variant="outline" className="min-h-12 flex-col gap-0.5 text-xs"><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-5 w-5" />WhatsApp</a></Button>
      ) : <span />}
      {mapUrl ? (
        <Button asChild variant="outline" className="min-h-12 flex-col gap-0.5 text-xs"><a href={mapUrl} target="_blank" rel="noopener noreferrer"><Navigation className="h-5 w-5" />Maps</a></Button>
      ) : <span />}
    </div>
  );
}
