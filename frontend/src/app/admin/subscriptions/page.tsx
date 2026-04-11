"use client";

import * as React from "react";
import { DollarSign, TrendingUp, Users, Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";

interface UserRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  subscription_status: string;
  trial_ends_at?: string;
  created_at: string;
  is_suspended: boolean;
}

const planColors: Record<string, string> = {
  free: "bg-slate-800 text-slate-300",
  starter: "bg-blue-900/50 text-blue-300",
  pro: "bg-violet-900/50 text-violet-300",
  agency: "bg-amber-900/50 text-amber-300",
};

const statusColors: Record<string, string> = {
  active:   "bg-emerald-900/40 text-emerald-400",
  trialing: "bg-blue-900/40 text-blue-400",
  past_due: "bg-red-900/40 text-red-400",
  canceled: "bg-slate-800 text-slate-400",
  suspended: "bg-red-900/40 text-red-400",
};

const statusLabels: Record<string, string> = {
  active:   "Active",
  trialing: "Trialing",
  past_due: "Past Due",
  canceled: "Canceled",
  suspended: "Suspended",
};

function StatSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-9 w-9 bg-slate-800 rounded-xl" />
        <div className="h-3 w-16 bg-slate-800 rounded" />
      </div>
      <div className="h-8 w-20 bg-slate-800 rounded mb-1" />
      <div className="h-3 w-28 bg-slate-800 rounded" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="grid grid-cols-12 items-center px-5 py-3.5 border-b border-slate-800/60 animate-pulse">
      {[4, 2, 2, 2, 2].map((span, i) => (
        <div key={i} className={`col-span-${span} h-4 bg-slate-800 rounded`} />
      ))}
    </div>
  );
}

export default function AdminSubscriptionsPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [revenue, setRevenue] = React.useState<{ total_mrr: number; breakdown: Array<{ plan: string; user_count: number }> } | null>(null);

  const PAGE_SIZE = 25;

  React.useEffect(() => {
    adminApi.getRevenue()
      .then((res) => setRevenue(res as unknown as typeof revenue))
      .catch(() => null);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (planFilter !== "all") params.plan = planFilter;
    if (search.trim()) params.search = search.trim();

    adminApi.listUsers(params as Parameters<typeof adminApi.listUsers>[0])
      .then((res) => {
        if (!cancelled) {
          setUsers(res.users as unknown as UserRow[] ?? []);
          setTotal(res.total ?? 0);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load subscriptions");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [page, planFilter, search]);

  const totalMrr = revenue?.total_mrr ?? 0;
  const paidCount = revenue?.breakdown?.filter((b) => b.plan !== "free").reduce((s, b) => s + b.user_count, 0) ?? 0;

  const filtered = statusFilter === "all"
    ? users
    : users.filter((u) => {
        if (statusFilter === "suspended") return u.is_suspended;
        return u.subscription_status === statusFilter;
      });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getUserStatus = (u: UserRow): string => {
    if (u.is_suspended) return "suspended";
    return u.subscription_status || "active";
  };

  const isTrialExpiring = (u: UserRow): boolean => {
    if (!u.trial_ends_at) return false;
    const diff = new Date(u.trial_ends_at).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // within 3 days
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading && !revenue
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : [
              { label: "Monthly Recurring Revenue", value: `$${totalMrr.toLocaleString()}`, icon: DollarSign, color: "text-violet-400" },
              { label: "Annual Run Rate", value: `$${(totalMrr * 12).toLocaleString()}`, icon: TrendingUp, color: "text-emerald-400" },
              { label: "Paid Subscribers", value: paidCount.toLocaleString(), icon: Users, color: "text-blue-400" },
              { label: "Total Users", value: total.toLocaleString(), icon: Users, color: "text-amber-400" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-9 w-9 rounded-xl bg-violet-900/30 flex items-center justify-center">
                    <s.icon className={cn("h-4 w-4", s.color)} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-sm text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
          >
            <option value="all">All Plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="agency">Agency</option>
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="canceled">Canceled</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-white text-sm">
            {loading ? "Loading…" : `${total.toLocaleString()} user${total !== 1 ? "s" : ""}`}
          </h3>
        </div>

        <div className="grid grid-cols-12 px-5 py-3 border-b border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div className="col-span-4">User</div>
          <div className="col-span-2 hidden sm:block">Plan</div>
          <div className="col-span-2 hidden md:block">Status</div>
          <div className="col-span-2 hidden lg:block">Trial Ends</div>
          <div className="col-span-2 hidden lg:block">Joined</div>
        </div>

        <div className="divide-y divide-slate-800">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
            : filtered.length === 0
            ? <div className="px-5 py-12 text-center text-sm text-slate-500">No users match your filters.</div>
            : filtered.map((u) => {
                const userStatus = getUserStatus(u);
                return (
                  <div key={u.id} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-800/40 transition-colors">
                    <div className="col-span-6 sm:col-span-4 flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {u.name?.[0]?.toUpperCase() ?? u.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{u.name}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="col-span-2 hidden sm:block">
                      <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize", planColors[u.plan] ?? "bg-slate-800 text-slate-300")}>
                        {u.plan}
                      </span>
                    </div>
                    <div className="col-span-2 hidden md:block">
                      <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", statusColors[userStatus] ?? "bg-slate-800 text-slate-400")}>
                        {statusLabels[userStatus] ?? userStatus}
                      </span>
                    </div>
                    <div className="col-span-2 hidden lg:block">
                      {u.trial_ends_at ? (
                        <span className={cn("text-xs", isTrialExpiring(u) ? "text-amber-400 font-medium" : "text-slate-400")}>
                          {new Date(u.trial_ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {isTrialExpiring(u) && " ⚠️"}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </div>
                    <div className="col-span-2 hidden lg:block text-xs text-slate-500">
                      {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                );
              })}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">Showing {filtered.length} of {total.toLocaleString()} users</p>
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
