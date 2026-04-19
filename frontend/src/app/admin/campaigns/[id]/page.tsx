"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Bot, Pause, X, Flag, RefreshCw,
  ChevronDown, ChevronUp, Building2, User, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi, AdminCampaign } from "@/lib/api";
import { CampaignPost } from "@/types";
import { toast } from "sonner";

// TODO: GET /api/v1/admin/campaigns/:id — backend endpoint must be implemented.

function statusColor(status: string) {
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

function postStatusColor(status: string) {
  switch (status) {
    case "published":   return "bg-emerald-900/40 text-emerald-300";
    case "approved":    return "bg-blue-900/40 text-blue-300";
    case "generated":   return "bg-violet-900/40 text-violet-300";
    case "rejected":    return "bg-red-900/40 text-red-300";
    case "failed":      return "bg-red-900/40 text-red-400";
    case "scheduled":   return "bg-cyan-900/40 text-cyan-300";
    case "generating":  return "bg-yellow-900/40 text-yellow-300";
    default:            return "bg-slate-800 text-slate-400";
  }
}

function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-xs text-slate-500">
          <span>{label}</span>
          <span>{value}/{max}</span>
        </div>
      )}
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ConfirmDialog({
  open, title, description, confirmLabel, onConfirm, onCancel, danger,
}: {
  open: boolean; title: string; description: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
        <p className="text-xs text-slate-400 mb-5">{description}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn("px-4 py-2 text-sm text-white rounded-lg transition-colors", danger ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = React.useState<AdminCampaign | null>(null);
  const [posts, setPosts] = React.useState<CampaignPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [progressOpen, setProgressOpen] = React.useState(false);

  const [confirmPause, setConfirmPause] = React.useState(false);
  const [pausing, setPausing] = React.useState(false);
  const [flaggedIds, setFlaggedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      adminApi.adminGetCampaign(id),
      adminApi.adminListCampaignPosts(id),
    ])
      .then(([campRes, postsRes]) => {
        setCampaign(campRes.data);
        setPosts(postsRes.data ?? []);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load campaign";
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleForcePause = async () => {
    if (!campaign) return;
    setPausing(true);
    setConfirmPause(false);
    try {
      await adminApi.forcePauseCampaign(campaign.id);
      setCampaign({ ...campaign, status: "paused" });
      toast.success("Campaign paused");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to pause campaign";
      toast.error(msg);
    } finally {
      setPausing(false);
    }
  };

  const handleFlagPost = (postId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
        toast.info("Flag removed");
      } else {
        next.add(postId);
        toast.success("Post flagged for review");
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <p className="text-slate-500 text-sm">Campaign not found.</p>
        <Link href="/admin/campaigns" className="text-violet-400 text-sm hover:underline mt-2 inline-block">
          ← Back to campaigns
        </Link>
      </div>
    );
  }

  const canPause = campaign.status === "running" || campaign.status === "generating";

  return (
    <div className="p-6 space-y-6">
      {/* Back nav */}
      <Link href="/admin/campaigns" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
      </Link>

      {/* Admin warning banner */}
      <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-2 flex-1">
            <Bot className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">
                Admin View — You are viewing workspace &ldquo;{campaign.workspace_name || campaign.workspace_id}&rdquo;&apos;s campaign
              </p>
              <p className="text-xs text-amber-500/80 mt-0.5">
                Changes made here affect real user data. Actions are logged.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {canPause && (
              <button
                onClick={() => setConfirmPause(true)}
                disabled={pausing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 border border-amber-700/60 hover:border-amber-600 hover:bg-amber-900/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {pausing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                Force Pause
              </button>
            )}
            <button
              onClick={() => toast.info("Cancel & Refund — implement on backend when billing is hooked up.")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-800/40 hover:border-red-700 hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Cancel &amp; Refund
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: campaign info + posts */}
        <div className="xl:col-span-2 space-y-6">
          {/* Campaign header */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{campaign.name}</h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{campaign.id}</p>
              </div>
              <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0", statusColor(campaign.status))}>
                {campaign.status}
              </span>
            </div>

            {campaign.brief && (
              <p className="text-sm text-slate-400 mb-4">{campaign.brief}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {[
                { label: "Goal", value: campaign.goal ? campaign.goal.replace("_", " ") : "—" },
                { label: "Auto-Approve", value: campaign.auto_approve ? "Yes" : "No" },
                {
                  label: "Duration",
                  value: campaign.start_date && campaign.end_date
                    ? `${new Date(campaign.start_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} → ${new Date(campaign.end_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
                    : "—",
                },
                { label: "Platforms", value: campaign.platforms.join(", ") || "—" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="text-sm text-white mt-0.5 capitalize">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              <ProgressBar value={campaign.posts_generated} max={campaign.total_posts} label="Posts Generated" />
              <ProgressBar value={campaign.posts_published} max={campaign.total_posts} label="Posts Published" />
            </div>
          </div>

          {/* Posts grid */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">
              Campaign Posts <span className="text-slate-500 font-normal">({posts.length})</span>
            </h3>
            {posts.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                <p className="text-slate-500 text-sm">No posts generated yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className={cn(
                      "bg-slate-900 border rounded-xl p-4 space-y-3 transition-colors",
                      flaggedIds.has(post.id) ? "border-amber-700/50 bg-amber-900/10" : "border-slate-800"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", postStatusColor(post.status))}>
                          {post.status}
                        </span>
                        <span className="text-xs text-slate-500 capitalize">{post.platform}</span>
                      </div>
                      <button
                        onClick={() => handleFlagPost(post.id)}
                        title={flaggedIds.has(post.id) ? "Remove flag" : "Flag for review"}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors",
                          flaggedIds.has(post.id)
                            ? "text-amber-400 bg-amber-900/30"
                            : "text-slate-600 hover:text-amber-400 hover:bg-amber-900/20"
                        )}
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {post.generated_caption ? (
                      <p className="text-xs text-slate-300 line-clamp-3">{post.generated_caption}</p>
                    ) : (
                      <p className="text-xs text-slate-600 italic">No caption generated</p>
                    )}

                    {post.generated_hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {post.generated_hashtags.slice(0, 5).map((h) => (
                          <span key={h} className="text-xs text-violet-400">#{h}</span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{post.post_type}</span>
                      <span>{new Date(post.scheduled_for).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                    </div>

                    {post.error_message && (
                      <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">{post.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: metadata sidebar */}
        <div className="space-y-4">
          {/* Workspace info */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Workspace</h4>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">{campaign.workspace_name || "—"}</p>
                <p className="text-xs font-mono text-slate-500 truncate">{campaign.workspace_id}</p>
              </div>
            </div>
          </div>

          {/* Creator */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Created By</h4>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <p className="text-xs font-mono text-slate-400 truncate">{campaign.created_by}</p>
            </div>
            <p className="text-xs text-slate-500">
              {new Date(campaign.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>

          {/* Credits */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-violet-400" /> Credits
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500">Used</p>
                <p className="text-lg font-bold text-white">{campaign.credits_used}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Estimated</p>
                <p className="text-lg font-bold text-slate-400">{campaign.credits_estimated}</p>
              </div>
            </div>
            <ProgressBar value={campaign.credits_used} max={campaign.credits_estimated || 1} />
          </div>

          {/* Brand Kit */}
          {campaign.brand_kit && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Brand Kit</h4>
              <p className="text-sm text-white">{campaign.brand_kit.name}</p>
              <p className="text-xs font-mono text-slate-500">{campaign.brand_kit_id}</p>
            </div>
          )}

          {/* Generation Progress JSON */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setProgressOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>Generation Progress</span>
              {progressOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {progressOpen && (
              <div className="border-t border-slate-800 px-4 py-3">
                <pre className="text-xs text-slate-400 overflow-auto max-h-48 font-mono leading-relaxed">
                  {JSON.stringify(campaign.generation_progress, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Post counts */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Post Counts</h4>
            {[
              { label: "Total", value: campaign.total_posts },
              { label: "Generated", value: campaign.posts_generated },
              { label: "Approved", value: campaign.posts_approved },
              { label: "Published", value: campaign.posts_published },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className="text-white font-medium tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Force Pause confirm */}
      <ConfirmDialog
        open={confirmPause}
        title="Force Pause Campaign"
        description={`Pause "${campaign.name}"? This will stop all scheduled publishing immediately.`}
        confirmLabel="Force Pause"
        onConfirm={handleForcePause}
        onCancel={() => setConfirmPause(false)}
        danger
      />
    </div>
  );
}
