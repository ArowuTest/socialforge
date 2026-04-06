"use client";

import * as React from "react";
import { Search, ChevronDown, Eye, ShieldOff, Trash2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const allUsers = [
  { id: "1", name: "Alice Johnson", email: "alice@brandlift.io", plan: "Pro", status: "active", joined: "Apr 6, 2026", accounts: 8, workspaces: 3 },
  { id: "2", name: "Marcus Chen", email: "marcus@mediaflow.co", plan: "Agency", status: "active", joined: "Apr 5, 2026", accounts: 24, workspaces: 12 },
  { id: "3", name: "Priya Mehta", email: "priya@contentx.io", plan: "Starter", status: "active", joined: "Apr 5, 2026", accounts: 5, workspaces: 2 },
  { id: "4", name: "Jordan Williams", email: "jordan@viralco.com", plan: "Free", status: "active", joined: "Apr 4, 2026", accounts: 2, workspaces: 1 },
  { id: "5", name: "Sophie Laurent", email: "sophie@agencypro.fr", plan: "Pro", status: "active", joined: "Apr 4, 2026", accounts: 10, workspaces: 4 },
  { id: "6", name: "David Kim", email: "david@growthstack.io", plan: "Pro", status: "suspended", joined: "Mar 28, 2026", accounts: 7, workspaces: 3 },
  { id: "7", name: "Emma Torres", email: "emma@mediaplus.co", plan: "Starter", status: "active", joined: "Mar 25, 2026", accounts: 4, workspaces: 1 },
  { id: "8", name: "Ryan Park", email: "ryan@contentlabs.dev", plan: "Agency", status: "active", joined: "Mar 20, 2026", accounts: 31, workspaces: 18 },
  { id: "9", name: "Isabelle Moore", email: "isabelle@viral.media", plan: "Free", status: "active", joined: "Mar 15, 2026", accounts: 1, workspaces: 1 },
  { id: "10", name: "Carlos Ruiz", email: "carlos@socialdrive.mx", plan: "Starter", status: "active", joined: "Mar 10, 2026", accounts: 6, workspaces: 2 },
];

const planColors: Record<string, string> = {
  Free: "bg-slate-800 text-slate-300",
  Starter: "bg-blue-900/50 text-blue-300",
  Pro: "bg-violet-900/50 text-violet-300",
  Agency: "bg-amber-900/50 text-amber-300",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-900/40 text-emerald-400",
  suspended: "bg-red-900/40 text-red-400",
  trialing: "bg-blue-900/40 text-blue-400",
};

export default function AdminUsersPage() {
  const [search, setSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");

  const filtered = allUsers.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || u.plan.toLowerCase() === planFilter;
    return matchSearch && matchPlan;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Users</h2>
          <p className="text-sm text-slate-400">{allUsers.length} total users</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
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
          <div className="col-span-2 hidden lg:block">Accounts</div>
          <div className="col-span-2 lg:col-span-0">Actions</div>
        </div>

        <div className="divide-y divide-slate-800">
          {filtered.map((u) => (
            <div key={u.id} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-800/40 transition-colors">
              <div className="col-span-6 sm:col-span-4 flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {u.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
              </div>
              <div className="col-span-2 hidden sm:block">
                <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", planColors[u.plan])}>{u.plan}</span>
              </div>
              <div className="col-span-2 hidden md:block">
                <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize", statusColors[u.status])}>{u.status}</span>
              </div>
              <div className="col-span-2 hidden lg:block text-sm text-slate-400">{u.joined}</div>
              <div className="col-span-2 hidden lg:block text-sm text-slate-400">{u.accounts} accounts</div>
              <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-1">
                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="View">
                  <Eye className="h-4 w-4" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors" title="Suspend">
                  <ShieldOff className="h-4 w-4" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-slate-500">No users match your search.</div>
        )}

        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">Showing {filtered.length} of {allUsers.length} users</p>
          <div className="flex items-center gap-2">
            <button className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">Previous</button>
            <button className="text-xs text-white bg-violet-600 px-3 py-1.5 rounded-lg">1</button>
            <button className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
