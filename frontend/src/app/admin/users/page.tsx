"use client";

import * as React from "react";
import { Search, ChevronDown, Eye, ShieldOff, Trash2, Loader2 } from "lucide-react";
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
};

export default function AdminUsersPage() {
  const [search, setSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const pageSize = 20;

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({ page, pageSize });
      if (res?.data) {
        setUsers(res.data as unknown as UserRow[]);
        setTotal((res as unknown as { total?: number }).total || res.data.length);
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page]);

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

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || u.plan === planFilter;
    return matchSearch && matchPlan;
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
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
          <div className="col-span-2">Actions</div>
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
                <div className="col-span-2 hidden sm:block">
                  <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize", planColors[u.plan] || planColors.free)}>
                    {u.plan}
                  </span>
                </div>
                <div className="col-span-2 hidden md:block">
                  <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", u.is_suspended ? statusColors.suspended : statusColors.active)}>
                    {u.is_suspended ? "Suspended" : "Active"}
                  </span>
                </div>
                <div className="col-span-2 hidden lg:block text-sm text-slate-400">
                  {formatDate(u.created_at)}
                </div>
                <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-1">
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
  );
}
