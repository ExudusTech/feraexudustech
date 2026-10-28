import { createContext, useContext, useEffect, ReactNode } from "react";
import { useOrganization } from "@/hooks/use-organizations";
import { buildBrandCss, isCustomBrand } from "@/lib/brand";
import exudusIcon from "@/assets/logo-exudus-nova.png";

interface OrgBranding {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  orgName: string | null;
}

const BrandingContext = createContext<OrgBranding>({
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  logoUrl: null,
  orgName: null,
});

const STYLE_ID = "org-brand-vars";
const DEFAULT_THEME = "#000000";

function setLink(rel: string, href: string, type?: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  if (type) el.type = type;
}

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

let manifestUrl: string | null = null;

/** Installable-app metadata per organization (manifest only, no service worker). */
function applyManifest(name: string, color: string, icon: string) {
  const manifest = {
    name,
    short_name: name.length > 12 ? name.split(" ")[0] : name,
    start_url: `${window.location.origin}/agenda`,
    scope: `${window.location.origin}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: color,
    icons: [
      { src: new URL(icon, window.location.origin).href, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: new URL(icon, window.location.origin).href, sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  if (manifestUrl) URL.revokeObjectURL(manifestUrl);
  manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
  setLink("manifest", manifestUrl);
}

export function OrgBrandingProvider({ children }: { children: ReactNode }) {
  const { data: org } = useOrganization();
  const custom = isCustomBrand(org?.primary_color);
  const headingFont = (org as any)?.heading_font as string | null | undefined;

  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (custom && org?.primary_color) {
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      let css = buildBrandCss({ primary: org.primary_color, secondary: org.secondary_color, accent: org.accent_color });
      if (headingFont === "Montserrat") {
        css += `h1,h2,h3,h4,h5,h6{font-family:'Montserrat',sans-serif}`;
        if (!document.getElementById("font-montserrat")) {
          const l = document.createElement("link");
          l.id = "font-montserrat";
          l.rel = "stylesheet";
          l.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap";
          document.head.appendChild(l);
        }
      }
      style.textContent = css;
    } else if (style) {
      style.remove();
    }

    const icon = org?.logo_url || exudusIcon;
    setLink("icon", icon);
    setLink("apple-touch-icon", icon);
    const theme = custom && org?.primary_color ? org.primary_color : DEFAULT_THEME;
    setMeta("theme-color", theme);
    setMeta("apple-mobile-web-app-capable", "yes");
    setMeta("apple-mobile-web-app-title", org?.trading_name || org?.name || "Fera");
    applyManifest(org?.trading_name || org?.name || "Fera", theme, icon);
  }, [custom, org?.primary_color, org?.secondary_color, org?.accent_color, org?.logo_url, org?.name, org?.trading_name, headingFont]);

  const value: OrgBranding = {
    primaryColor: custom ? org?.primary_color ?? null : null,
    secondaryColor: custom ? org?.secondary_color ?? null : null,
    accentColor: custom ? org?.accent_color ?? null : null,
    logoUrl: org?.logo_url || null,
    orgName: org?.trading_name || org?.name || null,
  };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useOrgBranding() {
  return useContext(BrandingContext);
}
