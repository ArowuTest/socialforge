"use client";

import * as React from "react";
import { Search, Eye, Settings, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const workspaces = [
  { id: "1", name: "BrandLift Agency", owner: "Alice Johnson", plan: "Pro", members: 8, accounts: 24, created: "Jan 12, 2026", status: "active" },
  { id: "2", name: "MediaFlow Studio", owner: "Marcus Chen", plan: "Agency", members: 15, accounts: 48, created: "Feb 3, 2026", status: "active" },
  { id: "3", name: "ContentX Creative", owner: "Priya Mehta", plan: "Starter", members: 3, accounts: 10, created: "Mar 1, 2026", status: "active" },
  { id: "4", name: "ViralCo", owner: "Jordan Williams", plan: "Free", members: 1, accounts: 2, created: "Apr 4, 2026", status: "active" },
  { id: "5", name: "Agency Pro Paris", owner: "Sophie Laurent", plan: "Pro", members: 6, accounts: 18, created: "Mar 15, 2026", status: "active" },
  { id: "6", name: "GrowthStack Labs", owner: "David Kim", plan: "Pro", members: 4, accounts: 12, created: "Feb 20, 2026", status: "suspended" },
  { id: "7", name: "MediaPlus Co", owner: "Emma Torres", plan: "Starter", members: 2, accounts: 6, created: "Mar 25, 2026", status: "active" },
  { id: "8", name: "ContentLabs Dev", owner: "Ryan Park", plan: "Agency", members: 22, accounts: 64, created: "Jan 8, 2026", status: "active" },
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
};

export default function AdminWorkspacesPage() {
  const [search, setSearch] = React.useState("");

  const filtered = workspaces.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.owner.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Workspaces</h2>
          <p className="text-sm text-slate-400">{workspaces.length} total workspaces</p>
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 border-b border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div className="col-span-4">Workspace</div>
          <div className="col-span-2 hidden sm:block">Plan</div>
          <div className="col-span-2 hidden md:block">Members</div>
          <div className="col-span-2 hidden lg:block">Accounts</div>
          <div className="col-span-2 hidden lg:block">Status</div>
          <div className="col-span-2">Actions</div>
        </div>

        <div className="divide-y divide-slate-800">
          {filtered.map((w) => (
            <div key={w.id} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-800/40 transition-colors">
              <div className="col-span-6 sm:col-span-4 flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {w.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{w.name}</p>
                  <p className="text-xs text-slate-400">{w.owner}</p>
                </div>
              </div>
              <div className="col-span-2 hidden sm:block">
                <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", planColors[w.plan])}>{w.plan}</span>
              </div>
              <div className="col-span-2 hidden md:block text-sm text-slate-400">{w.members} members</div>
              <div className="col-span-2 hidden lg:block text-sm text-slate-400">{w.accounts} accounts</div>
              <div className="col-span-2 hidden lg:block">
                <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize", statusColors[w.status])}>{w.status}</span>
              </div>
              <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-1">
                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"><Eye className="h-4 w-4" /></button>
                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-violet-400 transition-colors"><Settings className="h-4 w-4" /></button>
                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">Showing {filtered.length} of {workspaces.length}</p>
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
