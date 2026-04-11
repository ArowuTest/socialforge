"use client";

import * as React from "react";
import { Search, Download, Filter, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";

interface AuditLogRow {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  user_email: string;
  user_name: string;
}

const actionColors: Record<string, string> = {
  "user.login":             "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  "user.logout":            "bg-slate-800 text-slate-400 border-slate-700",
  "user.register":          "bg-violet-900/50 text-violet-300 border-violet-800/60",
  "post.created":           "bg-violet-900/50 text-violet-300 border-violet-800/60",
  "post.published":         "bg-blue-900/50 text-blue-300 border-blue-800/60",
  "post.deleted":           "bg-red-900/50 text-red-300 border-red-800/60",
  "account.connected":      "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  "account.disconnected":   "bg-amber-900/50 text-amber-300 border-amber-800/60",
  "billing.upgraded":       "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  "billing.canceled":       "bg-red-900/50 text-red-300 border-red-800/60",
  "workspace.created":      "bg-violet-900/50 text-violet-300 border-violet-800/60",
  "api_key.created":        "bg-blue-900/50 text-blue-300 border-blue-800/60",
  "api_key.deleted":        "bg-red-900/50 text-red-300 border-red-800/60",
};

function defaultActionColor(action: string): string {
  if (action.endsWith(".created") || action.endsWith(".connected") || action.endsWith(".login")) {
    return "bg-emerald-900/50 text-emerald-300 border-emerald-800/60";
  }
  if (action.endsWith(".deleted") || action.endsWith(".disconnected") || action.endsWith(".canceled")) {
    return "bg-red-900/50 text-red-300 border-red-800/60";
  }
  return "bg-slate-800 text-slate-400 border-slate-700";
}

function getInitials(name: string, email: string): string {
  if (name) return name.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

function RowSkeleton() {
  return (
    <div className="grid grid-cols-[1.4fr_1.8fr_1.6fr_1fr_1.2fr_1fr_1.4fr] gap-3 px-5 py-3 border-b border-slate-800/60 animate-pulse">
      {[90, 120, 130, 80, 110, 70, 100].map((w, i) => (
        <div key={i} className="h-4 bg-slate-800 rounded" style={{ width: `${w}px` }} />
      ))}
    </div>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState<AuditLogRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");

  const PAGE_SIZE = 50;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (actionFilter !== "all") params.action = actionFilter;

    adminApi.getAuditLogs(params as Parameters<typeof adminApi.getAuditLogs>[0])
      .then((res) => {
        if (!cancelled) {
          const raw = res as unknown as { logs: AuditLogRow[]; total: number };
          setLogs(raw.logs ?? []);
          setTotal(raw.total ?? 0);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audit logs");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [page, actionFilter]);

  const filtered = search
    ? logs.filter((l) => {
        const q = search.toLowerCase();
        return (
          l.user_email?.toLowerCase().includes(q) ||
          l.action?.includes(q) ||
          l.resource_id?.includes(q) ||
          l.user_name?.toLowerCase().includes(q)
        );
      })
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Audit Logs</h2>
          <p className="text-slate-400 text-sm mt-1">Security and activity log for all user actions.</p>
        </div>
        <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-sm px-4 py-2 rounded-lg transition-colors">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by user, action, resource..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
          >
            <option value="all">All Actions</option>
            <option value="user.login">user.login</option>
            <option value="user.logout">user.logout</option>
            <option value="user.register">user.register</option>
            <option value="post.created">post.created</option>
            <option value="post.published">post.published</option>
            <option value="post.deleted">post.deleted</option>
            <option value="account.connected">account.connected</option>
            <option value="account.disconnected">account.disconnected</option>
            <option value="billing.upgraded">billing.upgraded</option>
            <option value="billing.canceled">billing.canceled</option>
            <option value="workspace.created">workspace.created</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800">
          <Shield className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">
            {loading ? "Loading…" : `${total.toLocaleString()} event${total !== 1 ? "s" : ""}`}
          </span>
        </div>

        <div className="grid grid-cols-[1.4fr_1.8fr_1.6fr_1fr_1.2fr_1fr_1.4fr] gap-3 px-5 py-2.5 border-b border-slate-800">
          {["Timestamp", "User", "Action", "Resource Type", "Resource ID", "IP Address", "User Agent"].map((h) => (
            <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {loading
          ? Array.from({ length: 10 }).map((_, i) => <RowSkeleton key={i} />)
          : filtered.length === 0
          ? <div className="py-12 text-center text-slate-500 text-sm">No log entries match your filters.</div>
          : filtered.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-[1.4fr_1.8fr_1.6fr_1fr_1.2fr_1fr_1.4fr] gap-3 px-5 py-3 items-center border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
              >
                <span className="text-xs font-mono text-slate-400">
                  {new Date(log.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>

                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-violet-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {getInitials(log.user_name, log.user_email)}
                  </div>
                  <span className="text-xs text-slate-300 truncate">{log.user_email || "System"}</span>
                </div>

                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border w-fit", actionColors[log.action] ?? defaultActionColor(log.action))}>
                  {log.action}
                </span>

                <span className="text-xs text-slate-400">{log.resource_type || "—"}</span>
                <span className="text-xs font-mono text-slate-500 truncate">{log.resource_id ? `${log.resource_id.slice(0, 12)}…` : "—"}</span>
                <span className="text-xs font-mono text-slate-500">{log.ip_address || "—"}</span>
                <span className="text-xs text-slate-600 truncate">{log.user_agent ? `${log.user_agent.slice(0, 20)}…` : "—"}</span>
              </div>
            ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} ({total.toLocaleString()} total events)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-slate-400 px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
