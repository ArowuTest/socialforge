"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp, TrendingDown, Share2, Sparkles, BarChart3,
  PenSquare, Calendar, ArrowRight, Instagram, Youtube,
  Linkedin, Twitter, Facebook, Clock, Eye, Edit3,
  ChevronDown, ChevronUp, ImageIcon, Link2, Zap, X,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth";
import { analyticsApi, postsApi, accountsApi, billingApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatCardData = {
  label: string;
  value: string;
  sub?: string;
  trend: string;
  up: boolean | null;
  icon: React.ElementType;
  color: string;
};

type RecentPost = {
  id: string;
  title: string;
  platforms: string[];
  status: string;
  scheduledAt: string;
};

type PlatformDatum = { name: string; posts: number; engagement: number };

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Returns Monday of the current week as a Date at UTC midnight. */
function getWeekMonday(): Date {
  const today = new Date();
  const day = today.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysBack = day === 0 ? 6 : day - 1; // distance to most recent Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysBack);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Maps a post date to the 0-based week-index where 0=Mon, 6=Sun. Returns -1 if outside current week. */
function weekDayIndex(dateStr: string): number {
  const monday = getWeekMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const d = new Date(dateStr);
  if (d < monday || d > sunday) return -1;
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

function buildScheduleDots(posts: Array<{ scheduled_at?: string; created_at?: string; status?: string }>): Record<number, { color: string }[]> {
  const dots: Record<number, { color: string }[]> = {};
  const statusColor = (status: string) => {
    if (status === "published") return "bg-emerald-500";
    if (status === "failed") return "bg-red-500";
    return "bg-violet-500"; // scheduled / draft / publishing
  };
  for (const post of posts) {
    const dateStr = post.scheduled_at || post.created_at;
    if (!dateStr) continue;
    const idx = weekDayIndex(dateStr);
    if (idx < 0) continue;
    if (!dots[idx]) dots[idx] = [];
    if (dots[idx].length < 3) {
      dots[idx].push({ color: statusColor(post.status ?? "scheduled") });
    }
  }
  return dots;
}

const platformIcons: Record<string, React.ElementType> = {
  instagram: Instagram, youtube: Youtube, linkedin: Linkedin, twitter: Twitter, facebook: Facebook,
};

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const colorMap: Record<string, string> = {
  violet: "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
};

// ── Getting Started Guide ─────────────────────────────────────────────────────

const setupSteps = [
  {
    id: "connect",
    title: "Connect a social media account",
    description: "Link Instagram, TikTok, YouTube, LinkedIn, or any other platform to start scheduling posts.",
    href: "/accounts",
    cta: "Connect account",
    icon: Link2,
    color: "blue" as const,
    tips: [
      "Go to Accounts → click Connect",
      "Choose your platform and log in with OAuth",
      "Repeat for each platform you manage",
    ],
  },
  {
    id: "compose",
    title: "Create and schedule your first post",
    description: "Write a caption, attach images or video, choose your platforms, and pick a publish time.",
    href: "/compose",
    cta: "Compose post",
    icon: PenSquare,
    color: "violet" as const,
    tips: [
      "Click Compose → write your caption",
      "Upload media or generate images with AI",
      "Select platforms and set a schedule date",
    ],
  },
  {
    id: "ai-image",
    title: "Generate images & captions with AI",
    description: "Describe what you want and ChiselPost AI will create professional images and captions instantly.",
    href: "/ai",
    cta: "Open AI Studio",
    icon: ImageIcon,
    color: "amber" as const,
    tips: [
      "Go to AI Studio → choose Image or Caption",
      'Enter a prompt, e.g. "vibrant product photo on white background"',
      "Download or insert directly into your post",
    ],
  },
  {
    id: "schedule",
    title: "Set up your posting schedule",
    description: "Define recurring best-time slots per platform so posts publish automatically at peak engagement.",
    href: "/calendar",
    cta: "View calendar",
    icon: Zap,
    color: "emerald" as const,
    tips: [
      "Open Calendar → click a time slot to add a post",
      "Enable Auto-Schedule to fill slots automatically",
      "Use Analytics to find your best posting times",
    ],
  },
];

const stepColors: Record<string, { bg: string; icon: string; badge: string; border: string }> = {
  blue:    { bg: "bg-blue-50 dark:bg-blue-900/20",    icon: "text-blue-600 dark:text-blue-400",    badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",    border: "border-blue-200 dark:border-blue-700" },
  violet:  { bg: "bg-violet-50 dark:bg-violet-900/20", icon: "text-violet-600 dark:text-violet-400", badge: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-700" },
  amber:   { bg: "bg-amber-50 dark:bg-amber-900/20",  icon: "text-amber-600 dark:text-amber-400",  badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",  border: "border-amber-200 dark:border-amber-700" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-900/20", icon: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-700" },
};

function GettingStartedGuide({ accountsConnected }: { accountsConnected: number }) {
  const [dismissed, setDismissed] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);
  // Auto-open step 2 if accounts are already connected; auto-dismiss if all steps seem done
  const [openStep, setOpenStep] = React.useState<string | null>(
    accountsConnected > 0 ? "compose" : "connect"
  );

  // Auto-dismiss the guide entirely once 2+ accounts are connected and guide has been seen
  React.useEffect(() => {
    if (accountsConnected >= 2) setDismissed(true);
  }, [accountsConnected]);

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border border-violet-200 dark:border-violet-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-violet-200/60 dark:border-violet-800/60">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">Get started with ChiselPost</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Follow these steps to set up your workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-gray-800/60 text-gray-500 transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-gray-800/60 text-gray-400 transition-colors"
            aria-label="Dismiss guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-2">
          {setupSteps.map((step, idx) => {
            const colors = stepColors[step.color];
            const isOpen = openStep === step.id;
            // Mark step 1 (connect) as complete when accounts exist
            const isComplete = step.id === "connect" && accountsConnected > 0;
            return (
              <div key={step.id} className={cn("rounded-xl border overflow-hidden transition-all", isOpen ? `${colors.bg} ${colors.border}` : "bg-white/70 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700")}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setOpenStep(isOpen ? null : step.id)}
                >
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", isComplete ? "bg-emerald-100 dark:bg-emerald-900/30" : isOpen ? colors.bg : "bg-gray-100 dark:bg-gray-800")}>
                    {isComplete
                      ? <span className="text-emerald-600 dark:text-emerald-400 text-base">✓</span>
                      : <step.icon className={cn("h-4 w-4", isOpen ? colors.icon : "text-gray-400")} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", isComplete ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : isOpen ? colors.badge : "bg-gray-100 dark:bg-gray-800 text-gray-500")}>
                        {isComplete ? "✓ Done" : `Step ${idx + 1}`}
                      </span>
                      <p className={cn("text-sm font-medium truncate", isComplete ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-white")}>{step.title}</p>
                    </div>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-gray-400 flex-shrink-0 transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{step.description}</p>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">How to do it</p>
                      {step.tips.map((tip, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                          <div className={cn("h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold", colors.badge)}>
                            {i + 1}
                          </div>
                          {tip}
                        </div>
                      ))}
                    </div>
                    <Link
                      href={step.href}
                      className={cn("inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-all", colors.badge, "hover:opacity-90")}
                    >
                      {step.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: StatCardData }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", colorMap[stat.color])}>
          <stat.icon className="h-5 w-5" />
        </div>
        {stat.up !== null && (
          <span className={cn("flex items-center gap-1 text-xs font-semibold", stat.up ? "text-emerald-600" : "text-red-500")}>
            {stat.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {stat.trend}
          </span>
        )}
        {stat.up === null && <span className="text-xs text-gray-500 dark:text-gray-400">{stat.trend}</span>}
      </div>
      <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
        {stat.value}
        {stat.sub && <span className="text-base font-normal text-gray-400 ml-1">{stat.sub}</span>}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
      {stat.label === "AI Credits Used" && (
        <div className="mt-3 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "42%" }} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function titleCase(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function DashboardPage() {
  const router = useRouter();
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState<StatCardData[]>([]);
  const [recentPosts, setRecentPosts] = React.useState<RecentPost[]>([]);
  const [platformData, setPlatformData] = React.useState<PlatformDatum[]>([]);
  const [scheduleDots, setScheduleDots] = React.useState<Record<number, { color: string }[]>>({});
  const [accountsConnected, setAccountsConnected] = React.useState(0);

  React.useEffect(() => {
    if (!workspace?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = now.toISOString().slice(0, 10);
      const startDate = thirtyDaysAgo.toISOString().slice(0, 10);

      // Compute this week's date range for the schedule strip
      const weekMonday = getWeekMonday();
      const weekSunday = new Date(weekMonday);
      weekSunday.setDate(weekMonday.getDate() + 6);
      const weekStart = weekMonday.toISOString().slice(0, 10);
      const weekEnd = weekSunday.toISOString().slice(0, 10);

      const [analyticsRes, postsRes, accountsRes, creditsRes, weekPostsRes] = await Promise.all([
        analyticsApi.getOverview({ startDate, endDate }).catch(() => null),
        postsApi.list({ pageSize: 5 }).catch(() => null),
        accountsApi.list().catch(() => null),
        billingApi.getCreditBalance().catch(() => null),
        postsApi.list({ from: weekStart, to: weekEnd, pageSize: 100 }).catch(() => null),
      ]);
      if (cancelled) return;

      const a = (analyticsRes as any)?.data || {};
      const engagementByPlatform: Array<{ platform: string; engagement: number }> =
        a.engagement_by_platform || [];
      const postsByDay: Array<{ date: string; count: number }> = a.posts_by_day || [];

      // Aggregate posts per platform for the chart
      const platformPostCounts: Record<string, number> = {};
      (postsRes?.data || []).forEach((p: any) => {
        (p.platforms || []).forEach((pl: string) => {
          platformPostCounts[pl] = (platformPostCounts[pl] || 0) + 1;
        });
      });

      const chart: PlatformDatum[] = engagementByPlatform.map((e) => ({
        name: titleCase(e.platform),
        posts: platformPostCounts[e.platform] || 0,
        engagement: Math.round((e.engagement || 0) * 10) / 10,
      }));

      // accountsApi.list() returns data grouped by platform as an object { platform: accounts[] }
      const accountsGrouped = (accountsRes?.data || {}) as Record<string, any[]>;
      const accounts = Object.values(accountsGrouped).flat();
      const connectedPlatforms = new Set(Object.keys(accountsGrouped));
      if (!cancelled) setAccountsConnected(accounts.length);

      const totalPosts: number = a.total_posts || 0;
      const scheduledCount = (postsRes?.data || []).filter(
        (p: any) => p.status === "scheduled"
      ).length;
      const totalScheduled = (postsRes as any)?.total ?? scheduledCount;

      const credits = (creditsRes?.data || {}) as any;
      const creditsUsed: number = credits.used || credits.credits_used || 0;
      const creditsLimit: number = credits.limit || credits.credits_limit || 2000;
      const creditsPct = creditsLimit > 0 ? Math.round((creditsUsed / creditsLimit) * 100) : 0;

      // Average engagement across platforms
      const avgEngagement =
        engagementByPlatform.length > 0
          ? engagementByPlatform.reduce((acc, e) => acc + (e.engagement || 0), 0) /
            engagementByPlatform.length
          : 0;

      if (cancelled) return;

      setStats([
        {
          label: "Posts Scheduled",
          value: String(totalScheduled),
          trend: `${totalPosts} total`,
          up: totalScheduled > 0,
          icon: Calendar,
          color: "violet",
        },
        {
          label: "Connected Accounts",
          value: String(accounts.length),
          trend: `${connectedPlatforms.size} platforms`,
          up: accounts.length > 0,
          icon: Share2,
          color: "blue",
        },
        {
          label: "AI Credits Used",
          value: formatNumber(creditsUsed),
          sub: `/ ${formatNumber(creditsLimit)}`,
          trend: `${creditsPct}% used`,
          up: null,
          icon: Sparkles,
          color: "emerald",
        },
        {
          label: "Avg Engagement",
          value: `${avgEngagement.toFixed(1)}%`,
          trend: postsByDay.length ? `${postsByDay.length}d data` : "No data",
          up: avgEngagement > 0,
          icon: BarChart3,
          color: "amber",
        },
      ]);

      setPlatformData(chart);

      // Build real schedule dots from this week's posts
      const weekPosts = (weekPostsRes?.data || []) as Array<{ scheduled_at?: string; created_at?: string; status?: string }>;
      setScheduleDots(buildScheduleDots(weekPosts));

      setRecentPosts(
        (postsRes?.data || []).slice(0, 5).map((p: any) => ({
          id: p.id,
          title: p.caption?.slice(0, 80) || "Untitled post",
          platforms: p.platforms || [],
          status: p.status || "draft",
          scheduledAt: p.scheduled_at
            ? new Date(p.scheduled_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "—",
        }))
      );

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace?.id]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Welcome header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greeting}, {firstName} 👋
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Here&apos;s what&apos;s happening with your social accounts today.</p>
      </div>

      {/* Getting started guide */}
      <GettingStartedGuide accountsConnected={accountsConnected} />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 animate-pulse">
                <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-800 mb-4" />
                <div className="h-7 w-20 bg-gray-100 dark:bg-gray-800 rounded mb-2" />
                <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
            ))
          : stats.map((s) => <StatCard key={s.label} stat={s} />)}
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: "Compose New Post", desc: "Create and schedule content for multiple platforms", href: "/compose", icon: PenSquare, color: "violet" },
            { title: "Connect Account", desc: "Link a new social media account to your workspace", href: "/accounts", icon: Share2, color: "blue" },
            { title: "Generate with AI", desc: "Use AI to create captions, images, and video scripts", href: "/ai", icon: Sparkles, color: "amber" },
          ].map((action) => (
            <Link key={action.title} href={action.href} className="group flex items-start gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0", colorMap[action.color])}>
                <action.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{action.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{action.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-violet-500 flex-shrink-0 mt-0.5 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom grid: recent posts + schedule + chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Posts */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Recent Posts</h3>
            <Link href="/calendar" className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {!loading && recentPosts.length === 0 && (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No posts yet.</p>
                <Link href="/compose" className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-700">
                  Create your first post
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
            {recentPosts.map((post) => {
              const sc = statusConfig[post.status] ?? statusConfig.draft;
              return (
                <div key={post.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{post.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex gap-1">
                        {post.platforms.map((p) => {
                          const Icon = platformIcons[p];
                          return Icon ? <Icon key={p} className="h-3 w-3 text-gray-400" /> : null;
                        })}
                      </div>
                      {post.scheduledAt !== "—" && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />{post.scheduledAt}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0", sc.className)}>{sc.label}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      title="View on calendar"
                      onClick={() => router.push(`/calendar`)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Edit post"
                      onClick={() => router.push(`/compose?post=${post.id}`)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-violet-600 transition-colors"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: schedule strip + platform chart */}
        <div className="space-y-4">
          {/* Weekly schedule */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">This Week</h3>
              <Link href="/calendar" className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">Calendar</Link>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => (
                <div key={day} className="text-center">
                  <p className="text-xs text-gray-400 mb-1.5">{day}</p>
                  <div className={cn("aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5", i === new Date().getDay() - 1 ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800" : "bg-gray-50 dark:bg-gray-800")}>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{i + 7}</span>
                    {scheduleDots[i] && (
                      <div className="flex gap-0.5">
                        {scheduleDots[i].slice(0, 3).map((dot, j) => (
                          <div key={j} className={cn("h-1 w-1 rounded-full", dot.color)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-violet-500" />Scheduled</span>
              <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-emerald-500" />Published</span>
            </div>
          </div>

          {/* Platform performance mini chart */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">Platform Engagement</h3>
            {platformData.length === 0 && !loading ? (
              <div className="h-[160px] flex items-center justify-center text-xs text-gray-400">
                No engagement data yet
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={platformData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} cursor={{ fill: "rgba(124,58,237,0.05)" }} />
                <Bar dataKey="engagement" fill="#7C3AED" radius={[4, 4, 0, 0]} name="Engagement %" />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
