"use client";

import * as React from "react";
import Link from "next/link";
import {
  PenSquare,
  CalendarDays,
  Sparkles,
  Image,
  RefreshCw,
  Rocket,
  Zap,
  Clock,
  ArrowRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth";
import { postsApi } from "@/lib/api";
import { Post } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatCard = {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
};

type RecentPost = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: {
    label: "Scheduled",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  published: {
    label: "Published",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  draft: {
    label: "Draft",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

const colorMap: Record<string, string> = {
  violet:
    "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  emerald:
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  amber:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCardItem({ stat }: { stat: StatCard }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow">
      <div
        className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center mb-4",
          colorMap[stat.color]
        )}
      >
        <stat.icon className="h-5 w-5" />
      </div>
      <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
        {stat.value}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {stat.label}
      </p>
    </div>
  );
}

// ── Quick AI Tool card ────────────────────────────────────────────────────────

function QuickToolCard({
  icon: Icon,
  label,
  href,
  color,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 hover:bg-violet-50 dark:hover:bg-violet-900/10 border border-transparent hover:border-violet-200 dark:hover:border-violet-800/40 transition-all"
    >
      <div
        className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
          colorMap[color]
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors flex-1">
        {label}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-violet-500 transition-colors flex-shrink-0" />
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = React.useState(true);
  const [recentPosts, setRecentPosts] = React.useState<RecentPost[]>([]);
  const [stats, setStats] = React.useState<StatCard[]>([]);

  React.useEffect(() => {
    if (!workspace?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const [allPostsRes, todayPostsRes] = await Promise.all([
        postsApi.list({ pageSize: 50 }).catch(() => null),
        postsApi
          .list({ from: todayStr, to: todayStr, pageSize: 100 })
          .catch(() => null),
      ]);
      if (cancelled) return;

      const allPosts: Post[] = allPostsRes?.data || [];
      const todayPosts: Post[] = todayPostsRes?.data || [];

      // Posts this week (Mon–Sun)
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      weekStart.setHours(0, 0, 0, 0);
      const postsThisWeek = allPosts.filter((p) => {
        const d = new Date(p.scheduledAt || p.createdAt || "");
        return d >= weekStart;
      }).length;

      // Published today
      const publishedToday = todayPosts.filter(
        (p) => p.status === "published"
      ).length;

      setStats([
        {
          label: "Posts This Week",
          value: postsThisWeek,
          icon: CalendarDays,
          color: "violet",
        },
        {
          label: "Published Today",
          value: publishedToday,
          icon: Zap,
          color: "emerald",
        },
        {
          label: "Credits Remaining",
          // Credits fetched separately below — placeholder until billing API is called
          value: "—",
          icon: Sparkles,
          color: "amber",
        },
        {
          label: "Active Campaigns",
          // TODO: replace with real campaigns API when available
          value: "—",
          icon: Rocket,
          color: "blue",
        },
      ]);

      setRecentPosts(
        allPosts.slice(0, 3).map((p) => ({
          id: p.id,
          title: (p.caption || "Untitled post").slice(0, 80),
          status: p.status || "draft",
          scheduledAt: p.scheduledAt
            ? new Date(p.scheduledAt).toLocaleString(undefined, {
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
  const firstName =
    user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Welcome row */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greeting}, {firstName} 👋
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Here&apos;s an overview of your workspace today.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5"
              >
                <Skeleton className="h-10 w-10 rounded-xl mb-4" />
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          : stats.map((s) => <StatCardItem key={s.label} stat={s} />)}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Manual Content */}
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-2xl">
          <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-base">
                ✏️ Manual Content
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                You control every post
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {/* Quick actions */}
            <div className="flex gap-3">
              <Button
                asChild
                className="bg-violet-600 hover:bg-violet-700 text-white flex-1"
              >
                <Link href="/compose">
                  <PenSquare className="h-4 w-4 mr-2" />
                  Compose Post
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="flex-1 border-gray-200 dark:border-gray-700"
              >
                <Link href="/calendar">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Open Calendar
                </Link>
              </Button>
            </div>

            {/* Quick AI Tools */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Quick AI Tools
              </p>
              <div className="space-y-2">
                <QuickToolCard
                  icon={Sparkles}
                  label="Generate Caption"
                  href="/ai?tool=caption"
                  color="amber"
                />
                <QuickToolCard
                  icon={Image}
                  label="Generate Image"
                  href="/ai?tool=image"
                  color="violet"
                />
                <QuickToolCard
                  icon={RefreshCw}
                  label="Repurpose Content"
                  href="/repurpose"
                  color="blue"
                />
              </div>
            </div>

            {/* Recent posts */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Recent Posts
              </p>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              ) : recentPosts.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  No posts yet.{" "}
                  <Link
                    href="/compose"
                    className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
                  >
                    Create your first post →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  {recentPosts.map((post) => {
                    const sc =
                      statusConfig[post.status] ?? statusConfig.draft;
                    return (
                      <div
                        key={post.id}
                        className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {post.title}
                          </p>
                          {post.scheduledAt !== "—" && (
                            <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {post.scheduledAt}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0",
                            sc.className
                          )}
                        >
                          {sc.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — AI Autopilot */}
        <div className="bg-violet-50 dark:bg-violet-950/20 rounded-xl border border-violet-200 dark:border-violet-800/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-violet-200 dark:border-violet-800/30">
            <p className="font-semibold text-gray-900 dark:text-white text-base">
              ✨ AI Autopilot
            </p>
            <p className="text-sm text-violet-600/70 dark:text-violet-400/70 mt-0.5">
              AI plans, creates &amp; posts automatically
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* TODO: Replace mock data with real campaigns API when /campaigns endpoint is available */}
            {/* CTA card — no campaigns yet */}
            <div className="bg-white dark:bg-gray-900/60 rounded-xl border border-violet-200 dark:border-violet-800/30 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                  <Rocket className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    Set up your first campaign
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Let AI generate a full content calendar from a brief
                  </p>
                </div>
              </div>
              <Button
                asChild
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Link href="/campaigns/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Campaign
                </Link>
              </Button>
            </div>

            {/* Next auto-post preview placeholder */}
            <div className="bg-white dark:bg-gray-900/60 rounded-xl border border-violet-200 dark:border-violet-800/30 p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Next Auto-Post
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                No upcoming auto-posts scheduled.
              </p>
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                asChild
                variant="outline"
                className="flex-1 border-violet-200 dark:border-violet-800/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/20"
              >
                <Link href="/campaigns/new">
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Campaign
                </Link>
              </Button>
              <Link
                href="/campaigns"
                className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline whitespace-nowrap"
              >
                View All →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Platform health / connected accounts quick view */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900 dark:text-white text-sm">
            Connected Accounts
          </p>
          <Link
            href="/accounts"
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium"
          >
            Manage accounts
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { platform: "Instagram", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
            { platform: "LinkedIn", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
            { platform: "X / Twitter", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
            { platform: "Facebook", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
          ].map((a) => (
            <Link
              key={a.platform}
              href="/accounts"
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-transparent hover:border-gray-300 dark:hover:border-gray-600 transition-colors",
                a.color
              )}
            >
              {a.platform}
            </Link>
          ))}
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add account
          </Link>
        </div>
      </div>
    </div>
  );
}
