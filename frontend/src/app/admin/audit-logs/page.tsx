"use client";

import * as React from "react";
import { Search, Download, Filter, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type ActionType =
  | "user.login" | "user.logout"
  | "post.created" | "post.published" | "post.deleted"
  | "account.connected" | "account.disconnected"
  | "billing.upgraded" | "billing.canceled"
  | "workspace.created"
  | "api_key.created" | "api_key.deleted";

interface LogEntry {
  id: string;
  timestamp: string;
  user: { email: string; initials: string };
  action: ActionType;
  resourceType: string;
  resourceId: string;
  ip: string;
  userAgent: string;
}

const logs: LogEntry[] = [
  { id: "log_001", timestamp: "Today 09:47:12", user: { email: "sarah@acme.com", initials: "SA" }, action: "post.published", resourceType: "Post", resourceId: "post_xk92mN3p", ip: "104.21.34.12", userAgent: "Mozilla/5.0 (Mac; Chrome/124)" },
  { id: "log_002", timestamp: "Today 09:44:03", user: { email: "james@startupxyz.io", initials: "JX" }, action: "account.connected", resourceType: "SocialAccount", resourceId: "acc_ig_3pqrLm", ip: "185.60.22.9", userAgent: "Mozilla/5.0 (Win; Chrome/124)" },
  { id: "log_003", timestamp: "Today 09:41:55", user: { email: "priya@brandco.com", initials: "PB" }, action: "api_key.created", resourceType: "ApiKey", resourceId: "key_v2_9Xmk7", ip: "88.198.45.7", userAgent: "PostmanRuntime/7.37" },
  { id: "log_004", timestamp: "Today 09:38:20", user: { email: "admin@socialforge.io", initials: "AD" }, action: "billing.upgraded", resourceType: "Subscription", resourceId: "sub_pro_mL4q", ip: "198.41.128.1", userAgent: "Mozilla/5.0 (Mac; Safari/17)" },
  { id: "log_005", timestamp: "Today 09:35:14", user: { email: "tom@creativeagency.net", initials: "TC" }, action: "post.created", resourceType: "Post", resourceId: "post_mN8qRt2x", ip: "77.111.45.99", userAgent: "Mozilla/5.0 (Win; Firefox/125)" },
  { id: "log_006", timestamp: "Today 09:31:08", user: { email: "lisa@fashionbrand.co", initials: "LF" }, action: "user.login", resourceType: "User", resourceId: "user_lF9x3wQ", ip: "213.180.202.4", userAgent: "Mozilla/5.0 (iPhone; Safari/17)" },
  { id: "log_007", timestamp: "Today 09:28:45", user: { email: "dev@techstartup.io", initials: "DT" }, action: "workspace.created", resourceType: "Workspace", resourceId: "ws_tK3pNm7q", ip: "54.23.111.20", userAgent: "Mozilla/5.0 (Linux; Chrome/124)" },
  { id: "log_008", timestamp: "Today 09:22:37", user: { email: "sarah@acme.com", initials: "SA" }, action: "account.disconnected", resourceType: "SocialAccount", resourceId: "acc_tw_xP2mK", ip: "104.21.34.12", userAgent: "Mozilla/5.0 (Mac; Chrome/124)" },
  { id: "log_009", timestamp: "Today 09:19:11", user: { email: "marketing@megacorp.com", initials: "MM" }, action: "billing.canceled", resourceType: "Subscription", resourceId: "sub_agt_9kLm", ip: "162.158.92.14", userAgent: "Mozilla/5.0 (Win; Chrome/123)" },
  { id: "log_010", timestamp: "Today 09:14:58", user: { email: "priya@brandco.com", initials: "PB" }, action: "post.deleted", resourceType: "Post", resourceId: "post_dEl3xPp1", ip: "88.198.45.7", userAgent: "Mozilla/5.0 (Mac; Chrome/124)" },
  { id: "log_011", timestamp: "Today 09:11:34", user: { email: "james@startupxyz.io", initials: "JX" }, action: "api_key.deleted", resourceType: "ApiKey", resourceId: "key_v1_oldK2", ip: "185.60.22.9", userAgent: "Mozilla/5.0 (Win; Chrome/124)" },
  { id: "log_012", timestamp: "Today 09:08:02", user: { email: "tom@creativeagency.net", initials: "TC" }, action: "user.login", resourceType: "User", resourceId: "user_tC7nMx4", ip: "77.111.45.99", userAgent: "Mozilla/5.0 (Win; Firefox/125)" },
  { id: "log_013", timestamp: "Today 08:59:44", user: { email: "lisa@fashionbrand.co", initials: "LF" }, action: "post.published", resourceType: "Post", resourceId: "post_pUb8mNq3", ip: "213.180.202.4", userAgent: "Mozilla/5.0 (iPhone; Safari/17)" },
  { id: "log_014", timestamp: "Today 08:52:19", user: { email: "admin@socialforge.io", initials: "AD" }, action: "workspace.created", resourceType: "Workspace", resourceId: "ws_nW5pKq2r", ip: "198.41.128.1", userAgent: "Mozilla/5.0 (Mac; Safari/17)" },
  { id: "log_015", timestamp: "Today 08:47:05", user: { email: "dev@techstartup.io", initials: "DT" }, action: "account.connected", resourceType: "SocialAccount", resourceId: "acc_yt_9xNmP", ip: "54.23.111.20", userAgent: "Mozilla/5.0 (Linux; Chrome/124)" },
  { id: "log_016", timestamp: "Today 08:41:33", user: { email: "marketing@megacorp.com", initials: "MM" }, action: "billing.upgraded", resourceType: "Subscription", resourceId: "sub_agt_newX", ip: "162.158.92.14", userAgent: "Mozilla/5.0 (Win; Chrome/123)" },
  { id: "log_017", timestamp: "Today 08:35:21", user: { email: "sarah@acme.com", initials: "SA" }, action: "user.logout", resourceType: "User", resourceId: "user_sA4kNp1", ip: "104.21.34.12", userAgent: "Mozilla/5.0 (Mac; Chrome/124)" },
  { id: "log_018", timestamp: "Today 08:29:08", user: { email: "priya@brandco.com", initials: "PB" }, action: "post.created", resourceType: "Post", resourceId: "post_cRt7pNm2", ip: "88.198.45.7", userAgent: "Mozilla/5.0 (Mac; Chrome/124)" },
  { id: "log_019", timestamp: "Today 08:22:47", user: { email: "james@startupxyz.io", initials: "JX" }, action: "api_key.created", resourceType: "ApiKey", resourceId: "key_v3_nX8qK", ip: "185.60.22.9", userAgent: "PostmanRuntime/7.37" },
  { id: "log_020", timestamp: "Today 08:14:12", user: { email: "tom@creativeagency.net", initials: "TC" }, action: "account.connected", resourceType: "SocialAccount", resourceId: "acc_li_mPq3X", ip: "77.111.45.99", userAgent: "Mozilla/5.0 (Win; Firefox/125)" },
];

const actionColors: Record<ActionType, string> = {
  "user.login": "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  "user.logout": "bg-slate-800 text-slate-400 border-slate-700",
  "post.created": "bg-violet-900/50 text-violet-300 border-violet-800/60",
  "post.published": "bg-blue-900/50 text-blue-300 border-blue-800/60",
  "post.deleted": "bg-red-900/50 text-red-300 border-red-800/60",
  "account.connected": "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  "account.disconnected": "bg-amber-900/50 text-amber-300 border-amber-800/60",
  "billing.upgraded": "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  "billing.canceled": "bg-red-900/50 text-red-300 border-red-800/60",
  "workspace.created": "bg-violet-900/50 text-violet-300 border-violet-800/60",
  "api_key.created": "bg-blue-900/50 text-blue-300 border-blue-800/60",
  "api_key.deleted": "bg-red-900/50 text-red-300 border-red-800/60",
};

const actionTypes: ActionType[] = [
  "user.login", "user.logout", "post.created", "post.published", "post.deleted",
  "account.connected", "account.disconnected", "billing.upgraded", "billing.canceled",
  "workspace.created", "api_key.created", "api_key.deleted",
];

export default function AuditLogsPage() {
  const [search, setSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.user.email.toLowerCase().includes(q) || l.action.includes(q) || l.resourceId.includes(q);
    const matchAction = actionFilter === "all" || l.action === actionFilter;
    return matchSearch && matchAction;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Audit Logs</h2>
          <p className="text-slate-400 text-sm mt-1">Security and activity log for all user actions.</p>
        </div>
        <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-sm px-4 py-2 rounded-lg transition-colors">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by user, action, resource..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
          >
            <option value="all">All Actions</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-violet-600"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-violet-600"
          placeholder="To"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800">
          <Shield className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Col headers */}
        <div className="grid grid-cols-[1.4fr_1.8fr_1.6fr_1fr_1.2fr_1fr_1.4fr] gap-3 px-5 py-2.5 border-b border-slate-800">
          {["Timestamp", "User", "Action", "Resource Type", "Resource ID", "IP Address", "User Agent"].map((h) => (
            <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {filtered.map((log) => (
          <div
            key={log.id}
            className="grid grid-cols-[1.4fr_1.8fr_1.6fr_1fr_1.2fr_1fr_1.4fr] gap-3 px-5 py-3 items-center border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
          >
            <span className="text-xs font-mono text-slate-400">{log.timestamp}</span>

            <div className="flex items-center gap-2 min-w-0">
              <div className="h-6 w-6 rounded-full bg-violet-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {log.user.initials}
              </div>
              <span className="text-xs text-slate-300 truncate">{log.user.email}</span>
            </div>

            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border w-fit", actionColors[log.action])}>
              {log.action}
            </span>

            <span className="text-xs text-slate-400">{log.resourceType}</span>
            <span className="text-xs font-mono text-slate-500 truncate">{log.resourceId.slice(0, 14)}…</span>
            <span className="text-xs font-mono text-slate-500">{log.ip}</span>
            <span className="text-xs text-slate-600 truncate">{log.userAgent.slice(0, 22)}…</span>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-500 text-sm">No log entries match your filters.</div>
        )}
      </div>
    </div>
  );
}
