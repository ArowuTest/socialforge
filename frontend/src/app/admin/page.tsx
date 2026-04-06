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

const stats = [
  { label: "Total Users", value: "2,847", trend: "+124 this month", icon: Users, color: "blue" },
  { label: "Active Workspaces", value: "1,203", trend: "+89 this month", icon: Building2, color: "violet" },
  { label: "MRR", value: "$38,420", trend: "+12.4% vs last month", icon: DollarSign, color: "emerald" },
  { label: "Active Subscriptions", value: "984", trend: "76 trialing", icon: CreditCard, color: "amber" },
];

const revenueData = Array.from({ length: 30 }, (_, i) => ({
  day: `Apr ${i + 1}`,
  mrr: Math.round(35000 + Math.random() * 8000 + i * 120),
}));

const recentUsers = [
  { name: "Alice Johnson", email: "alice@brandlift.io", plan: "Pro", joined: "Apr 6, 2026" },
  { name: "Marcus Chen", email: "marcus@mediaflow.co", plan: "Agency", joined: "Apr 5, 2026" },
  { name: "Priya Mehta", email: "priya@contentx.io", plan: "Starter", joined: "Apr 5, 2026" },
  { name: "Jordan Williams", email: "jordan@viralco.com", plan: "Free", joined: "Apr 4, 2026" },
  { name: "Sophie Laurent", email: "sophie@agencypro.fr", plan: "Pro", joined: "Apr 4, 2026" },
];

const planColors: Record<string, string> = {
  Free: "bg-gray-800 text-gray-300",
  Starter: "bg-blue-900/50 text-blue-300",
  Pro: "bg-violet-900/50 text-violet-300",
  Agency: "bg-amber-900/50 text-amber-300",
};

const colorMap: Record<string, string> = {
  blue: "bg-blue-900/30 text-blue-400",
  violet: "bg-violet-900/30 text-violet-400",
  emerald: "bg-emerald-900/30 text-emerald-400",
  amber: "bg-amber-900/30 text-amber-400",
};

const health = [
  { label: "Database", status: "healthy", icon: Database },
  { label: "Redis Cache", status: "healthy", icon: Server },
  { label: "Job Queue", status: "healthy", icon: Zap },
  { label: "Storage", status: "healthy", icon: HardDrive },
];

export default function AdminOverviewPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
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
        {/* Revenue chart */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white">Monthly Recurring Revenue</h3>
              <p className="text-sm text-slate-400 mt-0.5">Last 30 days</p>
            </div>
            <span className="text-emerald-400 text-sm font-semibold">+12.4%</span>
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

          {/* Uptime stat */}
          <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-xl">
            <p className="text-xs text-emerald-400 font-medium">System uptime</p>
            <p className="text-2xl font-bold text-white mt-1">99.98%</p>
            <p className="text-xs text-slate-400">Last 30 days</p>
          </div>
        </div>
      </div>

      {/* Recent signups */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-white text-sm">Recent Signups</h3>
          <a href="/admin/users" className="text-xs text-violet-400 hover:underline font-medium">View all users</a>
        </div>
        <div className="divide-y divide-slate-800">
          {recentUsers.map((u) => (
            <div key={u.email} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/50 transition-colors">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {u.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.name}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
              </div>
              <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", planColors[u.plan])}>{u.plan}</span>
              <span className="text-xs text-slate-500 flex-shrink-0 hidden sm:block">{u.joined}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
