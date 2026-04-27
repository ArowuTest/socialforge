"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  CalendarDays,
  PenSquare,
  Share2,
  Sparkles,
  BarChart3,
  Users,
  Settings2,
  Zap,
  Bell,
  Plus,
  LogOut,
  Menu,
  X,
  RefreshCw,
  Image,
  Code2,
  BookTemplate,
  CreditCard,
  Palette,
  Rocket,
  CheckCheck,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth";
import { useUIStore } from "@/lib/stores/ui";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getInitials } from "@/lib/utils";
import { PlanType } from "@/types";
import { toast } from "sonner";
import { notificationsApi } from "@/lib/api";

const navSections = [
  {
    label: "OVERVIEW",
    autopilot: false,
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/analytics", icon: BarChart3, label: "Analytics" },
      { href: "/calendar", icon: CalendarDays, label: "Calendar" },
    ],
  },
  {
    label: "CREATE",
    autopilot: false,
    items: [
      { href: "/compose", icon: PenSquare, label: "Compose Post" },
      { href: "/ai", icon: Sparkles, label: "AI Studio" },
      { href: "/repurpose", icon: RefreshCw, label: "Repurpose" },
      { href: "/media", icon: Image, label: "Media Library" },
      { href: "/templates", icon: BookTemplate, label: "Templates" },
    ],
  },
  {
    label: "AI AUTOPILOT",
    autopilot: true,
    items: [
      { href: "/brand-kit", icon: Palette, label: "Brand Kit" },
      { href: "/campaigns", icon: Rocket, label: "Campaigns" },
      { href: "/automations", icon: Zap, label: "Automations" },
    ],
  },
  {
    label: "WORKSPACE",
    autopilot: false,
    items: [
      { href: "/accounts", icon: Share2, label: "Accounts" },
      { href: "/clients", icon: Users, label: "Clients" },
      { href: "/developer", icon: Code2, label: "Developer API" },
      { href: "/billing", icon: CreditCard, label: "Billing" },
      { href: "/settings", icon: Settings2, label: "Settings" },
    ],
  },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/analytics": "Analytics",
  "/calendar": "Content Calendar",
  "/compose": "Compose Post",
  "/ai": "AI Studio",
  "/repurpose": "Content Repurpose",
  "/media": "Media Library",
  "/templates": "Templates",
  "/brand-kit": "Brand Kit",
  "/campaigns": "Campaigns",
  "/automations": "Automations",
  "/accounts": "Connected Accounts",
  "/clients": "Client Workspaces",
  "/developer": "Developer API",
  "/billing": "Billing",
  "/settings": "Settings",
};

function PlanBadge({ plan }: { plan: PlanType }) {
  const config = {
    [PlanType.FREE]: { label: "Free", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    [PlanType.STARTER]: { label: "Starter", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    [PlanType.PRO]: { label: "Pro", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
    [PlanType.AGENCY]: { label: "Agency", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    [PlanType.ENTERPRISE]: { label: "Enterprise", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  };
  const { label, className } = config[plan] ?? config[PlanType.FREE];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30_000, // poll every 30 s
    refetchIntervalInBackground: false,
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.list(1, 15),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
  });

  const unreadCount = countData?.unread_count ?? 0;
  const notifications = listData?.data ?? [];

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-violet-600 border-2 border-white dark:border-gray-900 flex items-center justify-center text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Notifications
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {unreadCount}
              </Badge>
            )}
          </span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-400">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center">
              <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer",
                    !n.is_read && "bg-violet-50/50 dark:bg-violet-900/10"
                  )}
                  onClick={() => {
                    if (!n.is_read) markReadMutation.mutate(n.id);
                    if (n.action_url) window.open(n.action_url, "_blank");
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-600 flex-shrink-0" />
                    )}
                    <div className={cn("flex-1 min-w-0", n.is_read && "pl-3.5")}>
                      <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight truncate">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-gray-400">{formatTime(n.created_at)}</span>
                        {n.action_url && (
                          <span className="text-[11px] text-violet-500 flex items-center gap-0.5">
                            <ExternalLink className="h-2.5 w-2.5" /> Open
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-center">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Close
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── SidebarContent ───────────────────────────────────────────────────────────

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, workspace, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      router.push("/login");
    } catch {
      toast.error("Failed to log out");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top: Logo + workspace */}
      <div className="p-4 pb-2">
        <Link href="/calendar" className="flex items-center gap-2 group mb-4" onClick={onNavClick}>
          <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center shadow flex-shrink-0">
            <Zap className="h-4 w-4 text-white fill-white" />
          </div>
          <span className="font-bold text-base text-gray-900 dark:text-white">
            ChiselPost
          </span>
        </Link>

        {workspace && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
              {workspace.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {workspace.name}
              </p>
            </div>
            <PlanBadge plan={workspace.plan} />
          </div>
        )}
      </div>

      <Separator className="my-2" />

      {/* Nav items */}
      <ScrollArea className="flex-1 px-3">
        <nav className="py-2">
          {navSections.map((section, sectionIdx) => (
            <div key={section.label}>
              {/* Section label */}
              <p
                className={cn(
                  "px-3 py-2 text-[10px] font-semibold tracking-widest uppercase",
                  sectionIdx === 0 ? "" : "mt-3",
                  section.autopilot
                    ? ""
                    : "text-gray-400 dark:text-gray-500"
                )}
              >
                {section.autopilot ? (
                  <span className="bg-gradient-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">
                    ✨ {section.label}
                  </span>
                ) : (
                  section.label
                )}
              </p>

              {/* Items */}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavClick}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                        section.autopilot
                          ? isActive
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                            : "text-violet-600/70 dark:text-violet-400/70 hover:bg-violet-50 dark:hover:bg-violet-900/10"
                          : isActive
                            ? "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 flex-shrink-0",
                          section.autopilot
                            ? isActive
                              ? "text-violet-600 dark:text-violet-400"
                              : "text-violet-400/70 dark:text-violet-500/70"
                            : isActive
                              ? "text-violet-600 dark:text-violet-400"
                              : "text-gray-400 dark:text-gray-500"
                        )}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Bottom: user info + logout */}
      <div className="p-3 mt-auto">
        <Separator className="mb-3" />
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group cursor-default">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={user?.avatar} alt={user?.name} />
            <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-semibold">
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user?.name ?? "User"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user?.email ?? ""}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-all text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { setComposeDrawerOpen } = useUIStore();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const pageTitle = pageTitles[pathname] ?? "Dashboard";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent onNavClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-14 flex items-center gap-4 px-4 md:px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Page title */}
          <h1 className="text-base font-semibold text-gray-900 dark:text-white flex-1">
            {pageTitle}
          </h1>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <NotificationBell />

            {/* New post button */}
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white h-8 px-3 text-sm"
              onClick={() => setComposeDrawerOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Post</span>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
