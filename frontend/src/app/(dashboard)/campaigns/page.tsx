"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Rocket,
  Sparkles,
  Play,
  Pause,
  Eye,
  Pencil,
  Copy,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { campaignsApi } from "@/lib/api";
import { Campaign, CampaignStatus, CampaignGoal } from "@/types";

// ─── helpers ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "IG",
  tiktok: "TT",
  linkedin: "LI",
  twitter: "TW",
  facebook: "FB",
  youtube: "YT",
  pinterest: "PI",
  threads: "TH",
  bluesky: "BS",
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  tiktok: "bg-gray-900 text-white dark:bg-gray-700",
  linkedin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  twitter: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  facebook: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  pinterest: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  threads: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  bluesky: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
};

const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    icon: <Pencil className="h-3 w-3" />,
  },
  generating: {
    label: "Generating",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  review: {
    label: "Review Needed",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    icon: <Clock className="h-3 w-3" />,
  },
  running: {
    label: "Running",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: <Play className="h-3 w-3" />,
  },
  paused: {
    label: "Paused",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: <Pause className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

const GOAL_LABELS: Record<CampaignGoal, string> = {
  awareness: "Awareness",
  engagement: "Engagement",
  sales: "Sales",
  education: "Education",
  event_promotion: "Event Promotion",
};

const GOAL_ICONS: Record<CampaignGoal, string> = {
  awareness: "🎯",
  engagement: "💬",
  sales: "💰",
  education: "📚",
  event_promotion: "🎉",
};

type FilterTab = "all" | CampaignStatus;

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "generating", label: "Generating" },
  { value: "review", label: "Review Needed" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
];

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return "No dates set";
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

// ─── CampaignCard ────────────────────────────────────────────────────────────

interface CampaignCardProps {
  campaign: Campaign;
  onGenerate: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  actionLoading: string | null;
}

function CampaignCard({
  campaign,
  onGenerate,
  onPause,
  onResume,
  actionLoading,
}: CampaignCardProps) {
  const router = useRouter();
  const status = campaign.status;
  const statusCfg = STATUS_CONFIG[status];
  const isLoading = actionLoading === campaign.id;

  const progressValue =
    status === "generating"
      ? campaign.total_posts > 0
        ? Math.round((campaign.posts_generated / campaign.total_posts) * 100)
        : 0
      : campaign.total_posts > 0
      ? Math.round((campaign.posts_published / campaign.total_posts) * 100)
      : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate text-base">
            {campaign.name}
          </h3>
          {campaign.goal && (
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 inline-flex items-center gap-1">
              {GOAL_ICONS[campaign.goal]} {GOAL_LABELS[campaign.goal]}
            </span>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium flex-shrink-0 ${statusCfg.className}`}
        >
          {statusCfg.icon}
          {statusCfg.label}
        </span>
      </div>

      {/* Date range */}
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        {formatDateRange(campaign.start_date, campaign.end_date)}
      </p>

      {/* Platforms */}
      {campaign.platforms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {campaign.platforms.map((p) => (
            <span
              key={p}
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                PLATFORM_COLORS[p] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {PLATFORM_LABELS[p] ?? p.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {/* Progress */}
      {campaign.total_posts > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {status === "generating"
                ? `${campaign.posts_generated} / ${campaign.total_posts} generated`
                : `${campaign.posts_published} / ${campaign.total_posts} published`}
            </span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="h-1.5" />
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          {campaign.total_posts} posts
        </span>
        <span>·</span>
        <span>{campaign.posts_published} published</span>
        {campaign.credits_used > 0 && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {campaign.credits_used} credits
            </span>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        {status === "draft" && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => router.push(`/campaigns/${campaign.id}`)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => onGenerate(campaign.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5 mr-1" />
              )}
              Generate
            </Button>
          </>
        )}

        {status === "generating" && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => router.push(`/campaigns/${campaign.id}`)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            View Progress
          </Button>
        )}

        {status === "review" && (
          <Button
            size="sm"
            className="h-8 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white"
            onClick={() => router.push(`/campaigns/${campaign.id}`)}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Review Posts
          </Button>
        )}

        {status === "running" && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => router.push(`/campaigns/${campaign.id}`)}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              onClick={() => onPause(campaign.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5 mr-1" />
              )}
              Pause
            </Button>
          </>
        )}

        {status === "paused" && (
          <>
            <Button
              size="sm"
              className="h-8 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => onResume(campaign.id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              Resume
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => router.push(`/campaigns/${campaign.id}`)}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              View
            </Button>
          </>
        )}

        {(status === "completed" || status === "scheduled" || status === "failed") && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => router.push(`/campaigns/${campaign.id}`)}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              View
            </Button>
            {status === "completed" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => router.push(`/campaigns/new?clone=${campaign.id}`)}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Clone
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-20 w-20 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-5">
        <Sparkles className="h-10 w-10 text-violet-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Let AI create your content calendar
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
        Describe your goals, brand, and schedule — AI generates captions, images, and videos
        and posts them automatically.
      </p>
      <Button
        className="bg-violet-600 hover:bg-violet-700 text-white"
        onClick={() => router.push("/campaigns/new")}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Create your first campaign
      </Button>

      {/* Feature pills */}
      <div className="mt-10 flex flex-wrap justify-center gap-3 max-w-lg">
        {[
          "AI-generated captions",
          "Auto-scheduled posts",
          "Multi-platform",
          "Image & video generation",
          "Brand kit integration",
          "Full content calendar",
        ].map((feat) => (
          <span
            key={feat}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
          >
            {feat}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<FilterTab>("all");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  async function loadCampaigns() {
    try {
      setError(null);
      const res = await campaignsApi.list(activeTab === "all" ? undefined : activeTab);
      setCampaigns(res.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    setLoading(true);
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function handleGenerate(id: string) {
    setActionLoading(id);
    try {
      const res = await campaignsApi.generate(id);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? res.data : c)));
      toast.success("Generation started! AI is building your content calendar.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePause(id: string) {
    setActionLoading(id);
    try {
      const res = await campaignsApi.pause(id);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? res.data : c)));
      toast.success("Campaign paused");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to pause campaign");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume(id: string) {
    setActionLoading(id);
    try {
      const res = await campaignsApi.resume(id);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? res.data : c)));
      toast.success("Campaign resumed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to resume campaign");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Campaigns</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            AI-powered content calendars that generate and publish automatically.
          </p>
        </div>
        <Button
          className="bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => router.push("/campaigns/new")}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg w-fit flex-wrap">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-20">
          <p className="text-red-500 mb-3">{error}</p>
          <Button variant="outline" onClick={loadCampaigns}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && campaigns.length === 0 && <EmptyState />}

      {/* Campaign grid */}
      {!loading && !error && campaigns.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onGenerate={handleGenerate}
              onPause={handlePause}
              onResume={handleResume}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
