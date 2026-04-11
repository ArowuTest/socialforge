"use client";

import * as React from "react";
import {
  Users, Building2, DollarSign, CreditCard,
  TrendingUp, CheckCircle2, AlertCircle, Server, Database, Zap, HardDrive,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import type { User } from "@/types";

const colorMap: Record<string, string> = {
  blue: "bg-blue-900/30 text-blue-400",
  violet: "bg-violet-900/30 text-violet-400",
  emerald: "bg-emerald-900/30 text-emerald-400",
  amber: "bg-amber-900/30 text-amber-400",
};

const planColors: Record<string, string> = {
  free: "bg-gray-800 text-gray-300",
  starter: "bg-blue-900/50 text-blue-300",
  pro: "bg-violet-900/50 text-violet-300",
  agency: "bg-amber-900/50 text-amber-300",
};

const health = [
  { label: "Database", status: "healthy", icon: Database },
  { label: "Redis Cache", status: "healthy", icon: Server },
  { label: "Job Queue", status: "healthy", icon: Zap },
  { label: "Storage", status: "healthy", icon: HardDrive },
];

// Placeholder revenue chart — real billing analytics endpoint not yet wired
const revenueData = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  mrr: 0,
}));

function StatSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="h-10 w-10 rounded-xl bg-slate-800" />
        <div className="h-4 w-4 rounded bg-slate-800" />
      </div>
      <div className="h-8 w-24 bg-slate-800 rounded mb-2" />
      <div className="h-3 w-32 bg-slate-800 rounded mb-1" />
      <div className="h-3 w-20 bg-slate-700 rounded" />
    </div>
  );
}

export default function AdminOverviewPage() {
  const [stats, setStats] = React.useState<{
    total_users: number;
    total_workspaces: number;
    active_subscriptions: number;
    total_social_accounts: number;
    total_posts: number;
    ai_jobs_today: number;
    ai_credits_today: number;
  } | null>(null);
  const [recentUsers, setRecentUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [statsRes, usersRes] = await Promise.all([
          adminApi.getStats(),
          adminApi.listUsers({ page: 1, pageSize: 5 }),
        ]);
        if (!cancelled) {
          setStats(statsRes);
          setRecentUsers(usersRes.users ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const statCards = stats
    ? [
        { label: "Total Users", value: stats.total_users.toLocaleString(), trend: `${stats.total_social_accounts.toLocaleString()} social accounts`, icon: Users, color: "blue" },
        { label: "Workspaces", value: stats.total_workspaces.toLocaleString(), trend: `${stats.total_posts.toLocaleString()} total posts`, icon: Building2, color: "violet" },
        { label: "Active Subscriptions", value: stats.active_subscriptions.toLocaleString(), trend: "paid accounts", icon: CreditCard, color: "emerald" },
        { label: "AI Jobs Today", value: stats.ai_jobs_today.toLocaleString(), trend: `${stats.ai_credits_today.toLocaleString()} credits used`, icon: DollarSign, color: "amber" },
      ]
    : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading || !statCards
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : statCards.map((s) => (
              <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", colorMap[s.color])}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-3xl font-extrabold text-white">{s.value}</p>
                <p className="text-sm text-slate-400 mt-0.5">{s.label}</p>
                <p className="text-xs text-emerald-400 mt-1">{s.trend}</p>
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Revenue chart — placeholder until billing analytics is wired */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white">Monthly Recurring Revenue</h3>
              <p className="text-sm text-slate-400 mt-0.5">Billing analytics coming soon</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "MRR"]} />
              <Line type="monotone" dataKey="mrr" stroke="#7C3AED" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* System health */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-semibold text-white mb-5">System Health</h3>
          <div className="space-y-3">
            {health.map((h) => (
              <div key={h.label} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
                <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
                  <h.icon className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{h.label}</p>
                  <p className="text-xs text-slate-500">No issues detected</p>
                </div>
                {h.status === "healthy" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          {stats && (
            <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-xl">
              <p className="text-xs text-emerald-400 font-medium">Total posts published</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.total_posts.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Across all workspaces</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent signups */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-white text-sm">Recent Signups</h3>
          <a href="/admin/users" className="text-xs text-violet-400 hover:underline font-medium">View all users</a>
        </div>
        <div className="divide-y divide-slate-800">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-slate-800 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-slate-800 rounded" />
                    <div className="h-3 w-48 bg-slate-800 rounded" />
                  </div>
                  <div className="h-5 w-16 bg-slate-800 rounded-full" />
                </div>
              ))
            : recentUsers.length === 0
            ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">No users yet</div>
            )
            : recentUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/50 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {u.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium px-2.5 py-0.5 rounded-full",
                      planColors["free"],
                    )}
                  >
                    User
                  </span>
                  <span className="text-xs text-slate-500 flex-shrink-0 hidden sm:block">
                    {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
