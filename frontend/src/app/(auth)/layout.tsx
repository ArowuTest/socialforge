"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { WhitelabelProvider, useBranding } from "@/components/providers/whitelabel-provider";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Wrap in WhitelabelProvider in "host" mode so the public /branding endpoint
  // is consulted using window.location.host. When a client visits
  // clients.acme.com/login, they see Acme's logo + name + footer.
  return (
    <WhitelabelProvider source="host">
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </WhitelabelProvider>
  );
}

function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  const branding = useBranding();
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-violet-950 flex flex-col">
      {/* Branded logo top-left — swaps to agency brand when whitelabel is active */}
      <header className="absolute top-0 left-0 p-6">
        <Link href="/" className="flex items-center gap-2 group">
          {branding.is_whitelabel && branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo_url}
              alt={branding.brand_name}
              className="h-8 w-8 rounded-lg object-contain bg-white border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shadow-md group-hover:opacity-90 transition-opacity"
              style={{ backgroundColor: branding.primary_color || "#7C3AED" }}
            >
              <Zap className="h-4 w-4 text-white fill-white" />
            </div>
          )}
          <span className="font-bold text-lg text-gray-900 dark:text-white transition-colors">
            {branding.brand_name || "ChiselPost"}
          </span>
        </Link>
      </header>

      {/* Decorative background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-32 w-96 h-96 rounded-full bg-violet-200/40 dark:bg-violet-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 w-96 h-96 rounded-full bg-purple-200/40 dark:bg-purple-900/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-100/20 dark:bg-violet-900/10 blur-3xl" />
      </div>

      {/* Centered content */}
      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        {children}
      </main>

      {/* Footer — also branded */}
      <footer className="text-center p-4 text-xs text-gray-400 dark:text-gray-600 relative z-10">
        &copy; {new Date().getFullYear()} {branding.brand_name || "ChiselPost"}. All rights reserved.
      </footer>
    </div>
  );
}
