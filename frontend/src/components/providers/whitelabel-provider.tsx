"use client";

/**
 * WhitelabelProvider — resolves the agency-branded experience from the
 * current host or workspace slug, then exposes it via context AND injects
 * CSS variables so any component can pick up the branded primary colour
 * with `bg-[var(--brand-primary)]` or `style={{ color: 'var(--brand-primary)' }}`.
 *
 * Resolution order:
 *   1. If a workspace is loaded (logged-in dashboard), use its WL config directly.
 *   2. Otherwise call GET /branding?host=<window.location.host>.
 *   3. Fall back to platform defaults (ChiselPost) if no match.
 *
 * This is what makes the whitelabel feature actually deliver to the customer:
 * before this provider, the config was stored but the UI never read it.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { whitelabelApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import type { PublicBranding } from "@/types";

const DEFAULT_BRANDING: PublicBranding = {
  is_whitelabel: false,
  brand_name: "ChiselPost",
  logo_url: "",
  primary_color: "#7C3AED",
  secondary_color: "",
  slug: "",
  custom_domain: "",
};

const WhitelabelContext = React.createContext<PublicBranding>(DEFAULT_BRANDING);

export function useBranding(): PublicBranding {
  return React.useContext(WhitelabelContext);
}

/**
 * hexToRGB — utility for CSS variables that need rgb() form (e.g. with alpha).
 * Returns "124, 58, 237" for "#7C3AED".
 */
function hexToRGB(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "124, 58, 237";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

interface WhitelabelProviderProps {
  /** When provided, skip the public lookup and use this directly. Used for
   *  dashboard layout where we already have the workspace loaded. */
  source?: "auto" | "workspace" | "host";
  children: React.ReactNode;
}

export function WhitelabelProvider({ source = "auto", children }: WhitelabelProviderProps) {
  const workspace = useAuthStore((s) => s.workspace);

  // Mode 1: pull from logged-in workspace
  const fromWorkspace: PublicBranding | null = React.useMemo(() => {
    if (source === "host") return null;
    if (!workspace?.is_whitelabel) return null;
    return {
      is_whitelabel: true,
      brand_name: workspace.brand_name ?? workspace.name ?? "",
      logo_url: workspace.logo_url ?? "",
      primary_color: workspace.primary_color ?? DEFAULT_BRANDING.primary_color,
      secondary_color: workspace.secondary_color ?? "",
      slug: workspace.slug ?? "",
      custom_domain: workspace.custom_domain ?? "",
    };
  }, [workspace, source]);

  // Mode 2: pull from host (only when there's no workspace match)
  const shouldFetchPublic = source !== "workspace" && fromWorkspace === null;
  const { data } = useQuery({
    queryKey: ["branding-public", typeof window !== "undefined" ? window.location.host : ""],
    queryFn: () =>
      whitelabelApi.getPublicBranding({
        host: typeof window !== "undefined" ? window.location.host : undefined,
      }),
    enabled: shouldFetchPublic,
    staleTime: 5 * 60 * 1000, // 5 min — branding doesn't change often
  });

  const branding: PublicBranding =
    fromWorkspace ?? data?.data ?? DEFAULT_BRANDING;

  // Inject CSS variables so any rule can pick up the brand colour. Targets
  // the document root so the values are globally inherited.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", branding.primary_color);
    root.style.setProperty("--brand-primary-rgb", hexToRGB(branding.primary_color));
    if (branding.secondary_color) {
      root.style.setProperty("--brand-secondary", branding.secondary_color);
    }
    // Also update the document title prefix so the browser tab + bookmarks
    // reflect the agency's brand.
    const baseTitle = branding.brand_name || "ChiselPost";
    if (!document.title.startsWith(baseTitle)) {
      document.title = baseTitle;
    }
  }, [branding.primary_color, branding.secondary_color, branding.brand_name]);

  return <WhitelabelContext.Provider value={branding}>{children}</WhitelabelContext.Provider>;
}
