"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Building2, CreditCard, Share2,
  Sparkles, FileText, Settings, Zap, LogOut, Menu, X, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth";

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/users", icon: Users, label: "Users" },
  { href: "/admin/workspaces", icon: Building2, label: "Workspaces" },
  { href: "/admin/subscriptions", icon: CreditCard, label: "Subscriptions" },
  { href: "/admin/platforms", icon: Share2, label: "Platforms" },
  { href: "/admin/ai-jobs", icon: Sparkles, label: "AI Jobs" },
  { href: "/admin/audit-logs", icon: FileText, label: "Audit Logs" },
  { href: "/admin/settings", icon: Settings, label: "Settings" },
];

function AdminSidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Logo */}
      <div className="p-5 border-b border-slate-800">
        <Link href="/admin" className="flex items-center gap-2.5" onClick={onClose}>
          <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white fill-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">SocialForge</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Shield className="h-3 w-3 text-violet-400" />
              <span className="text-xs text-violet-400 font-medium">Admin Portal</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {adminNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-violet-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
          <LayoutDashboard className="h-4 w-4" />
          Back to App
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-all mt-0.5">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  const pageTitle = adminNav.find((n) => n.href === pathname)?.label ?? "Admin";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col flex-shrink-0">
        <AdminSidebar />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-60 h-full">
            <AdminSidebar onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-14 flex items-center gap-4 px-4 md:px-6 border-b border-slate-800 bg-slate-900 flex-shrink-0">
          <button className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-semibold text-white flex-1">{pageTitle}</h1>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 bg-violet-900/40 border border-violet-800/50 text-violet-300 text-xs font-medium px-2.5 py-1 rounded-full">
              <Shield className="h-3 w-3" /> Admin
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
