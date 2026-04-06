"use client";

import * as React from "react";
import {
  Share2, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Clock, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const platforms = [
  {
    name: "Instagram",
    color: "bg-violet-600",
    textColor: "text-violet-400",
    borderColor: "border-violet-800/50",
    accounts: 52,
    oauthConfigured: true,
    rateLimitHealth: "green" as const,
    lastPost: "2 min ago",
  },
  {
    name: "TikTok",
    color: "bg-slate-700",
    textColor: "text-slate-300",
    borderColor: "border-slate-700/50",
    accounts: 31,
    oauthConfigured: true,
    rateLimitHealth: "green" as const,
    lastPost: "5 min ago",
  },
  {
    name: "YouTube",
    color: "bg-red-600",
    textColor: "text-red-400",
    borderColor: "border-red-900/50",
    accounts: 18,
    oauthConfigured: true,
    rateLimitHealth: "green" as const,
    lastPost: "12 min ago",
  },
  {
    name: "LinkedIn",
    color: "bg-blue-700",
    textColor: "text-blue-400",
    borderColor: "border-blue-900/50",
    accounts: 27,
    oauthConfigured: true,
    rateLimitHealth: "green" as const,
    lastPost: "8 min ago",
  },
  {
    name: "Twitter / X",
    color: "bg-sky-600",
    textColor: "text-sky-400",
    borderColor: "border-sky-900/50",
    accounts: 34,
    oauthConfigured: true,
    rateLimitHealth: "yellow" as const,
    lastPost: "1 hr ago",
  },
  {
    name: "Facebook",
    color: "bg-blue-600",
    textColor: "text-blue-400",
    borderColor: "border-blue-900/50",
    accounts: 14,
    oauthConfigured: true,
    rateLimitHealth: "green" as const,
    lastPost: "19 min ago",
  },
  {
    name: "Pinterest",
    color: "bg-red-700",
    textColor: "text-red-400",
    borderColor: "border-red-900/50",
    accounts: 5,
    oauthConfigured: true,
    rateLimitHealth: "green" as const,
    lastPost: "34 min ago",
  },
  {
    name: "Threads",
    color: "bg-zinc-700",
    textColor: "text-zinc-400",
    borderColor: "border-zinc-700/50",
    accounts: 3,
    oauthConfigured: true,
    rateLimitHealth: "green" as const,
    lastPost: "47 min ago",
  },
];

const recentErrors = [
  { platform: "Twitter / X", account: "@acme_brand", error: "Rate limit exceeded (429). Retry after 15m.", time: "42 min ago" },
  { platform: "Twitter / X", account: "@techstartup", error: "Rate limit exceeded (429). Retry after 15m.", time: "44 min ago" },
  { platform: "Instagram", account: "fashionco_ig", error: "Media upload failed: file size exceeds 100MB limit.", time: "2 hr ago" },
  { platform: "Facebook", account: "BrandPageXYZ", error: "Token expired. Re-authentication required.", time: "3 hr ago" },
  { platform: "LinkedIn", account: "acme-corp", error: "Post rejected: duplicate content detected.", time: "5 hr ago" },
];

const healthDot: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
};
const healthLabel: Record<string, string> = {
  green: "Healthy",
  yellow: "Warning",
  red: "Critical",
};
const healthText: Record<string, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-red-400",
};

export default function PlatformsPage() {
  const [retrying, setRetrying] = React.useState<number | null>(null);

  const handleRetry = (i: number) => {
    setRetrying(i);
    setTimeout(() => setRetrying(null), 1500);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Platform Integrations</h2>
        <p className="text-slate-400 text-sm mt-1">Monitor OAuth apps, connected accounts, and platform health.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Connected Accounts", value: "184", icon: Share2, color: "text-violet-400" },
          { label: "Platforms Healthy", value: "7 / 8", icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Failed Posts (24h)", value: "3", icon: XCircle, color: "text-red-400" },
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
        {platforms.map((p) => (
          <div
            key={p.name}
            className={cn(
              "bg-slate-900 border rounded-xl p-4 space-y-3",
              p.rateLimitHealth === "yellow" ? "border-amber-800/60" : "border-slate-800"
            )}
          >
            {/* Platform header */}
            <div className="flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", p.color)}>
                <Share2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                <p className={cn("text-xs font-medium", p.textColor)}>{p.accounts} accounts</p>
              </div>
            </div>

            {/* OAuth status */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">OAuth App</span>
              {p.oauthConfigured ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" /> Not configured
                </span>
              )}
            </div>

            {/* Rate limit health */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Rate Limits</span>
              <span className={cn("flex items-center gap-1.5 font-medium", healthText[p.rateLimitHealth])}>
                <span className={cn("h-2 w-2 rounded-full", healthDot[p.rateLimitHealth])} />
                {healthLabel[p.rateLimitHealth]}
              </span>
            </div>

            {/* Last post */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Last Post</span>
              <span className="flex items-center gap-1 text-slate-400">
                <Clock className="h-3 w-3" /> {p.lastPost}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Recent errors table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <Activity className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-semibold text-white">Recent Platform Errors</h3>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-[1fr_1fr_2fr_1fr_auto] gap-4 px-5 py-2.5 border-b border-slate-800">
          {["Platform", "Account", "Error Message", "Time", "Action"].map((h) => (
            <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {/* Data rows */}
        {recentErrors.map((e, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_2fr_1fr_auto] gap-4 px-5 py-3 items-center border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
          >
            <span className="text-sm text-white font-medium truncate">{e.platform}</span>
            <span className="text-sm text-slate-300 font-mono text-xs truncate">{e.account}</span>
            <span className="text-xs text-red-300 truncate">{e.error}</span>
            <span className="text-xs text-slate-500">{e.time}</span>
            <button
              onClick={() => handleRetry(i)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 px-2.5 py-1 rounded-lg transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", retrying === i && "animate-spin")} />
              Retry
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
