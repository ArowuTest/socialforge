"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Rocket,
  CheckCircle2,
  Sparkles,
  Instagram,
  Linkedin,
  Twitter,
  Youtube,
  Facebook,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { campaignsApi, brandKitApi, accountsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { BrandKit, CampaignGoal, CreateCampaignRequest } from "@/types";

// ─── constants ───────────────────────────────────────────────────────────────

const GOALS: {
  value: CampaignGoal;
  icon: string;
  label: string;
  desc: string;
}[] = [
  { value: "awareness", icon: "🎯", label: "Awareness", desc: "Reach new audiences and build brand recognition" },
  { value: "engagement", icon: "💬", label: "Engagement", desc: "Drive likes, comments, shares and conversations" },
  { value: "sales", icon: "💰", label: "Sales", desc: "Convert followers into customers" },
  { value: "education", icon: "📚", label: "Education", desc: "Teach your audience and build authority" },
  { value: "event_promotion", icon: "🎉", label: "Event Promotion", desc: "Promote a launch, event or campaign" },
];

const ALL_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter / X" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "pinterest", label: "Pinterest" },
  { value: "threads", label: "Threads" },
  { value: "bluesky", label: "Bluesky" },
];

function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  switch (platform) {
    case "instagram": return <Instagram className={className} />;
    case "linkedin": return <Linkedin className={className} />;
    case "twitter": return <Twitter className={className} />;
    case "youtube": return <Youtube className={className} />;
    case "facebook": return <Facebook className={className} />;
    default: return <Sparkles className={className} />;
  }
}

const CREDIT_COSTS = {
  image: 10,
  video: 50,
  text: 2,
  caption: 1,
};

// ─── types ───────────────────────────────────────────────────────────────────

interface WizardState {
  // Step 1
  name: string;
  goal: CampaignGoal | "";
  brief: string;
  brand_kit_id: string;
  // Step 2
  start_date: string;
  end_date: string;
  platforms: string[];
  posting_frequency: Record<string, number>;
  content_mix: { image: number; video: number; text: number };
  auto_approve: boolean;
  credits_budget_cap: number; // 0 = no cap
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ["Brief", "Settings", "Review & Launch"];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const idx = i + 1;
        const done = idx < step;
        const active = idx === step;
        return (
          <React.Fragment key={idx}>
            <div className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  done
                    ? "bg-violet-600 text-white"
                    : active
                    ? "bg-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-900/40"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : idx}
              </div>
              <span
                className={`text-sm font-medium hidden sm:inline ${
                  active
                    ? "text-gray-900 dark:text-white"
                    : done
                    ? "text-violet-600 dark:text-violet-400"
                    : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {labels[i]}
              </span>
            </div>
            {idx < total && (
              <div
                className={`h-px flex-1 max-w-16 transition-colors ${
                  done ? "bg-violet-400" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step 1: Brief ───────────────────────────────────────────────────────────

interface Step1Props {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  brandKits: BrandKit[];
  brandKitsLoading: boolean;
}

function Step1Brief({ state, onChange, brandKits, brandKitsLoading }: Step1Props) {
  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="campaign-name" className="text-sm font-medium">
          Campaign Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="campaign-name"
          className="mt-1.5"
          placeholder="e.g. Summer Product Launch 2025"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Campaign Goal <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {GOALS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => onChange({ goal: g.value })}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                state.goal === g.value
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700"
              }`}
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">{g.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{g.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{g.desc}</p>
              </div>
              {state.goal === g.value && (
                <CheckCircle2 className="h-4 w-4 text-violet-600 flex-shrink-0 ml-auto" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="campaign-brief" className="text-sm font-medium">
          Content Brief <span className="text-red-500">*</span>
        </Label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-1.5">
          Describe your brand, product, audience, and the tone you want. The more detail, the better the AI content.
        </p>
        <Textarea
          id="campaign-brief"
          className="mt-1 min-h-[160px] text-sm"
          placeholder="e.g. We're a Lagos-based streetwear brand targeting Nigerian Gen Z aged 18–28. We want to launch our summer drop — 5 new graphic tee designs inspired by Afrobeats culture. Tone should be bold, energetic, and culturally relevant. Show product flat-lays, influencer-style lifestyle shots, and behind-the-scenes of the design process."
          value={state.brief}
          onChange={(e) => onChange({ brief: e.target.value })}
        />
        <div className="flex items-center justify-between mt-1">
          <p className={`text-xs ${state.brief.length < 50 && state.brief.length > 0 ? "text-amber-500" : "text-gray-400"}`}>
            {state.brief.length} characters {state.brief.length < 50 ? `(need ${50 - state.brief.length} more)` : "✓"}
          </p>
        </div>
        {/* Example brief starters */}
        {state.brief.length === 0 && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-2">💡 Or start from an example:</p>
            <div className="space-y-2">
              {[
                {
                  label: "Product launch",
                  text: "We're launching a new vitamin C serum for women aged 28–45 interested in anti-aging skincare. We want educational content about vitamin C benefits, behind-the-scenes of the product, and aspirational lifestyle imagery. Tone: premium and confident.",
                },
                {
                  label: "Local restaurant",
                  text: "We're a Lagos-based restaurant specialising in modern Nigerian cuisine. We want to grow our Instagram and TikTok with food close-ups, chef behind-the-scenes, and customer testimonials. Tone: warm, vibrant, and community-focused.",
                },
                {
                  label: "Coaching / service",
                  text: "I'm a business coach helping African entrepreneurs scale their online businesses. I want to post valuable tips about mindset, sales, and digital marketing. Tone: motivational, direct, and practical. 3 posts per week.",
                },
              ].map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => onChange({ brief: ex.text })}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-all"
                >
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
                    {ex.label} →
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{ex.text}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <Label className="text-sm font-medium">Brand Kit</Label>
        {brandKitsLoading ? (
          <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading brand kits...
          </div>
        ) : (
          <>
            <Select
              value={state.brand_kit_id || "none"}
              onValueChange={(v) => onChange({ brand_kit_id: v === "none" ? "" : v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No brand kit — AI will generate generic content</SelectItem>
                {brandKits.map((bk) => (
                  <SelectItem key={bk.id} value={bk.id}>
                    {bk.name} {bk.is_default ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {brandKits.length === 0 && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <Info className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Set up a{" "}
                  <a href="/brand-kit" className="font-medium underline">
                    Brand Kit
                  </a>{" "}
                  for better AI results.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Settings ─────────────────────────────────────────────────────────

interface Step2Props {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  creditBalance: number;
  connectedPlatforms: string[];
}

function Step2Settings({ state, onChange, creditBalance, connectedPlatforms }: Step2Props) {
  const today = new Date().toISOString().split("T")[0];

  function togglePlatform(platform: string) {
    const selected = state.platforms.includes(platform)
      ? state.platforms.filter((p) => p !== platform)
      : [...state.platforms, platform];
    // Remove frequency for deselected platforms
    const freq = { ...state.posting_frequency };
    if (!selected.includes(platform)) {
      delete freq[platform];
    } else {
      freq[platform] = freq[platform] ?? 3;
    }
    onChange({ platforms: selected, posting_frequency: freq });
  }

  function setFrequency(platform: string, value: number) {
    onChange({
      posting_frequency: { ...state.posting_frequency, [platform]: Math.min(7, Math.max(1, value)) },
    });
  }

  function setMix(key: "image" | "video" | "text", value: number) {
    onChange({ content_mix: { ...state.content_mix, [key]: value } });
  }

  const mixSum = state.content_mix.image + state.content_mix.video + state.content_mix.text;
  const mixValid = mixSum === 100;

  // Credit estimate calculation
  const estimatedCredits = React.useMemo(() => {
    if (!state.start_date || !state.end_date || state.platforms.length === 0) return 0;
    const days =
      (new Date(state.end_date).getTime() - new Date(state.start_date).getTime()) /
      (1000 * 60 * 60 * 24);
    const weeks = Math.max(1, days / 7);
    let total = 0;
    for (const p of state.platforms) {
      const postsPerWeek = state.posting_frequency[p] ?? 3;
      const totalPosts = Math.round(postsPerWeek * weeks);
      const imagePosts = Math.round((state.content_mix.image / 100) * totalPosts);
      const videoPosts = Math.round((state.content_mix.video / 100) * totalPosts);
      const textPosts = Math.round((state.content_mix.text / 100) * totalPosts);
      total +=
        imagePosts * CREDIT_COSTS.image +
        videoPosts * CREDIT_COSTS.video +
        textPosts * CREDIT_COSTS.text +
        totalPosts * CREDIT_COSTS.caption;
    }
    return total;
  }, [state.start_date, state.end_date, state.platforms, state.posting_frequency, state.content_mix]);

  const estimatedPosts = React.useMemo(() => {
    if (!state.start_date || !state.end_date || state.platforms.length === 0) return 0;
    const days =
      (new Date(state.end_date).getTime() - new Date(state.start_date).getTime()) /
      (1000 * 60 * 60 * 24);
    const weeks = Math.max(1, days / 7);
    return state.platforms.reduce((sum, p) => {
      return sum + Math.round((state.posting_frequency[p] ?? 3) * weeks);
    }, 0);
  }, [state.start_date, state.end_date, state.platforms, state.posting_frequency]);

  return (
    <div className="space-y-6">
      {/* Date range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start-date" className="text-sm font-medium">Start Date <span className="text-red-500">*</span></Label>
          <Input
            id="start-date"
            type="date"
            className="mt-1.5"
            min={today}
            value={state.start_date}
            onChange={(e) => onChange({ start_date: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="end-date" className="text-sm font-medium">End Date <span className="text-red-500">*</span></Label>
          <Input
            id="end-date"
            type="date"
            className="mt-1.5"
            min={state.start_date || today}
            value={state.end_date}
            onChange={(e) => onChange({ end_date: e.target.value })}
          />
        </div>
      </div>

      {/* Platforms */}
      <div>
        <Label className="text-sm font-medium">Platforms <span className="text-red-500">*</span></Label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
          Only select platforms where you have a connected account — posts to disconnected platforms will fail.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_PLATFORMS.map((p) => {
            const selected = state.platforms.includes(p.value);
            const isConnected = connectedPlatforms.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => togglePlatform(p.value)}
                title={!isConnected ? `You haven't connected a ${p.label} account yet` : undefined}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  selected
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-300 dark:hover:border-violet-700"
                }`}
              >
                <PlatformIcon platform={p.value} className="h-4 w-4" />
                {p.label}
                {selected && <CheckCircle2 className="h-3.5 w-3.5 ml-1" />}
                {!isConnected && (
                  <span className="text-[10px] text-amber-500 font-normal ml-0.5" title="Not connected">⚠</span>
                )}
              </button>
            );
          })}
        </div>
        {/* Warning for selected-but-not-connected platforms */}
        {state.platforms.some((p) => !connectedPlatforms.includes(p)) && (
          <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              You selected{" "}
              <strong>
                {state.platforms.filter((p) => !connectedPlatforms.includes(p)).join(", ")}
              </strong>{" "}
              but {state.platforms.filter((p) => !connectedPlatforms.includes(p)).length === 1 ? "that account is" : "those accounts are"} not connected.{" "}
              <a href="/accounts" className="underline font-medium" target="_blank">
                Connect it now →
              </a>
            </p>
          </div>
        )}
        {connectedPlatforms.length === 0 && (
          <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400">
              You have no connected social accounts. Go to{" "}
              <a href="/accounts" className="underline font-medium" target="_blank">
                Accounts
              </a>{" "}
              first to connect at least one platform before creating a campaign.
            </p>
          </div>
        )}
      </div>

      {/* Posting frequency per platform */}
      {state.platforms.length > 0 && (
        <div>
          <Label className="text-sm font-medium">Posting Frequency</Label>
          <div className="space-y-2 mt-2">
            {state.platforms.map((p) => {
              const plat = ALL_PLATFORMS.find((x) => x.value === p);
              return (
                <div key={p} className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={p} className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {plat?.label ?? p}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-6 w-6 rounded border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                      onClick={() => setFrequency(p, (state.posting_frequency[p] ?? 3) - 1)}
                    >
                      –
                    </button>
                    <span className="w-20 text-center text-sm font-medium text-gray-900 dark:text-white">
                      {state.posting_frequency[p] ?? 3} / week
                    </span>
                    <button
                      type="button"
                      className="h-6 w-6 rounded border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                      onClick={() => setFrequency(p, (state.posting_frequency[p] ?? 3) + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content mix */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-sm font-medium">Content Mix</Label>
          <span className={`text-xs font-medium ${mixValid ? "text-emerald-600" : "text-amber-500"}`}>
            {mixSum}% {!mixValid && `(needs to total 100%)`}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          What percentage of your posts should include AI-generated images, videos, or be text-only captions. Total must equal 100%.
        </p>
        <div className="space-y-3">
          {(
            [
              { key: "image" as const, label: "With image", emoji: "🖼️", hint: "AI generates a matching image for each post" },
              { key: "video" as const, label: "With video", emoji: "🎬", hint: "AI generates a short video clip (uses more credits)" },
              { key: "text" as const, label: "Caption only", emoji: "📝", hint: "Text-only posts — lowest credit cost" },
            ] as const
          ).map(({ key, label, emoji, hint }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="w-28 flex-shrink-0">
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {emoji} {label}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.content_mix[key]}
                  onChange={(e) => setMix(key, Number(e.target.value))}
                  className="flex-1 accent-violet-600"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={state.content_mix[key]}
                  onChange={(e) => setMix(key, Number(e.target.value))}
                  className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <span className="text-sm text-gray-400 w-4">%</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 pl-28">{hint}</p>
            </div>
          ))}
        </div>
        {!mixValid && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Content mix must add up to 100%. Currently at {mixSum}%. Adjust the sliders above.
            </p>
          </div>
        )}
      </div>

      {/* Auto-approve */}
      <div className={`p-4 rounded-xl border-2 transition-colors ${state.auto_approve ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10" : "border-gray-200 dark:border-gray-700"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Auto-publish posts
              {state.auto_approve && (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">ON</span>
              )}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {state.auto_approve
                ? "⚠️ Posts will go live on your social accounts automatically — without you reviewing them first."
                : "When off (recommended): AI generates posts and you review + approve each one before it publishes."}
            </p>
          </div>
          <Switch
            checked={state.auto_approve}
            onCheckedChange={(v) => onChange({ auto_approve: v })}
            className="flex-shrink-0 mt-0.5"
          />
        </div>
        {state.auto_approve && (
          <div className="mt-3 flex items-start gap-2 pt-3 border-t border-amber-200 dark:border-amber-700">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Not recommended for your first campaign.</strong> AI can sometimes generate content that needs tweaking.
              Keep this off to review posts in the Campaigns page before they publish.
            </p>
          </div>
        )}
      </div>
      {/* Credits budget cap */}
      <div>
        <Label htmlFor="credits-budget-cap" className="text-sm font-medium">
          Credits Budget Cap{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </Label>
        <div className="flex items-center gap-2 mt-1.5">
          <Input
            id="credits-budget-cap"
            type="number"
            min={0}
            step={10}
            placeholder="0 = no cap"
            value={state.credits_budget_cap || ""}
            onChange={(e) =>
              onChange({ credits_budget_cap: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-40"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">credits</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Generation stops automatically when this limit is reached. Leave at 0 for unlimited.
        </p>
      </div>

      {/* Credit estimate */}
      {estimatedCredits > 0 && (
        <div className="p-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">
                Credit Estimate
              </p>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                ~{estimatedPosts} posts across {state.platforms.length} platform{state.platforms.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-violet-800 dark:text-violet-300">
                ~{estimatedCredits.toLocaleString()}
              </p>
              <p className="text-xs text-violet-600 dark:text-violet-400">credits</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-violet-200 dark:border-violet-700 text-xs text-violet-600 dark:text-violet-400 space-y-0.5">
            <p>Images: {CREDIT_COSTS.image} cr · Videos: {CREDIT_COSTS.video} cr · Text: {CREDIT_COSTS.text} cr · Caption: {CREDIT_COSTS.caption} cr each</p>
            {creditBalance > 0 && (
              <p className="font-medium">
                You have {creditBalance.toLocaleString()} credits available.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Review ───────────────────────────────────────────────────────────

interface Step3Props {
  state: WizardState;
  brandKits: BrandKit[];
  onSaveDraft: () => void;
  onGenerate: () => void;
  submitting: boolean;
}

function Step3Review({ state, brandKits, onSaveDraft, onGenerate, submitting }: Step3Props) {
  const brandKit = brandKits.find((bk) => bk.id === state.brand_kit_id);
  const goal = GOALS.find((g) => g.value === state.goal);

  const [briefExpanded, setBriefExpanded] = React.useState(false);

  // Recalculate estimates
  const estimatedPosts = React.useMemo(() => {
    if (!state.start_date || !state.end_date || state.platforms.length === 0) return 0;
    const days =
      (new Date(state.end_date).getTime() - new Date(state.start_date).getTime()) /
      (1000 * 60 * 60 * 24);
    const weeks = Math.max(1, days / 7);
    return state.platforms.reduce((sum, p) => {
      return sum + Math.round((state.posting_frequency[p] ?? 3) * weeks);
    }, 0);
  }, [state]);

  const estimatedCredits = React.useMemo(() => {
    if (!state.start_date || !state.end_date || state.platforms.length === 0) return 0;
    const days =
      (new Date(state.end_date).getTime() - new Date(state.start_date).getTime()) /
      (1000 * 60 * 60 * 24);
    const weeks = Math.max(1, days / 7);
    let total = 0;
    for (const p of state.platforms) {
      const postsPerWeek = state.posting_frequency[p] ?? 3;
      const totalPosts = Math.round(postsPerWeek * weeks);
      const imagePosts = Math.round((state.content_mix.image / 100) * totalPosts);
      const videoPosts = Math.round((state.content_mix.video / 100) * totalPosts);
      const textPosts = Math.round((state.content_mix.text / 100) * totalPosts);
      total +=
        imagePosts * CREDIT_COSTS.image +
        videoPosts * CREDIT_COSTS.video +
        textPosts * CREDIT_COSTS.text +
        totalPosts * CREDIT_COSTS.caption;
    }
    return total;
  }, [state]);

  const durationWeeks = React.useMemo(() => {
    if (!state.start_date || !state.end_date) return 0;
    const days =
      (new Date(state.end_date).getTime() - new Date(state.start_date).getTime()) /
      (1000 * 60 * 60 * 24);
    return Math.round(days / 7);
  }, [state.start_date, state.end_date]);

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-4">
      {/* Campaign summary card */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden">
        {/* Name + goal */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Campaign</p>
          <p className="text-base font-semibold text-gray-900 dark:text-white">{state.name}</p>
          {goal && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {goal.icon} {goal.label}
            </p>
          )}
        </div>

        {/* Brief */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Brief</p>
          <p className={`text-sm text-gray-700 dark:text-gray-300 ${briefExpanded ? "" : "line-clamp-3"}`}>
            {state.brief}
          </p>
          {state.brief.length > 200 && (
            <button
              type="button"
              className="text-xs text-violet-600 dark:text-violet-400 mt-1 hover:underline"
              onClick={() => setBriefExpanded((e) => !e)}
            >
              {briefExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {/* Brand kit */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Brand Kit</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {brandKit ? brandKit.name : "None — AI will generate generic content"}
          </p>
        </div>

        {/* Duration */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Duration</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {durationWeeks > 0 ? `${durationWeeks} week${durationWeeks !== 1 ? "s" : ""}` : "Not set"}
            {state.start_date && state.end_date && (
              <span className="text-gray-500 dark:text-gray-400 font-normal ml-2">
                ({fmt(state.start_date)} → {fmt(state.end_date)})
              </span>
            )}
          </p>
        </div>

        {/* Platforms + frequency */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Platforms</p>
          <div className="flex flex-wrap gap-2">
            {state.platforms.map((p) => {
              const plat = ALL_PLATFORMS.find((x) => x.value === p);
              return (
                <div key={p} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs">
                  <PlatformIcon platform={p} className="h-3.5 w-3.5" />
                  <span className="font-medium">{plat?.label ?? p}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{state.posting_frequency[p] ?? 3}×/wk</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content mix */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Content Mix</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "image", label: "Images", emoji: "🖼️" },
              { key: "video", label: "Videos", emoji: "🎬" },
              { key: "text", label: "Text", emoji: "📝" },
            ].map(({ key, label, emoji }) => {
              const val = state.content_mix[key as "image" | "video" | "text"];
              if (val === 0) return null;
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs font-medium">
                  {emoji} {label} {val}%
                </span>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="px-5 py-4 bg-violet-50 dark:bg-violet-900/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-violet-600 dark:text-violet-400">Estimated total posts</p>
              <p className="text-xl font-bold text-violet-800 dark:text-violet-300">{estimatedPosts}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-violet-600 dark:text-violet-400">Estimated credits</p>
              <p className="text-xl font-bold text-violet-800 dark:text-violet-300">
                ~{estimatedCredits.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onSaveDraft}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save as Draft
        </Button>
        <Button
          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold"
          onClick={onGenerate}
          disabled={submitting}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Rocket className="h-4 w-4 mr-2" />
          )}
          Generate Now
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DEFAULT_STATE: WizardState = {
  name: "",
  goal: "",
  brief: "",
  brand_kit_id: "",
  start_date: "",
  end_date: "",
  platforms: [],
  posting_frequency: {},
  content_mix: { image: 60, video: 20, text: 20 },
  auto_approve: false,
  credits_budget_cap: 0,
};

export default function NewCampaignPage() {
  const router = useRouter();
  const { workspace } = useAuthStore();
  const [step, setStep] = React.useState(1);
  const [state, setState] = React.useState<WizardState>(DEFAULT_STATE);
  const [brandKits, setBrandKits] = React.useState<BrandKit[]>([]);
  const [brandKitsLoading, setBrandKitsLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [connectedPlatforms, setConnectedPlatforms] = React.useState<string[]>([]);

  // Real credit balance from authenticated workspace — avoids a redundant API call.
  const creditBalance = (workspace?.ai_credits_limit ?? 0) - (workspace?.ai_credits_used ?? 0);

  React.useEffect(() => {
    Promise.all([
      brandKitApi.list().catch(() => null),
      accountsApi.list().catch(() => null),
    ]).then(([bkRes, accRes]) => {
      setBrandKits(bkRes?.data ?? []);
      const grouped = (accRes?.data ?? {}) as Record<string, Array<{ platform: string; is_active?: boolean; token_expired?: boolean }>>;
      const active = Object.values(grouped)
        .flat()
        .filter((a) => a.is_active !== false && !a.token_expired)
        .map((a) => a.platform);
      setConnectedPlatforms(active);
    }).finally(() => setBrandKitsLoading(false));
  }, []);

  function patch(p: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...p }));
  }

  // ── Validation ───────────────────────────────────────────────────────────
  function validateStep1(): string | null {
    if (!state.name.trim()) return "Campaign name is required.";
    if (!state.goal) return "Please select a campaign goal.";
    if (state.brief.trim().length < 50) return "Brief must be at least 50 characters.";
    return null;
  }

  function validateStep2(): string | null {
    if (!state.start_date) return "Start date is required.";
    if (!state.end_date) return "End date is required.";
    if (new Date(state.end_date) <= new Date(state.start_date)) {
      return "End date must be after start date.";
    }
    if (state.platforms.length === 0) return "Select at least one platform.";
    const sum = state.content_mix.image + state.content_mix.video + state.content_mix.text;
    if (sum !== 100) return `Content mix must equal 100% (currently ${sum}%).`;
    return null;
  }

  function handleNext() {
    if (step === 1) {
      const err = validateStep1();
      if (err) { toast.error(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { toast.error(err); return; }
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1));
  }

  function buildRequest(): CreateCampaignRequest {
    return {
      name: state.name.trim(),
      goal: state.goal || undefined,
      brief: state.brief.trim(),
      brand_kit_id: state.brand_kit_id || undefined,
      start_date: state.start_date || undefined,
      end_date: state.end_date || undefined,
      platforms: state.platforms,
      posting_frequency: state.posting_frequency,
      content_mix: {
        image: state.content_mix.image,
        video: state.content_mix.video,
        text: state.content_mix.text,
      },
      auto_approve: state.auto_approve,
      credits_budget_cap: state.credits_budget_cap > 0 ? state.credits_budget_cap : undefined,
    };
  }

  async function handleSaveDraft() {
    setSubmitting(true);
    try {
      await campaignsApi.create(buildRequest());
      toast.success("Campaign saved as draft.");
      router.push("/campaigns");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateNow() {
    setSubmitting(true);
    let campaignId: string | null = null;
    try {
      const created = await campaignsApi.create(buildRequest());
      campaignId = created.data.id;
      await campaignsApi.generate(campaignId);
      toast.success("Campaign created! AI is generating your content calendar.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start campaign generation";
      toast.error(msg);
    } finally {
      setSubmitting(false);
      // Always redirect to the campaign page so the user can retry / top up credits.
      if (campaignId) router.push(`/campaigns/${campaignId}`);
    }
  }

  // Animate between steps with a key
  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back to campaigns */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6 transition-colors"
        onClick={() => router.push("/campaigns")}
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Campaigns
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Campaign</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Tell the AI what you need — it handles the rest.
        </p>
      </div>

      <StepIndicator step={step} total={3} />

      {/* Step content */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        {step === 1 && (
          <Step1Brief
            state={state}
            onChange={patch}
            brandKits={brandKits}
            brandKitsLoading={brandKitsLoading}
          />
        )}
        {step === 2 && (
          <Step2Settings
            state={state}
            onChange={patch}
            creditBalance={creditBalance}
            connectedPlatforms={connectedPlatforms}
          />
        )}
        {step === 3 && (
          <Step3Review
            state={state}
            brandKits={brandKits}
            onSaveDraft={handleSaveDraft}
            onGenerate={handleGenerateNow}
            submitting={submitting}
          />
        )}
      </div>

      {/* Navigation */}
      {step < 3 && (
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-2"
            onClick={handleNext}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {step === 3 && (
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
