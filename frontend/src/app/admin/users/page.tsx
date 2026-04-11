"use client";

import * as React from "react";
import { Search, ChevronDown, ShieldOff, Loader2, Gift, X, Check } from "lucide-react";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";

interface UserRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  is_suspended: boolean;
  created_at: string;
  trial_ends_at?: string;
  avatar_url?: string;
}

const planColors: Record<string, string> = {
  free: "bg-slate-800 text-slate-300",
  starter: "bg-blue-900/50 text-blue-300",
  pro: "bg-violet-900/50 text-violet-300",
  agency: "bg-amber-900/50 text-amber-300",
  enterprise: "bg-emerald-900/50 text-emerald-300",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-900/40 text-emerald-400",
  suspended: "bg-red-900/40 text-red-400",
  trialing: "bg-sky-900/40 text-sky-400",
};

const TRIAL_PRESETS = [7, 14, 30, 60, 90];

interface TrialModalProps {
  user: UserRow;
  onClose: () => void;
  onSuccess: () => void;
}

function TrialModal({ user, onClose, onSuccess }: TrialModalProps) {
  const [plan, setPlan] = React.useState<string>("pro");
  const [days, setDays] = React.useState<number>(14);
  const [customDays, setCustomDays] = React.useState<string>("");
  const [useCustom, setUseCustom] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const effectiveDays = useCustom ? parseInt(customDays || "0", 10) : days;

  const trialEndDate = React.useMemo(() => {
    if (!effectiveDays || effectiveDays <= 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + effectiveDays);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }, [effectiveDays]);

  const handleGrant = async () => {
    if (!effectiveDays || effectiveDays <= 0) {
      toast.error("Enter a valid number of days");
      return;
    }
    setSaving(true);
    try {
      await adminApi.grantPlan({
        userId: user.id,
        planType: plan,
        trialDays: effectiveDays,
      });
      toast.success(`${effectiveDays}-day ${plan} trial granted to ${user.name}`);
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to grant trial access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Gift className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Grant Trial Access</h3>
            <p className="text-sm text-slate-400 truncate max-w-[260px]">{user.email}</p>
          </div>
        </div>

        {/* Plan selector */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
            Plan
          </label>
          <div className="grid grid-cols-3 gap-2">
            {["starter", "pro", "agency"].map((p) => (
              <button
                key={p}
                onClick={() => setPlan(p)}
                className={cn(
                  "py-2 rounded-xl text-sm font-medium capitalize border transition-all",
                  plan === p
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Duration selector */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
            Duration
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {TRIAL_PRESETS.map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); setUseCustom(false); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                  !useCustom && days === d
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"
                )}
              >
                {d}d
              </button>
            ))}
            <button
              onClick={() => setUseCustom(true)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                useCustom
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"
              )}
            >
              Custom
            </button>
          </div>

          {useCustom && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                placeholder="e.g. 45"
                className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                autoFocus
              />
              <span className="text-sm text-slate-400">days</span>
            </div>
          )}

          {trialEndDate && (
            <p className="mt-3 text-xs text-slate-500">
              Trial expires on <span className="text-slate-300 font-medium">{trialEndDate}</span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGrant}
            disabled={saving || !effectiveDays || effectiveDays <= 0}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Granting…" : "Grant Trial"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [search, setSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [trialTarget, setTrialTarget] = React.useState<UserRow | null>(null);
  const pageSize = 20;

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({ page, pageSize, search: search || undefined, plan: planFilter !== "all" ? planFilter : undefined });
      if (res?.users) {
        setUsers(res.users as unknown as UserRow[]);
        setTotal(res.total ?? res.users.length);
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, planFilter]);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSuspend = async (user: UserRow) => {
    try {
      await adminApi.suspendUser(user.id);
      toast.success(`${user.is_suspended ? "Unsuspended" : "Suspended"} ${user.name}`);
      fetchUsers();
    } catch {
      toast.error("Failed to update user status");
    }
  };

  const isTrialing = (u: UserRow) =>
    !!u.trial_ends_at && new Date(u.trial_ends_at) > new Date();

  const trialDaysLeft = (u: UserRow) => {
    if (!u.trial_ends_at) return 0;
    const diff = new Date(u.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || u.plan === planFilter;
    return matchSearch && matchPlan;
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      {trialTarget && (
        <TrialModal
          user={trialTarget}
          onClose={() => setTrialTarget(null)}
          onSuccess={fetchUsers}
        />
      )}

      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Users</h2>
            <p className="text-sm text-slate-400">{total} total users</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div className="relative">
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="appearance-none bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                <option value="all">All plans</option>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="agency">Agency</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-12 px-5 py-3 border-b border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <div className="col-span-4">User</div>
            <div className="col-span-2 hidden sm:block">Plan</div>
            <div className="col-span-2 hidden md:block">Status</div>
            <div className="col-span-2 hidden lg:block">Joined</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {loading ? (
            <div className="px-5 py-16 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filtered.map((u) => (
                <div key={u.id} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-800/40 transition-colors">
                  <div className="col-span-6 sm:col-span-4 flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {getInitials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{u.name}</p>
                      <p className="text-xs text-slate-400 truncate">{u.email}</p>
                    </div>
                  </div>

                  <div className="col-span-2 hidden sm:flex items-center gap-1.5">
                    <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize", planColors[u.plan] || planColors.free)}>
                      {u.plan}
                    </span>
                    {isTrialing(u) && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-900/40 text-sky-400 whitespace-nowrap">
                        {trialDaysLeft(u)}d left
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 hidden md:block">
                    <span className={cn(
                      "text-xs font-medium px-2.5 py-0.5 rounded-full",
                      u.is_suspended
                        ? statusColors.suspended
                        : isTrialing(u)
                        ? statusColors.trialing
                        : statusColors.active
                    )}>
                      {u.is_suspended ? "Suspended" : isTrialing(u) ? "Trial" : "Active"}
                    </span>
                  </div>

                  <div className="col-span-2 hidden lg:block text-sm text-slate-400">
                    {formatDate(u.created_at)}
                  </div>

                  <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-1">
                    <button
                      onClick={() => setTrialTarget(u)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-violet-400 transition-colors"
                      title="Grant trial access"
                    >
                      <Gift className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleSuspend(u)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                      title={u.is_suspended ? "Unsuspend" : "Suspend"}
                    >
                      <ShieldOff className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-slate-500">No users match your search.</div>
          )}

          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} ({total} users)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-white bg-violet-600 px-3 py-1.5 rounded-lg">{page}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
