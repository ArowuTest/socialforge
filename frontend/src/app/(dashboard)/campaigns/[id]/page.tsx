"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Rocket,
  CheckCircle2,
  XCircle,
  Pencil,
  Play,
  Pause,
  Copy,
  Loader2,
  AlertCircle,
  Clock,
  LayoutGrid,
  List,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  RefreshCw,
  Eye,
  X,
  Hash,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { campaignsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import {
  Campaign,
  CampaignPost,
  CampaignStatus,
  CampaignPostStatus,
} from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  twitter: "Twitter / X",
  facebook: "Facebook",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky",
};

const PLATFORM_SHORT: Record<string, string> = {
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
  instagram:
    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  tiktok: "bg-gray-900 text-white dark:bg-gray-700",
  linkedin:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  twitter: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  facebook:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  pinterest:
    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  threads:
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  bluesky: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
};

const PLATFORM_GRADIENT: Record<string, string> = {
  instagram: "from-pink-500 to-purple-600",
  tiktok: "from-gray-800 to-gray-900",
  linkedin: "from-blue-600 to-blue-800",
  twitter: "from-sky-400 to-sky-600",
  facebook: "from-blue-500 to-blue-700",
  youtube: "from-red-500 to-red-700",
  pinterest: "from-rose-500 to-rose-700",
  threads: "from-gray-500 to-gray-700",
  bluesky: "from-sky-400 to-blue-600",
};

const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    icon: <Pencil className="h-3 w-3" />,
  },
  generating: {
    label: "Generating",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  review: {
    label: "Review Needed",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  scheduled: {
    label: "Scheduled",
    className:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    icon: <Clock className="h-3 w-3" />,
  },
  running: {
    label: "Running",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: <Play className="h-3 w-3" />,
  },
  paused: {
    label: "Paused",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: <Pause className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    className:
      "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    className:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

const POST_STATUS_CONFIG: Record<
  CampaignPostStatus,
  { label: string; className: string }
> = {
  pending_generation: {
    label: "Pending",
    className:
      "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
  generating: {
    label: "Generating",
    className:
      "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  },
  generated: {
    label: "Generated",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  },
  approved: {
    label: "Approved",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  rejected: {
    label: "Rejected",
    className:
      "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
  scheduled: {
    label: "Scheduled",
    className:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  published: {
    label: "Published",
    className:
      "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
  failed: {
    label: "Failed",
    className:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

type PostFilterTab =
  | "all"
  | "pending_generation"
  | "generated"
  | "approved"
  | "rejected"
  | "published";

const POST_FILTER_TABS: { value: PostFilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_generation", label: "Pending" },
  { value: "generated", label: "Generated" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "published", label: "Published" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Platform Preview Modal ───────────────────────────────────────────────────

type PreviewPlatform = "instagram" | "linkedin" | "twitter" | "tiktok" | "facebook" | "youtube";

const PREVIEW_PLATFORMS: { id: PreviewPlatform; label: string; emoji: string }[] = [
  { id: "instagram", label: "Instagram", emoji: "📸" },
  { id: "linkedin", label: "LinkedIn", emoji: "💼" },
  { id: "twitter", label: "Twitter / X", emoji: "🐦" },
  { id: "tiktok", label: "TikTok", emoji: "🎵" },
  { id: "facebook", label: "Facebook", emoji: "👍" },
  { id: "youtube", label: "YouTube", emoji: "▶️" },
];

// Helper: render media (image or video) inside preview mocks
function PreviewMedia({ post, className }: { post: CampaignPost; className?: string }) {
  const hasMedia = post.media_urls.length > 0;
  const isVideo = post.post_type === "video";
  if (!hasMedia) return null;
  if (isVideo) {
    return (
      <video
        src={post.media_urls[0]}
        className={className ?? "w-full h-full object-cover"}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={post.media_urls[0]} alt="" className={className ?? "w-full h-full object-cover"} />;
}

function InstagramPreview({ post, brandName }: { post: CampaignPost; brandName: string }) {
  const caption = post.generated_caption ?? "";
  const tags = (post.generated_hashtags ?? []).slice(0, 8);
  const hasMedia = post.media_urls.length > 0;
  const isCarousel = post.post_type === "carousel";
  const handle = brandName.toLowerCase().replace(/\s+/g, "_");
  const initial = brandName.charAt(0).toUpperCase();
  return (
    <div className="bg-white rounded-xl border border-gray-200 max-w-sm mx-auto font-sans text-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{initial}</div>
        <div>
          <p className="text-xs font-semibold leading-none">{handle}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Sponsored</p>
        </div>
        <span className="ml-auto text-gray-400 text-lg">···</span>
      </div>
      {/* Image / video */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {hasMedia ? (
          <PreviewMedia post={post} />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${PLATFORM_GRADIENT[post.platform] ?? "from-gray-300 to-gray-400"} flex items-center justify-center`}>
            <span className="text-white/60 text-4xl">{isCarousel ? "🖼️🖼️🖼️" : "🖼️"}</span>
          </div>
        )}
        {isCarousel && (
          <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
            <div className="grid grid-cols-2 gap-0.5 w-3 h-3">
              {[0,1,2,3].map(i=><div key={i} className="bg-white rounded-sm"/>)}
            </div>
          </div>
        )}
      </div>
      {/* Actions */}
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-3">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Share2 className="h-5 w-5" />
        <Bookmark className="h-5 w-5 ml-auto" />
      </div>
      {/* Caption */}
      <div className="px-3 pb-3 space-y-1">
        <p className="text-xs font-semibold">1,234 likes</p>
        <p className="text-xs text-gray-800 line-clamp-3">
          <span className="font-semibold">{handle}</span>{" "}
          {caption || <span className="text-gray-400 italic">No caption yet</span>}
        </p>
        {tags.length > 0 && (
          <p className="text-xs text-blue-500">{tags.map(t => t.startsWith("#") ? t : `#${t}`).join(" ")}</p>
        )}
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">2 hours ago</p>
      </div>
    </div>
  );
}

function LinkedInPreview({ post, brandName }: { post: CampaignPost; brandName: string }) {
  const caption = post.generated_caption ?? "";
  const hasMedia = post.media_urls.length > 0;
  const initial = brandName.charAt(0).toUpperCase();
  return (
    <div className="bg-white rounded-xl border border-gray-200 max-w-sm mx-auto font-sans text-sm">
      <div className="flex items-start gap-2.5 px-3 py-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{initial}</div>
        <div>
          <p className="text-xs font-semibold leading-tight">{brandName}</p>
          <p className="text-[10px] text-gray-400">10,000 followers · Promoted</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="text-xs text-gray-800 line-clamp-4">
          {caption || <span className="text-gray-400 italic">No caption yet</span>}
        </p>
        {caption.length > 200 && <span className="text-[11px] text-blue-600 cursor-pointer">…see more</span>}
      </div>
      <div className={`${hasMedia ? "aspect-[1.91/1]" : "h-24"} bg-gray-100 overflow-hidden`}>
        {hasMedia ? (
          <PreviewMedia post={post} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-3xl">💼</div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-500">
        <button className="flex items-center gap-1 hover:text-blue-600"><ThumbsUp className="h-3.5 w-3.5" /> Like</button>
        <button className="flex items-center gap-1 hover:text-blue-600"><MessageCircle className="h-3.5 w-3.5" /> Comment</button>
        <button className="flex items-center gap-1 hover:text-blue-600"><Share2 className="h-3.5 w-3.5" /> Repost</button>
      </div>
    </div>
  );
}

function TwitterPreview({ post, brandName }: { post: CampaignPost; brandName: string }) {
  const caption = post.generated_caption ?? "";
  const tags = (post.generated_hashtags ?? []).slice(0, 3);
  const charCount = caption.length;
  const hasMedia = post.media_urls.length > 0;
  const handle = brandName.toLowerCase().replace(/\s+/g, "_");
  const initial = brandName.charAt(0).toUpperCase();
  return (
    <div className="bg-white rounded-xl border border-gray-200 max-w-sm mx-auto font-sans text-sm">
      <div className="flex gap-2.5 px-3 pt-3 pb-2">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initial}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold">{brandName}</span>
            <span className="text-[10px] text-gray-400">@{handle} · 2h</span>
          </div>
          <p className="text-xs text-gray-800 mt-0.5 line-clamp-4">
            {caption || <span className="text-gray-400 italic">No caption yet</span>}
            {tags.length > 0 && <span className="text-sky-500"> {tags.map(t=>t.startsWith("#")?t:`#${t}`).join(" ")}</span>}
          </p>
          {hasMedia && (
            <div className="mt-2 rounded-xl overflow-hidden aspect-video bg-gray-100">
              <PreviewMedia post={post} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 12</span>
            <span className="flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" /> 45</span>
            <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> 234</span>
            <span className={`ml-auto text-[10px] ${charCount > 280 ? "text-red-500" : "text-gray-400"}`}>{charCount}/280</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TikTokPreview({ post, brandName }: { post: CampaignPost; brandName: string }) {
  const caption = post.generated_caption ?? "";
  const tags = (post.generated_hashtags ?? []).slice(0, 4);
  const hasMedia = post.media_urls.length > 0;
  const handle = brandName.toLowerCase().replace(/\s+/g, "_");
  const initial = brandName.charAt(0).toUpperCase();
  return (
    <div className="bg-black rounded-xl max-w-[220px] mx-auto relative overflow-hidden" style={{ aspectRatio: "9/16" }}>
      {hasMedia ? (
        <PreviewMedia post={post} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center text-5xl">🎵</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      {/* Right actions */}
      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 border-2 border-white flex items-center justify-center text-white text-xs font-bold">{initial}</div>
        <div className="text-center"><Heart className="h-6 w-6 text-white" /><p className="text-[9px] text-white">12.3K</p></div>
        <div className="text-center"><MessageCircle className="h-6 w-6 text-white" /><p className="text-[9px] text-white">456</p></div>
        <div className="text-center"><Share2 className="h-6 w-6 text-white" /><p className="text-[9px] text-white">Share</p></div>
      </div>
      {/* Bottom caption */}
      <div className="absolute bottom-3 left-2 right-12">
        <p className="text-[10px] font-semibold text-white">@{handle}</p>
        <p className="text-[9px] text-white/90 line-clamp-2 mt-0.5">{caption}</p>
        {tags.length > 0 && <p className="text-[9px] text-white/80 mt-0.5">{tags.map(t=>t.startsWith("#")?t:`#${t}`).join(" ")}</p>}
      </div>
    </div>
  );
}

function FacebookPreview({ post, brandName }: { post: CampaignPost; brandName: string }) {
  const caption = post.generated_caption ?? "";
  const hasMedia = post.media_urls.length > 0;
  const initial = brandName.charAt(0).toUpperCase();
  return (
    <div className="bg-white rounded-xl border border-gray-200 max-w-sm mx-auto font-sans text-sm">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold">{initial}</div>
        <div>
          <p className="text-xs font-semibold">{brandName}</p>
          <p className="text-[10px] text-gray-400">2 hrs · 🌐</p>
        </div>
        <span className="ml-auto text-gray-400 text-lg">···</span>
      </div>
      <div className="px-3 pb-2">
        <p className="text-xs text-gray-800 line-clamp-3">{caption || <span className="text-gray-400 italic">No caption yet</span>}</p>
      </div>
      {hasMedia && (
        <div className="aspect-video bg-gray-100 overflow-hidden">
          <PreviewMedia post={post} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-around text-[11px] text-gray-500">
        <button className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Like</button>
        <button className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Comment</button>
        <button className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Share</button>
      </div>
    </div>
  );
}

function YouTubePreview({ post, brandName }: { post: CampaignPost; brandName: string }) {
  const caption = post.generated_caption ?? "";
  const hasMedia = post.media_urls.length > 0;
  const initial = brandName.charAt(0).toUpperCase();
  return (
    <div className="bg-white rounded-xl border border-gray-200 max-w-sm mx-auto font-sans text-sm overflow-hidden">
      <div className={`aspect-video bg-gray-900 relative ${!hasMedia ? "flex items-center justify-center" : ""}`}>
        {hasMedia ? (
          <PreviewMedia post={post} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">▶️</span>
        )}
        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">0:30</div>
      </div>
      <div className="flex gap-2 p-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">{initial}</div>
        <div>
          <p className="text-xs font-semibold line-clamp-2">{caption || "Your Video Title"}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{brandName} · 1.2K views · 2 hours ago</p>
        </div>
      </div>
    </div>
  );
}

interface PlatformPreviewModalProps {
  post: CampaignPost;
  onClose: () => void;
}

function PlatformPreviewModal({ post, onClose }: PlatformPreviewModalProps) {
  const { workspace } = useAuthStore();
  const brandName = workspace?.name ?? "Your Brand";
  const defaultPlatform = (post.platform as PreviewPlatform) ?? "instagram";
  const [active, setActive] = React.useState<PreviewPlatform>(
    PREVIEW_PLATFORMS.some(p => p.id === defaultPlatform) ? defaultPlatform : "instagram"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Platform Preview</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">How this post looks across platforms</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Platform tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0 flex-wrap">
          {PREVIEW_PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                active === p.id
                  ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <span>{p.emoji}</span>
              {p.label}
            </button>
          ))}
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50 dark:bg-gray-800/30">
          {active === "instagram" && <InstagramPreview post={post} brandName={brandName} />}
          {active === "linkedin" && <LinkedInPreview post={post} brandName={brandName} />}
          {active === "twitter" && <TwitterPreview post={post} brandName={brandName} />}
          {active === "tiktok" && <TikTokPreview post={post} brandName={brandName} />}
          {active === "facebook" && <FacebookPreview post={post} brandName={brandName} />}
          {active === "youtube" && <YouTubePreview post={post} brandName={brandName} />}
        </div>

        {/* Caption + hashtag summary */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
            <Hash className="h-3 w-3" />
            {(post.generated_hashtags ?? []).length} hashtags · {(post.generated_caption ?? "").length} chars
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
            {post.generated_caption || <span className="italic">No caption generated yet</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Generation Progress ──────────────────────────────────────────────────────

interface GenerationProgressProps {
  campaign: Campaign;
}

function GenerationProgress({ campaign }: GenerationProgressProps) {
  const generated = campaign.posts_generated;
  const total = campaign.total_posts;
  const pct = total > 0 ? Math.round((generated / total) * 100) : 0;

  const steps: { label: string; sub: string; state: "done" | "active" | "todo" }[] =
    [
      {
        label: "Content Strategy",
        sub: "Planning your content calendar",
        state: generated === 0 && total === 0 ? "active" : "done",
      },
      {
        label: "Generating Posts",
        sub: `Creating captions and visuals${total > 0 ? ` (${generated}/${total})` : ""}`,
        state: generated === 0 && total === 0 ? "todo" : generated < total ? "active" : "done",
      },
      {
        label: "Final Review",
        sub: "Ready for your approval",
        state: generated >= total && total > 0 ? "done" : "todo",
      },
    ];

  return (
    <div className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white">
          AI is building your content…
        </h3>
        <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
          {pct}%
        </span>
      </div>

      <Progress value={pct} className="h-1.5 mb-5" />

      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0 text-base leading-none">
              {step.state === "done"
                ? "✅"
                : step.state === "active"
                ? "⏳"
                : "⬜"}
            </span>
            <div>
              <p
                className={`text-sm font-medium ${
                  step.state === "active"
                    ? "text-blue-600 dark:text-blue-400"
                    : step.state === "done"
                    ? "text-gray-700 dark:text-gray-300"
                    : "text-gray-400 dark:text-gray-600"
                }`}
              >
                {step.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {step.sub}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: React.ReactNode;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col gap-1">
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: CampaignPost;
  campaignId: string;
  onApprove: (pid: string) => Promise<void>;
  onReject: (pid: string) => Promise<void>;
  onUpdate: (pid: string, caption: string) => Promise<void>;
  onRegenerate: (pid: string) => Promise<void>;
  onPreview: (post: CampaignPost) => void;
}

function PostCard({
  post,
  onApprove,
  onReject,
  onUpdate,
  onRegenerate,
  onPreview,
}: PostCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editCaption, setEditCaption] = React.useState(
    post.generated_caption ?? ""
  );
  const [saving, setSaving] = React.useState(false);
  const [actioning, setActioning] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);

  const statusCfg = POST_STATUS_CONFIG[post.status];
  const platformColor =
    PLATFORM_COLORS[post.platform] ?? "bg-gray-100 text-gray-600";
  const gradientClass =
    PLATFORM_GRADIENT[post.platform] ?? "from-gray-400 to-gray-600";
  const hasMedia = post.media_urls.length > 0;
  const caption = post.generated_caption ?? "";
  const hashtags = post.generated_hashtags ?? [];

  async function handleApprove() {
    setActioning(true);
    await onApprove(post.id);
    setActioning(false);
  }

  async function handleReject() {
    setActioning(true);
    await onReject(post.id);
    setActioning(false);
  }

  async function handleSave() {
    setSaving(true);
    await onUpdate(post.id, editCaption);
    setSaving(false);
    setEditing(false);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    await onRegenerate(post.id);
    setRegenerating(false);
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
      {/* Top badges row */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${platformColor}`}
          >
            {PLATFORM_SHORT[post.platform] ?? post.platform.toUpperCase()}
          </span>
          <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400 font-medium">
            {post.post_type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {post.content_pillar && (
            <span className="inline-flex items-center rounded-full bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-400 font-medium">
              {post.content_pillar}
            </span>
          )}
          <button
            onClick={() => onPreview(post)}
            className="h-6 w-6 rounded-md flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            title="Platform preview"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Media / placeholder */}
      <div className="mx-3 mt-2 rounded-lg overflow-hidden aspect-[4/3] relative">
        {hasMedia ? (
          post.post_type === "video" ? (
            <video
              src={post.media_urls[0]}
              className="w-full h-full object-cover"
              playsInline
              preload="metadata"
              muted
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.media_urls[0]}
              alt="Post media"
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${gradientClass} flex items-center justify-center p-4`}
          >
            {caption ? (
              <p className="text-white text-xs font-medium leading-snug text-center line-clamp-5 drop-shadow">
                {caption}
              </p>
            ) : (
              <span className="text-white/60 text-3xl font-bold">
                {PLATFORM_SHORT[post.platform] ?? "?"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-3 pt-3 pb-2 flex-1 flex flex-col gap-2">
        {/* Caption */}
        {editing ? (
          <Textarea
            value={editCaption}
            onChange={(e) => setEditCaption(e.target.value)}
            className="text-sm min-h-[96px] resize-none"
            autoFocus
          />
        ) : (
          <div>
            <p
              className={`text-sm text-gray-700 dark:text-gray-300 leading-relaxed ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {caption || (
                <span className="italic text-gray-400">No caption yet</span>
              )}
            </p>
            {caption.length > 120 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-violet-600 dark:text-violet-400 mt-0.5 flex items-center gap-0.5 hover:underline"
              >
                {expanded ? (
                  <>
                    Show less <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5"
              >
                {tag.startsWith("#") ? tag : `#${tag}`}
              </span>
            ))}
            {hashtags.length > 5 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5">
                +{hashtags.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* Scheduled date */}
        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDateTime(post.scheduled_for)}
        </p>

        {/* Status badge */}
        <span
          className={`self-start inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}
        >
          {statusCfg.label}
        </span>
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : null}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              onClick={() => {
                setEditing(false);
                setEditCaption(post.generated_caption ?? "");
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            {post.status === "generated" && (
              <>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApprove}
                  disabled={actioning}
                >
                  {actioning ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={handleReject}
                  disabled={actioning}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </>
            )}

            {post.status === "approved" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={handleReject}
                  disabled={actioning}
                >
                  {actioning ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="h-3 w-3 mr-1" />
                  )}
                  Revoke
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </>
            )}

            {post.status === "rejected" && (
              <Button
                size="sm"
                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleApprove}
                disabled={actioning}
              >
                {actioning ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                Re-approve
              </Button>
            )}

            {post.status === "published" && post.post_id && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs"
                asChild
              >
                <a
                  href={`/compose?post=${post.post_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View Post
                </a>
              </Button>
            )}

            {/* Regenerate — available for any non-generating, non-published status */}
            {post.status !== "generating" && post.status !== "published" && post.status !== "scheduled" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs text-violet-600 border-violet-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 ml-auto"
                onClick={handleRegenerate}
                disabled={regenerating}
                title="Regenerate this post with AI"
              >
                {regenerating ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Regen
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Post row (list view) ─────────────────────────────────────────────────────

interface PostRowProps {
  post: CampaignPost;
  campaignId: string;
  onApprove: (pid: string) => Promise<void>;
  onReject: (pid: string) => Promise<void>;
  onUpdate: (pid: string, caption: string) => Promise<void>;
  onRegenerate: (pid: string) => Promise<void>;
  onPreview: (post: CampaignPost) => void;
}

function PostRow({ post, onApprove, onReject, onUpdate, onRegenerate, onPreview }: PostRowProps) {
  const [editing, setEditing] = React.useState(false);
  const [editCaption, setEditCaption] = React.useState(
    post.generated_caption ?? ""
  );
  const [saving, setSaving] = React.useState(false);
  const [actioning, setActioning] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);

  const statusCfg = POST_STATUS_CONFIG[post.status];
  const platformColor =
    PLATFORM_COLORS[post.platform] ?? "bg-gray-100 text-gray-600";

  async function handleApprove() {
    setActioning(true);
    await onApprove(post.id);
    setActioning(false);
  }

  async function handleReject() {
    setActioning(true);
    await onReject(post.id);
    setActioning(false);
  }

  async function handleSave() {
    setSaving(true);
    await onUpdate(post.id, editCaption);
    setSaving(false);
    setEditing(false);
  }

  async function handleRegenerateRow() {
    setRegenerating(true);
    await onRegenerate(post.id);
    setRegenerating(false);
  }

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
      <td className="py-3 px-4 align-top">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${platformColor}`}
          >
            {PLATFORM_SHORT[post.platform] ?? post.platform.toUpperCase()}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
            {post.post_type}
          </span>
        </div>
      </td>
      <td className="py-3 px-4 align-top max-w-xs">
        {editing ? (
          <Textarea
            value={editCaption}
            onChange={(e) => setEditCaption(e.target.value)}
            className="text-sm min-h-[72px] resize-none"
            autoFocus
          />
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
            {post.generated_caption || (
              <span className="italic text-gray-400">No caption</span>
            )}
          </p>
        )}
      </td>
      <td className="py-3 px-4 align-top text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {formatDateTime(post.scheduled_for)}
      </td>
      <td className="py-3 px-4 align-top">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}
        >
          {statusCfg.label}
        </span>
      </td>
      <td className="py-3 px-4 align-top">
        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setEditing(false);
                  setEditCaption(post.generated_caption ?? "");
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              {post.status === "generated" && (
                <>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleApprove}
                    disabled={actioning}
                  >
                    {actioning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs text-red-600 border-red-200"
                    onClick={handleReject}
                    disabled={actioning}
                  >
                    <XCircle className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </>
              )}
              {post.status === "approved" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs text-red-600 border-red-200"
                    onClick={handleReject}
                    disabled={actioning}
                  >
                    {actioning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </>
              )}
              {post.status === "rejected" && (
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApprove}
                  disabled={actioning}
                >
                  {actioning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
              )}
              {post.status === "published" && post.post_id && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
                  <a href={`/compose?post=${post.post_id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}

              {/* Regenerate */}
              {post.status !== "generating" && post.status !== "published" && post.status !== "scheduled" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs text-violet-600 border-violet-200 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  onClick={handleRegenerateRow}
                  disabled={regenerating}
                  title="Regenerate"
                >
                  {regenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
              )}

              {/* Preview */}
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-gray-500 hover:text-violet-600 hover:border-violet-200"
                onClick={() => onPreview(post)}
                title="Platform preview"
              >
                <Eye className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [posts, setPosts] = React.useState<CampaignPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const [postFilter, setPostFilter] = React.useState<PostFilterTab>("all");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [previewPost, setPreviewPost] = React.useState<CampaignPost | null>(null);

  const pollingRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData(silent = false) {
    try {
      if (!silent) setError(null);
      const [campaignRes, postsRes] = await Promise.all([
        campaignsApi.get(id),
        campaignsApi.listPosts(id),
      ]);
      setCampaign(campaignRes.data);
      setPosts(postsRes.data ?? []);
      return campaignRes.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load campaign";
      if (!silent) setError(msg);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function schedulePolling() {
    stopPolling();
    pollingRef.current = setTimeout(async () => {
      const updated = await loadData(true);
      if (updated && updated.status === "generating") {
        schedulePolling();
      }
    }, 5000);
  }

  React.useEffect(() => {
    loadData().then((c) => {
      if (c && c.status === "generating") schedulePolling();
    });
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Restart / stop polling when campaign status changes
  React.useEffect(() => {
    if (!campaign) return;
    if (campaign.status === "generating") {
      schedulePolling();
    } else {
      stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status]);

  // ── Post helpers ──────────────────────────────────────────────────────────

  function updatePostLocally(pid: string, updated: CampaignPost) {
    setPosts((prev) => prev.map((p) => (p.id === pid ? updated : p)));
  }

  async function handleApprovePost(pid: string) {
    try {
      const res = await campaignsApi.approvePost(id, pid);
      updatePostLocally(pid, res.data);
      // Update campaign post counts optimistically
      setCampaign((prev) =>
        prev
          ? { ...prev, posts_approved: prev.posts_approved + 1 }
          : prev
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve post");
    }
  }

  async function handleRejectPost(pid: string) {
    try {
      const res = await campaignsApi.rejectPost(id, pid);
      updatePostLocally(pid, res.data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject post");
    }
  }

  async function handleUpdatePost(pid: string, caption: string) {
    try {
      const res = await campaignsApi.updatePost(id, pid, {
        generated_caption: caption,
      });
      updatePostLocally(pid, res.data);
      toast.success("Caption saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save caption");
    }
  }

  async function handleRegeneratePost(pid: string) {
    try {
      const res = await campaignsApi.regeneratePost(id, pid);
      updatePostLocally(pid, res.data);
      toast.success("Post queued for regeneration");
      // Resume polling so we see when it finishes
      schedulePolling();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate post");
    }
  }

  async function handleClone() {
    setActionLoading("clone");
    try {
      const res = await campaignsApi.clone(id);
      toast.success("Campaign cloned — opening draft…");
      router.push(`/campaigns/${res.data.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to clone campaign");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApproveAll() {
    setActionLoading("approve-all");
    try {
      await campaignsApi.approveAll(id);
      const postsRes = await campaignsApi.listPosts(id);
      setPosts(postsRes.data ?? []);
      const campaignRes = await campaignsApi.get(id);
      setCampaign(campaignRes.data);
      toast.success("All posts approved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve all");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleGenerate() {
    setActionLoading("generate");
    try {
      const res = await campaignsApi.generate(id);
      setCampaign(res.data);
      toast.success("Generation started! AI is building your content calendar.");
      schedulePolling();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start generation"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePause() {
    setActionLoading("pause");
    try {
      const res = await campaignsApi.pause(id);
      setCampaign(res.data);
      toast.success("Campaign paused");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to pause");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume() {
    setActionLoading("resume");
    try {
      const res = await campaignsApi.resume(id);
      setCampaign(res.data);
      toast.success("Campaign resumed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Filtered posts ────────────────────────────────────────────────────────

  const filteredPosts = React.useMemo(() => {
    if (postFilter === "all") return posts;
    if (postFilter === "pending_generation")
      return posts.filter(
        (p) =>
          p.status === "pending_generation" || p.status === "generating"
      );
    return posts.filter((p) => p.status === postFilter);
  }, [posts, postFilter]);

  const generatedPostCount = posts.filter(
    (p) => p.status === "generated"
  ).length;

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-gray-600 dark:text-gray-400">
          {error ?? "Campaign not found"}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => loadData()}>
            Retry
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/campaigns")}
          >
            Back to Campaigns
          </Button>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[campaign.status];

  // Credits progress
  const creditsEst = campaign.credits_estimated;
  const creditsUsed = campaign.credits_used;
  const creditsPct =
    creditsEst > 0 ? Math.min(100, Math.round((creditsUsed / creditsEst) * 100)) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        {/* Back link */}
        <button
          onClick={() => router.push("/campaigns")}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {campaign.name}
              </h1>
              {campaign.goal && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 capitalize">
                  {campaign.goal.replace("_", " ")}
                </p>
              )}
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium mt-1 flex-shrink-0 ${statusCfg.className}`}
            >
              {statusCfg.icon}
              {statusCfg.label}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {campaign.status === "draft" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/campaigns/new?edit=${id}`)}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit Settings
                </Button>
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={handleGenerate}
                  disabled={actionLoading === "generate"}
                >
                  {actionLoading === "generate" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4 mr-1.5" />
                  )}
                  Generate Content
                </Button>
              </>
            )}

            {campaign.status === "generating" && (
              <Button size="sm" variant="outline" disabled>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Generating…
              </Button>
            )}

            {campaign.status === "review" && (
              <>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                  onClick={handleApproveAll}
                  disabled={actionLoading === "approve-all"}
                >
                  {actionLoading === "approve-all" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  )}
                  Approve All
                </Button>
              </>
            )}

            {campaign.status === "running" && (
              <Button
                size="sm"
                variant="outline"
                className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                onClick={handlePause}
                disabled={actionLoading === "pause"}
              >
                {actionLoading === "pause" ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-1.5" />
                )}
                Pause Campaign
              </Button>
            )}

            {campaign.status === "paused" && (
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleResume}
                disabled={actionLoading === "resume"}
              >
                {actionLoading === "resume" ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1.5" />
                )}
                Resume Campaign
              </Button>
            )}

            {/* Clone — available for any non-generating status */}
            {campaign.status !== "generating" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClone}
                disabled={actionLoading === "clone"}
              >
                {actionLoading === "clone" ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4 mr-1.5" />
                )}
                Clone
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Posts" value={campaign.total_posts} />
        <StatCard label="Generated" value={campaign.posts_generated} />
        <StatCard label="Approved" value={campaign.posts_approved} />
        <StatCard label="Published" value={campaign.posts_published} />
      </div>

      {/* Credits card */}
      {(creditsEst > 0 || creditsUsed > 0) && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Zap className="h-4 w-4 text-amber-500" />
              Credits
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {creditsUsed} / {creditsEst} used
            </span>
          </div>
          <Progress value={creditsPct} className="h-1.5" />
        </div>
      )}

      {/* ── Generation progress ─────────────────────────────────────────────── */}
      {campaign.status === "generating" && (
        <GenerationProgress campaign={campaign} />
      )}

      {/* ── Posts section ───────────────────────────────────────────────────── */}
      {posts.length > 0 || campaign.status !== "draft" ? (
        <div>
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Posts
            </h2>
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg w-fit flex-wrap">
            {POST_FILTER_TABS.map((tab) => {
              const count =
                tab.value === "all"
                  ? posts.length
                  : tab.value === "pending_generation"
                  ? posts.filter(
                      (p) =>
                        p.status === "pending_generation" ||
                        p.status === "generating"
                    ).length
                  : posts.filter((p) => p.status === tab.value).length;

              return (
                <button
                  key={tab.value}
                  onClick={() => setPostFilter(tab.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    postFilter === tab.value
                      ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`text-[10px] rounded-full px-1.5 py-0.5 font-semibold ${
                        postFilter === tab.value
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bulk actions bar */}
          {generatedPostCount > 0 && campaign.status === "review" && (
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                {generatedPostCount} post
                {generatedPostCount !== 1 ? "s" : ""} ready for review
              </p>
              <Button
                size="sm"
                className="h-8 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                onClick={handleApproveAll}
                disabled={actionLoading === "approve-all"}
              >
                {actionLoading === "approve-all" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                )}
                Approve All {generatedPostCount} Posts
              </Button>
            </div>
          )}

          {/* Posts grid / list */}
          {filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {campaign.status === "generating" ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Content is being generated…
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-400 dark:text-gray-600 text-sm">
                    {postFilter === "all"
                      ? "No posts yet. Generate content to get started."
                      : `No ${postFilter.replace("_", " ")} posts.`}
                  </p>
                </>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  campaignId={id}
                  onApprove={handleApprovePost}
                  onReject={handleRejectPost}
                  onUpdate={handleUpdatePost}
                  onRegenerate={handleRegeneratePost}
                  onPreview={setPreviewPost}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Platform
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Caption
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      Scheduled
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      campaignId={id}
                      onApprove={handleApprovePost}
                      onReject={handleRejectPost}
                      onUpdate={handleUpdatePost}
                      onRegenerate={handleRegeneratePost}
                      onPreview={setPreviewPost}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Empty state for fresh draft campaigns */
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-4">
            <Rocket className="h-8 w-8 text-violet-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Ready to generate content?
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
            Click{" "}
            <span className="font-medium text-violet-600 dark:text-violet-400">
              Generate Content
            </span>{" "}
            to let AI create your posts based on the campaign settings.
          </p>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleGenerate}
            disabled={actionLoading === "generate"}
          >
            {actionLoading === "generate" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4 mr-2" />
            )}
            Generate Content
          </Button>
        </div>
      )}

      {/* Platform Preview Modal */}
      {previewPost && (
        <PlatformPreviewModal
          post={previewPost}
          onClose={() => setPreviewPost(null)}
        />
      )}
    </div>
  );
}
