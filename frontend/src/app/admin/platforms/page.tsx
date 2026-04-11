"use client";

import * as React from "react";
import {
  Share2, CheckCircle2, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";

const PLATFORM_META: Record<string, { label: string; color: string; textColor: string; borderColor: string }> = {
  instagram:  { label: "Instagram",  color: "bg-violet-600",  textColor: "text-violet-300",  borderColor: "border-violet-800/50" },
  tiktok:     { label: "TikTok",     color: "bg-slate-700",   textColor: "text-slate-300",   borderColor: "border-slate-700/50" },
  youtube:    { label: "YouTube",    color: "bg-red-600",     textColor: "text-red-300",     borderColor: "border-red-900/50" },
  linkedin:   { label: "LinkedIn",   color: "bg-blue-700",    textColor: "text-blue-300",    borderColor: "border-blue-900/50" },
  twitter:    { label: "Twitter / X",color: "bg-sky-600",     textColor: "text-sky-300",     borderColor: "border-sky-900/50" },
  facebook:   { label: "Facebook",   color: "bg-blue-600",    textColor: "text-blue-300",    borderColor: "border-blue-900/50" },
  pinterest:  { label: "Pinterest",  color: "bg-red-700",     textColor: "text-red-300",     borderColor: "border-red-900/50" },
  threads:    { label: "Threads",    color: "bg-zinc-700",    textColor: "text-zinc-300",    borderColor: "border-zinc-700/50" },
  bluesky:    { label: "Bluesky",    color: "bg-cyan-600",    textColor: "text-cyan-300",    borderColor: "border-cyan-900/50" },
};

function PlatformCardSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-800" />
        <div className="space-y-1.5">
          <div className="h-4 w-20 bg-slate-800 rounded" />
          <div className="h-3 w-16 bg-slate-800 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function PlatformsPage() {
  const [platforms, setPlatforms] = React.useState<Array<{ platform: string; count: number }>>([]);
  const [totalAccounts, setTotalAccounts] = React.useState(0);
  const [failedPostsToday, setFailedPostsToday] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    adminApi.getPlatformStats()
      .then((res) => {
        if (!cancelled) {
          setPlatforms(res.platforms ?? []);
          setTotalAccounts(res.total_accounts ?? 0);
          setFailedPostsToday(res.failed_posts_today ?? 0);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load platform stats");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const activePlatformCount = platforms.filter((p) => p.count > 0).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Platform Integrations</h2>
        <p className="text-slate-400 text-sm mt-1">Connected social accounts by platform across all workspaces.</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Connected Accounts", value: loading ? "—" : totalAccounts.toLocaleString(), icon: Share2, color: "text-violet-400" },
          { label: "Platforms in Use", value: loading ? "—" : activePlatformCount.toString(), icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Failed Posts (24h)", value: loading ? "—" : failedPostsToday.toLocaleString(), icon: XCircle, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <s.icon className={cn("h-5 w-5", s.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Platform cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <PlatformCardSkeleton key={i} />)
          : platforms.length === 0
          ? (
            <div className="col-span-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
              <Share2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No social accounts connected yet.</p>
              <p className="text-slate-600 text-xs mt-1">Users need to connect their accounts from the dashboard.</p>
            </div>
          )
          : platforms.map((p) => {
              const meta = PLATFORM_META[p.platform] ?? {
                label: p.platform,
                color: "bg-slate-700",
                textColor: "text-slate-300",
                borderColor: "border-slate-700/50",
              };
              return (
                <div
                  key={p.platform}
                  className={cn(
                    "bg-slate-900 border rounded-xl p-4 space-y-3",
                    meta.borderColor
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", meta.color)}>
                      <Share2 className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{meta.label}</p>
                      <p className={cn("text-xs font-medium", meta.textColor)}>
                        {p.count} account{p.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-violet-600 transition-all"
                      style={{ width: `${Math.min(100, (p.count / Math.max(1, totalAccounts)) * 100 * 5)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {totalAccounts > 0 ? `${((p.count / totalAccounts) * 100).toFixed(1)}% of all connected accounts` : ""}
                  </p>
                </div>
              );
            })}
      </div>

      {/* Note about missing platforms */}
      {!loading && platforms.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl px-5 py-4">
          <p className="text-xs text-slate-500">
            <span className="text-slate-400 font-medium">Platforms not listed</span> have no connected accounts yet.
            OAuth credentials for each platform are configured in{" "}
            <a href="/admin/settings" className="text-violet-400 hover:underline">Admin Settings</a>.
          </p>
        </div>
      )}
    </div>
  );
}
