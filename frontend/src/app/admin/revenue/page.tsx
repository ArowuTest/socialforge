"use client";

import * as React from "react";
import { TrendingUp, DollarSign, Users, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { adminApi } from "@/lib/api";

interface PlanBreakdown {
  plan: string;
  user_count: number;
  unit_price_usd: number;
  mrr_usd: number;
}

const planColors: Record<string, string> = {
  starter: "#3b82f6",
  pro: "#7c3aed",
  agency: "#10b981",
};

const planLabels: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
};

const tooltipStyle = {
  contentStyle: { backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#f1f5f9", fontSize: 12 },
  cursor: { fill: "#1e293b" },
};

function StatSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-24 bg-slate-800 rounded" />
        <div className="h-8 w-8 bg-slate-800 rounded-lg" />
      </div>
      <div className="h-8 w-28 bg-slate-800 rounded mb-1" />
    </div>
  );
}

export default function RevenuePage() {
  const [breakdown, setBreakdown] = React.useState<PlanBreakdown[]>([]);
  const [totalMrr, setTotalMrr] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    adminApi.getRevenue()
      .then((res) => {
        if (!cancelled) {
          const raw = res as unknown as { breakdown: PlanBreakdown[]; total_mrr: number };
          setBreakdown(raw.breakdown ?? []);
          setTotalMrr(raw.total_mrr ?? 0);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load revenue data");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const arr = totalMrr * 12;
  const totalUsers = breakdown.reduce((sum, b) => sum + b.user_count, 0);
  const arpu = totalUsers > 0 ? (totalMrr / totalUsers) : 0;

  const pieData = breakdown
    .filter((b) => b.plan !== "free" && b.mrr_usd > 0)
    .map((b) => ({
      name: planLabels[b.plan] ?? b.plan,
      value: b.mrr_usd,
      color: planColors[b.plan] ?? "#64748b",
    }));

  const barData = breakdown
    .filter((b) => b.plan !== "free")
    .map((b) => ({
      plan: planLabels[b.plan] ?? b.plan,
      users: b.user_count,
      mrr: b.mrr_usd,
    }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Revenue Analytics</h2>
        <p className="text-slate-400 text-sm mt-1">Live MRR breakdown by plan. Historical analytics coming soon.</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : [
              { label: "Monthly Recurring Revenue", value: `$${totalMrr.toLocaleString()}`, icon: TrendingUp, color: "text-violet-400", iconBg: "bg-violet-900/40" },
              { label: "Annual Run Rate", value: `$${arr.toLocaleString()}`, icon: ArrowUpRight, color: "text-blue-400", iconBg: "bg-blue-900/40" },
              { label: "Paying Users", value: totalUsers.toLocaleString(), icon: Users, color: "text-emerald-400", iconBg: "bg-emerald-900/40" },
              { label: "Avg Revenue / User", value: `$${arpu.toFixed(2)}`, icon: DollarSign, color: "text-amber-400", iconBg: "bg-amber-900/40" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", s.iconBg)}>
                    <s.icon className={cn("h-4 w-4", s.color)} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
              </div>
            ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* MRR by plan - bar chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">MRR by Plan</h3>
          {loading ? (
            <div className="h-52 bg-slate-800/50 rounded-lg animate-pulse" />
          ) : barData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-500 text-sm">No paid subscribers yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="plan" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle}
                  formatter={(v: number, name: string) => [`$${v.toLocaleString()}`, name === "mrr" ? "MRR" : "Users"]}
                />
                <Bar dataKey="mrr" name="MRR" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by plan - pie chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Revenue Share by Plan</h3>
          {loading ? (
            <div className="h-40 bg-slate-800/50 rounded-lg animate-pulse mb-2" />
          ) : pieData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-500 text-sm">No paid revenue yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle.contentStyle} formatter={(v: number) => [`$${v.toLocaleString()}`, "MRR"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {!loading && pieData.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {pieData.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-slate-400">{p.name}</span>
                  </div>
                  <span className="text-white font-medium">${p.value.toLocaleString()}/mo</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subscription breakdown table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Plan Breakdown</h3>
          <p className="text-xs text-slate-500 mt-0.5">Active paid subscriptions contributing to MRR</p>
        </div>
        <div className="grid grid-cols-4 gap-4 px-5 py-2.5 border-b border-slate-800">
          {["Plan", "Subscribers", "Price/mo", "MRR"].map((h) => (
            <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
          ))}
        </div>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-slate-800/60 animate-pulse">
                {[80, 60, 70, 90].map((w, j) => (
                  <div key={j} className="h-4 bg-slate-800 rounded" style={{ width: `${w}px` }} />
                ))}
              </div>
            ))
          : breakdown.length === 0
          ? <div className="py-8 text-center text-slate-500 text-sm">No data available</div>
          : breakdown.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-4 gap-4 px-5 py-3 items-center border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
              >
                <span className="text-sm text-white font-medium capitalize">{row.plan}</span>
                <span className="text-sm text-slate-300">{row.user_count.toLocaleString()}</span>
                <span className="text-sm text-slate-300">${row.unit_price_usd}/mo</span>
                <span className="text-sm text-violet-400 font-semibold">${row.mrr_usd.toLocaleString()}</span>
              </div>
            ))}
        {!loading && breakdown.length > 0 && (
          <div className="grid grid-cols-4 gap-4 px-5 py-3 bg-slate-800/30 border-t border-slate-800">
            <span className="text-sm font-bold text-white">Total</span>
            <span className="text-sm font-semibold text-white">{breakdown.reduce((s, b) => s + b.user_count, 0).toLocaleString()}</span>
            <span />
            <span className="text-sm font-bold text-violet-400">${totalMrr.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
