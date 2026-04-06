"use client";

import * as React from "react";
import { DollarSign, TrendingUp, TrendingDown, Users, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const summaryStats = [
  { label: "MRR", value: "$38,420", trend: "+12.4%", up: true, icon: DollarSign },
  { label: "New this month", value: "124", trend: "+18% vs last", up: true, icon: TrendingUp },
  { label: "Churned this month", value: "17", trend: "-3 vs last month", up: false, icon: TrendingDown },
  { label: "Trial conversions", value: "68%", trend: "+4% vs last month", up: true, icon: Users },
];

const subscriptions = [
  { id: "1", user: "Marcus Chen", email: "marcus@mediaflow.co", plan: "Agency", status: "active", amount: "$199/mo", nextBilling: "May 5, 2026" },
  { id: "2", user: "Ryan Park", email: "ryan@contentlabs.dev", plan: "Agency", status: "active", amount: "$199/mo", nextBilling: "May 8, 2026" },
  { id: "3", user: "Alice Johnson", email: "alice@brandlift.io", plan: "Pro", status: "active", amount: "$79/mo", nextBilling: "May 6, 2026" },
  { id: "4", user: "Sophie Laurent", email: "sophie@agencypro.fr", plan: "Pro", status: "active", amount: "$79/mo", nextBilling: "May 15, 2026" },
  { id: "5", user: "Emma Torres", email: "emma@mediaplus.co", plan: "Starter", status: "trialing", amount: "$29/mo", nextBilling: "Apr 25, 2026" },
  { id: "6", user: "Carlos Ruiz", email: "carlos@socialdrive.mx", plan: "Starter", status: "active", amount: "$29/mo", nextBilling: "May 10, 2026" },
  { id: "7", user: "David Kim", email: "david@growthstack.io", plan: "Pro", status: "past_due", amount: "$79/mo", nextBilling: "Apr 6, 2026" },
  { id: "8", user: "Isabelle Moore", email: "isabelle@viral.media", plan: "Starter", status: "canceled", amount: "$0", nextBilling: "—" },
];

const planColors: Record<string, string> = {
  Starter: "bg-blue-900/50 text-blue-300",
  Pro: "bg-violet-900/50 text-violet-300",
  Agency: "bg-amber-900/50 text-amber-300",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-900/40 text-emerald-400",
  trialing: "bg-blue-900/40 text-blue-400",
  past_due: "bg-red-900/40 text-red-400",
  canceled: "bg-slate-800 text-slate-400",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past Due",
  canceled: "Canceled",
};

export default function AdminSubscriptionsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryStats.map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-violet-900/30 flex items-center justify-center">
                <s.icon className="h-4 w-4 text-violet-400" />
              </div>
              <span className={cn("text-xs font-semibold", s.up ? "text-emerald-400" : "text-red-400")}>{s.trend}</span>
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-sm text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-white text-sm">All Subscriptions</h3>
        </div>

        <div className="grid grid-cols-12 px-5 py-3 border-b border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div className="col-span-4">User</div>
          <div className="col-span-2 hidden sm:block">Plan</div>
          <div className="col-span-2 hidden md:block">Status</div>
          <div className="col-span-2 hidden lg:block">Amount</div>
          <div className="col-span-2 hidden lg:block">Next Billing</div>
          <div className="col-span-2">Actions</div>
        </div>

        <div className="divide-y divide-slate-800">
          {subscriptions.map((s) => (
            <div key={s.id} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-slate-800/40 transition-colors">
              <div className="col-span-6 sm:col-span-4 flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {s.user[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{s.user}</p>
                  <p className="text-xs text-slate-400 truncate">{s.email}</p>
                </div>
              </div>
              <div className="col-span-2 hidden sm:block">
                <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", planColors[s.plan])}>{s.plan}</span>
              </div>
              <div className="col-span-2 hidden md:block">
                <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full", statusColors[s.status])}>{statusLabels[s.status]}</span>
              </div>
              <div className="col-span-2 hidden lg:block text-sm text-slate-300 font-medium">{s.amount}</div>
              <div className="col-span-2 hidden lg:block text-sm text-slate-400">{s.nextBilling}</div>
              <div className="col-span-6 sm:col-span-2 flex items-center justify-end">
                <button className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Portal
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-800">
          <p className="text-xs text-slate-500">Showing {subscriptions.length} subscriptions</p>
        </div>
      </div>
    </div>
  );
}
