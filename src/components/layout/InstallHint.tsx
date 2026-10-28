import { useState } from "react";
import { X, Share, MoreVertical } from "lucide-react";

const KEY = "install_hint_dismissed";

/** One-time "Adicionar à tela inicial" instructions on phones (hidden when already installed). */
export default function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return true;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone;
    return !!standalone || localStorage.getItem(KEY) === "1" || window.innerWidth >= 768;
  });
  if (hidden) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const close = () => { localStorage.setItem(KEY, "1"); setHidden(true); };
  return (
    <div className="md:hidden mb-3 rounded-xl border bg-card p-3 pr-2 flex gap-2 text-sm">
      <div className="flex-1">
        <p className="font-semibold">Use como aplicativo</p>
        {ios ? (
          <p className="text-muted-foreground">No Safari, toque em <Share className="inline h-4 w-4" /> Compartilhar e depois em “Adicionar à Tela de Início”.</p>
        ) : (
          <p className="text-muted-foreground">No Chrome, toque em <MoreVertical className="inline h-4 w-4" /> e depois em “Adicionar à tela inicial” ou “Instalar app”.</p>
        )}
      </div>
      <button onClick={close} aria-label="Fechar" className="h-11 w-11 flex items-center justify-center shrink-0"><X className="h-5 w-5" /></button>
    </div>
  );
}
