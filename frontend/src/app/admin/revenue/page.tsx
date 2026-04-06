"use client";

import * as React from "react";
import { TrendingUp, DollarSign, Users, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const mrrData = [
  { month: "May", mrr: 22100 },
  { month: "Jun", mrr: 24500 },
  { month: "Jul", mrr: 25800 },
  { month: "Aug", mrr: 27200 },
  { month: "Sep", mrr: 28900 },
  { month: "Oct", mrr: 29700 },
  { month: "Nov", mrr: 31200 },
  { month: "Dec", mrr: 32100 },
  { month: "Jan", mrr: 33800 },
  { month: "Feb", mrr: 35400 },
  { month: "Mar", mrr: 37100 },
  { month: "Apr", mrr: 38420 },
];

const planData = [
  { name: "Starter", value: 28, color: "#3b82f6" },
  { name: "Pro", value: 45, color: "#7c3aed" },
  { name: "Agency", value: 27, color: "#10b981" },
];

const netMrrData = [
  { month: "Nov", new: 4100, churned: 2100 },
  { month: "Dec", new: 3800, churned: 1900 },
  { month: "Jan", new: 5200, churned: 2300 },
  { month: "Feb", new: 4900, churned: 2100 },
  { month: "Mar", new: 5600, churned: 2200 },
  { month: "Apr", new: 4800, churned: 1800 },
];

const cohortRows = [
  { month: "Nov 2025", newSubs: 82, churned: 11, netNew: 71, mrrAdded: "$2,982" },
  { month: "Dec 2025", newSubs: 75, churned: 9, netNew: 66, mrrAdded: "$2,574" },
  { month: "Jan 2026", newSubs: 108, churned: 14, netNew: 94, mrrAdded: "$3,673" },
  { month: "Feb 2026", newSubs: 101, churned: 12, netNew: 89, mrrAdded: "$3,479" },
  { month: "Mar 2026", newSubs: 119, churned: 13, netNew: 106, mrrAdded: "$4,134" },
  { month: "Apr 2026", newSubs: 97, churned: 11, netNew: 86, mrrAdded: "$3,354" },
];

const tooltipStyle = {
  contentStyle: { backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#f1f5f9", fontSize: 12 },
  cursor: { fill: "#1e293b" },
};

export default function RevenuePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Revenue Analytics</h2>
        <p className="text-slate-400 text-sm mt-1">Monthly recurring revenue, plan distribution, and growth metrics.</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "MRR", value: "$38,420", delta: "+12.4%", icon: TrendingUp, color: "text-violet-400", iconBg: "bg-violet-900/40" },
          { label: "ARR", value: "$461,040", delta: "+12.4%", icon: TrendingUp, color: "text-blue-400", iconBg: "bg-blue-900/40" },
          { label: "Total Revenue (All Time)", value: "$284,150", delta: null, icon: DollarSign, color: "text-emerald-400", iconBg: "bg-emerald-900/40" },
          { label: "Avg Revenue Per User", value: "$39.10", delta: null, icon: Users, color: "text-amber-400", iconBg: "bg-amber-900/40" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500">{s.label}</span>
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", s.iconBg)}>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            {s.delta && (
              <p className="text-xs text-emerald-400 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="h-3 w-3" /> {s.delta} vs last month
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* MRR Growth */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">MRR Growth — Last 12 Months</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={mrrData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                formatter={(v: number) => [`$${v.toLocaleString()}`, "MRR"]}
              />
              <Line type="monotone" dataKey="mrr" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by plan */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Revenue by Plan</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={planData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                {planData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle.contentStyle} formatter={(v: number) => [`${v}%`, "Share"]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {planData.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-slate-400">{p.name}</span>
                </div>
                <span className="text-white font-medium">{p.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New vs Churned MRR */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">New vs Churned MRR — Last 6 Months</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={netMrrData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
            <Tooltip
              contentStyle={tooltipStyle.contentStyle}
              formatter={(v: number) => [`$${v.toLocaleString()}`]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
            <Bar dataKey="new" name="New MRR" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="churned" name="Churned MRR" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cohort table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Monthly Cohort Summary</h3>
        </div>
        <div className="grid grid-cols-5 gap-4 px-5 py-2.5 border-b border-slate-800">
          {["Month", "New Subs", "Churned", "Net New", "MRR Added"].map((h) => (
            <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
          ))}
        </div>
        {cohortRows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 px-5 py-3 items-center border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
          >
            <span className="text-sm text-white font-medium">{row.month}</span>
            <span className="text-sm text-emerald-400 font-semibold">+{row.newSubs}</span>
            <span className="text-sm text-red-400 font-semibold">-{row.churned}</span>
            <span className="text-sm text-white font-semibold">{row.netNew}</span>
            <span className="text-sm text-violet-400 font-semibold">{row.mrrAdded}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
