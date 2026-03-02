import { createContext, useContext, useEffect, ReactNode } from "react";
import { useOrganization } from "@/hooks/use-organizations";

interface OrgBranding {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
}

const BrandingContext = createContext<OrgBranding>({
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  logoUrl: null,
});

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function OrgBrandingProvider({ children }: { children: ReactNode }) {
  const { data: org } = useOrganization();

  useEffect(() => {
    const root = document.documentElement;

    if (org?.primary_color) {
      const hsl = hexToHsl(org.primary_color);
      if (hsl) {
        root.style.setProperty("--primary", hsl);
        root.style.setProperty("--ring", hsl);
        root.style.setProperty("--sidebar-primary", hsl);
        root.style.setProperty("--sidebar-ring", hsl);
      }
    }

    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--sidebar-ring");
    };
  }, [org?.primary_color]);

  const value: OrgBranding = {
    primaryColor: org?.primary_color || null,
    secondaryColor: org?.secondary_color || null,
    accentColor: org?.accent_color || null,
    logoUrl: org?.logo_url || null,
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useOrgBranding() {
  return useContext(BrandingContext);
}
