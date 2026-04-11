"use client";

import * as React from "react";
import { Search, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscription_status: string;
  owner_email: string;
  owner_name: string;
  member_count: number;
  social_account_count: number;
  created_at: string;
  credit_balance: number;
}

const planColors: Record<string, string> = {
  free: "bg-slate-800 text-slate-300",
  starter: "bg-blue-900/50 text-blue-300",
  pro: "bg-violet-900/50 text-violet-300",
  agency: "bg-amber-900/50 text-amber-300",
};

function RowSkeleton() {
  return (
    <div className="grid grid-cols-12 items-center px-5 py-3.5 border-b border-slate-800/60 animate-pulse">
      {[4, 2, 2, 2, 2].map((span, i) => (
        <div key={i} className={`col-span-${span} h-4 bg-slate-800 rounded`} />
      ))}
    </div>
  );
}

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const PAGE_SIZE = 20;

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    adminApi.listWorkspaces({ page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) {
          const raw = res as unknown as { workspaces: WorkspaceRow[]; total: number };
          setWorkspaces(raw.workspaces ?? []);
          setTotal(raw.total ?? 0);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load workspaces");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [page, debouncedSearch]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Client-side search filter when debounced search is active
  const filtered = debouncedSearch
    ? workspaces.filter((w) =>
        w.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        w.owner_email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (w.owner_name ?? "").toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : workspaces;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Workspaces</h2>
          <p className="text-sm text-slate-400">{total.toLocaleString()} total workspaces</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspaces…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-800/40 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 border-b border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div className="col-span-4">Workspace</div>
          <div className="col-span-2 hidden sm:block">Plan</div>
          <div className="col-span-2 hidden md:block">Members</div>
          <div className="col-span-2 hidden lg:block">Accounts</div>
          <div className="col-span-2 hidden xl:block">Created</div>
        </div>

        <div className="divide-y divide-slate-800">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
            : filtered.length === 0
            ? (
              <div className="px-5 py-12 text-center">
                <Building2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No workspaces found</p>
              </div>
            )
            : filtered.map((w) => (
              <div key={w.id} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-800/40 transition-colors">
                <div className="col-span-8 sm:col-span-4 flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {w.name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{w.name}</p>
                    <p className="text-xs text-slate-400 truncate">{w.owner_name || w.owner_email}</p>
                  </div>
                </div>
                <div className="col-span-2 hidden sm:block">
                  <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize", planColors[w.plan] ?? "bg-slate-800 text-slate-300")}>
                    {w.plan}
                  </span>
                </div>
                <div className="col-span-2 hidden md:block text-sm text-slate-400">{w.member_count} member{w.member_count !== 1 ? "s" : ""}</div>
                <div className="col-span-2 hidden lg:block text-sm text-slate-400">{w.social_account_count} account{w.social_account_count !== 1 ? "s" : ""}</div>
                <div className="col-span-2 hidden xl:block text-xs text-slate-500">
                  {new Date(w.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
            ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">Showing {filtered.length} of {total}</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-400 px-1">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
