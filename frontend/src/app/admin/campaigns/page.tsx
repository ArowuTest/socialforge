"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot, Search, RefreshCw, Pause, X, Eye,
  ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi, AdminCampaign } from "@/lib/api";
import { toast } from "sonner";

// TODO: GET /api/v1/admin/campaigns — backend endpoint must be implemented.
// The adminApi.listAllCampaigns() call is ready; wire it up once the route is live.

type CampaignStatus = AdminCampaign["status"];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "generating", label: "Generating" },
  { value: "review", label: "Review" },
  { value: "running", label: "Running" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

function statusColor(status: CampaignStatus) {
  switch (status) {
    case "running":    return "bg-emerald-900/40 text-emerald-300 border-emerald-800/60";
    case "generating": return "bg-blue-900/40 text-blue-300 border-blue-800/60";
    case "review":     return "bg-amber-900/40 text-amber-300 border-amber-800/60";
    case "paused":     return "bg-slate-800 text-slate-400 border-slate-700";
    case "completed":  return "bg-violet-900/40 text-violet-300 border-violet-800/60";
    case "failed":     return "bg-red-900/40 text-red-300 border-red-800/60";
    case "draft":      return "bg-slate-800/60 text-slate-400 border-slate-700";
    default:           return "bg-slate-800/60 text-slate-400 border-slate-700";
  }
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", color)}>{value.toLocaleString()}</p>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{value}/{max}</span>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
        <p className="text-xs text-slate-400 mb-5">{description}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "px-4 py-2 text-sm text-white rounded-lg transition-colors",
              danger ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = React.useState<AdminCampaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [confirmPause, setConfirmPause] = React.useState<AdminCampaign | null>(null);
  const [pausingId, setPausingId] = React.useState<string | null>(null);

  // Derived stats from current loaded data (rough counts, API will provide real ones)
  const stats = React.useMemo(() => ({
    total,
    running: campaigns.filter((c) => c.status === "running").length,
    review: campaigns.filter((c) => c.status === "review").length,
    failed: campaigns.filter((c) => c.status === "failed").length,
  }), [campaigns, total]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listAllCampaigns({
        status: statusFilter || undefined,
        page,
        search: search || undefined,
      });
      setCampaigns(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
      setTotalPages(res.meta?.total_pages ?? 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load campaigns";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, search]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleForcePause = async (campaign: AdminCampaign) => {
    setPausingId(campaign.id);
    setConfirmPause(null);
    try {
      await adminApi.forcePauseCampaign(campaign.id);
      setCampaigns((prev) =>
        prev.map((c) => c.id === campaign.id ? { ...c, status: "paused" } : c)
      );
      toast.success(`Campaign "${campaign.name}" paused`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to pause campaign";
      toast.error(msg);
    } finally {
      setPausingId(null);
    }
  };

  const inputClass = "px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-400" />
            Campaign Monitor
          </h2>
          <p className="text-slate-400 text-sm mt-1">All AI Autopilot campaigns across all workspaces</p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Campaigns" value={total} color="text-white" />
        <StatCard label="Currently Running" value={stats.running} color="text-emerald-400" />
        <StatCard label="Awaiting Review" value={stats.review} color="text-amber-400" />
        <StatCard label="Failed" value={stats.failed} color="text-red-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                statusFilter === f.value
                  ? "bg-violet-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search workspace or campaign..."
            className={cn(inputClass, "pl-9 w-full")}
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 text-xs text-slate-400">
                <th className="text-left px-4 py-3 font-medium">Campaign</th>
                <th className="text-left px-4 py-3 font-medium">Workspace</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Goal</th>
                <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">Duration</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Platforms</th>
                <th className="text-left px-4 py-3 font-medium">Progress</th>
                <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">Credits</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && campaigns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500 text-sm">
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Loading campaigns...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <Bot className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">No campaigns found</p>
                    {(statusFilter || search) && (
                      <button
                        onClick={() => { setStatusFilter(""); setSearch(""); setPage(1); }}
                        className="text-xs text-violet-400 hover:text-violet-300 mt-1"
                      >
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                    {/* Campaign Name */}
                    <td className="px-4 py-3">
                      <p className="text-white font-medium truncate max-w-[160px]">{c.name}</p>
                      <p className="text-xs text-slate-500 font-mono truncate">{c.id.slice(0, 8)}…</p>
                    </td>

                    {/* Workspace */}
                    <td className="px-4 py-3">
                      <p className="text-slate-300 text-sm truncate max-w-[120px]">{c.workspace_name || "—"}</p>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium border",
                        statusColor(c.status)
                      )}>
                        {c.status}
                      </span>
                    </td>

                    {/* Goal */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-slate-400 text-xs capitalize">{c.goal || "—"}</span>
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <p className="text-xs text-slate-400 whitespace-nowrap">
                        {c.start_date ? new Date(c.start_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                        {" → "}
                        {c.end_date ? new Date(c.end_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                      </p>
                    </td>

                    {/* Platforms */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {c.platforms.slice(0, 3).map((p) => (
                          <span key={p} className="px-1.5 py-0.5 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700 capitalize">
                            {p}
                          </span>
                        ))}
                        {c.platforms.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-slate-800 text-slate-500">
                            +{c.platforms.length - 3}
                          </span>
                        )}
                        {c.platforms.length === 0 && <span className="text-slate-600 text-xs">—</span>}
                      </div>
                    </td>

                    {/* Progress */}
                    <td className="px-4 py-3 min-w-[120px]">
                      <ProgressBar value={c.posts_published} max={c.total_posts} />
                    </td>

                    {/* Credits */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <p className="text-xs text-slate-400 tabular-nums">
                        {c.credits_used}<span className="text-slate-600">/{c.credits_estimated}</span>
                      </p>
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-xs text-slate-500">
                        {new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                      </p>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Link
                          href={`/admin/campaigns/${c.id}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
                        >
                          <Eye className="h-3 w-3" /> View
                        </Link>
                        {(c.status === "running" || c.status === "generating") && (
                          <button
                            onClick={() => setConfirmPause(c)}
                            disabled={pausingId === c.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-800/40 hover:border-amber-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {pausingId === c.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Pause className="h-3 w-3" />
                            )}
                            Pause
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} — {total.toLocaleString()} total
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Force Pause Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmPause}
        title="Force Pause Campaign"
        description={`Are you sure you want to force-pause "${confirmPause?.name}"? This will halt all scheduled publishing for this campaign.`}
        confirmLabel="Force Pause"
        onConfirm={() => confirmPause && handleForcePause(confirmPause)}
        onCancel={() => setConfirmPause(null)}
        danger
      />
    </div>
  );
}
