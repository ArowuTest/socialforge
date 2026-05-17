"use client";

/**
 * SmartComposePanel — side panel surfaced inside the compose page that gives
 * the author data-driven guidance while they write:
 *
 *   1. Per-platform character-count indicator (warns when over a platform's
 *      hard limit — Twitter 280, Bluesky 300, Threads 500).
 *   2. Hashtag group picker — click a saved group to append its hashtags to
 *      the caption. Closes the loop on Phase 3 #4.
 *   3. Best-time-to-post recommendations from /insights/best-times — falls
 *      back gracefully when there's no engagement data yet.
 *
 * The panel is a controlled component: it doesn't own caption state, the
 * parent compose page does and passes it in plus an onAppend callback.
 */

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Clock, Hash, AlertCircle, CheckCircle2, Loader2, Sparkles, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hashtagGroupsApi, insightsApi, aiApi } from "@/lib/api";
import type { HashtagGroup, ViralAnalysis } from "@/types";

// Hard character limits enforced by each platform's API. Soft limits (where
// captions get truncated in feed preview) are looser but the hard limit is
// what makes a publish actually fail.
const PLATFORM_HARD_LIMITS: Record<string, number> = {
  twitter: 280,
  bluesky: 300,
  threads: 500,
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  tiktok: 2200,
  youtube: 5000,
  pinterest: 500,
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number): string {
  // 24h -> "2pm" / "11am"; handles UTC -> local conversion would be nicer
  // but the backend already stores UTC so this matches what was queried.
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

interface SmartComposePanelProps {
  caption: string;
  selectedPlatforms: string[];
  /** Called when the user clicks a hashtag-group chip — parent appends to caption. */
  onAppendHashtags: (hashtags: string[]) => void;
}

export function SmartComposePanel({
  caption,
  selectedPlatforms,
  onAppendHashtags,
}: SmartComposePanelProps) {
  // Use the first selected platform as the basis for best-time query — most
  // users post to one primary platform anyway.
  const primaryPlatform = selectedPlatforms[0];

  const { data: groupsData } = useQuery({
    queryKey: ["hashtag-groups"],
    queryFn: () => hashtagGroupsApi.list(),
  });
  const groups: HashtagGroup[] = groupsData?.data ?? [];

  const { data: timesData, isLoading: timesLoading } = useQuery({
    queryKey: ["insights-best-times", primaryPlatform ?? "all"],
    queryFn: () => insightsApi.bestTimes({ platform: primaryPlatform, days: 90 }),
    enabled: !!primaryPlatform,
  });
  const times = timesData?.data;

  return (
    <div className="space-y-4">
      {/* Character-count indicator — one row per selected platform */}
      {selectedPlatforms.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Character limits
          </h3>
          <ul className="space-y-2">
            {selectedPlatforms.map((p) => {
              const limit = PLATFORM_HARD_LIMITS[p] ?? Infinity;
              const len = [...caption].length; // codepoint count (emoji-safe)
              const over = len > limit;
              const pct = Math.min(100, (len / limit) * 100);
              return (
                <li key={p} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize">{p}</span>
                    <span
                      className={
                        over
                          ? "font-medium text-red-600"
                          : pct > 90
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      }
                    >
                      {len.toLocaleString()} / {limit.toLocaleString()}
                      {over && " — over limit"}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${
                        over ? "bg-red-500" : pct > 90 ? "bg-amber-500" : "bg-violet-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Hashtag-group picker — closes the loop on Phase 3 #4 */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />
            Hashtag groups
          </span>
          <a
            href="/hashtag-groups"
            className="text-[10px] font-normal normal-case text-violet-600 hover:underline"
          >
            Manage →
          </a>
        </h3>
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Save reusable hashtag bundles to insert in one click.{" "}
            <a href="/hashtag-groups" className="text-violet-600 hover:underline">
              Create a group →
            </a>
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onAppendHashtags(g.hashtags)}
                title={g.hashtags.join(" ")}
                className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50"
              >
                + {g.name}
                <span className="ml-1 text-[10px] opacity-60">({g.hashtags.length})</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Best-time-to-post recommendations */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Best times {primaryPlatform && `(${primaryPlatform})`}
        </h3>
        {!primaryPlatform ? (
          <p className="text-xs text-muted-foreground">
            Select a platform to see your best posting times.
          </p>
        ) : timesLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : times && times.slots.length > 0 ? (
          <ul className="space-y-1.5">
            {times.slots.slice(0, 3).map((s, i) => (
              <li
                key={`${s.day_of_week}-${s.hour_of_day}`}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-medium">
                  {i === 0 && (
                    <Sparkles className="mr-1 inline h-3 w-3 text-amber-500" />
                  )}
                  {DAYS_OF_WEEK[s.day_of_week]} {formatHour(s.hour_of_day)}
                </span>
                <span className="text-muted-foreground">
                  {s.multiplier > 0 && `${s.multiplier.toFixed(1)}× avg`}
                  <span className="ml-2 text-[10px] opacity-60">
                    n={s.sample_size}
                  </span>
                </span>
              </li>
            ))}
            <li className="pt-1 text-[10px] text-muted-foreground">
              Based on last {times.window_days} days, UTC. Top {Math.min(3, times.slots.length)} of {times.slots.length} slots.
            </li>
          </ul>
        ) : (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              {times?.note ??
                "Not enough engagement data yet. Publish a few posts and check back."}
            </p>
          </div>
        )}
      </Card>

      {/* AI predicted engagement — manual trigger, ~2 credits per analysis */}
      <PredictedEngagementCard
        caption={caption}
        primaryPlatform={primaryPlatform}
      />

      {/* Quality bar — quick at-a-glance signals */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Caption quality
        </h3>
        <QualityChecks caption={caption} />
      </Card>
    </div>
  );
}

// ── Predicted engagement (AI-scored) ─────────────────────────────────────────

function PredictedEngagementCard({
  caption,
  primaryPlatform,
}: {
  caption: string;
  primaryPlatform: string | undefined;
}) {
  // Track which caption snapshot the current score was computed for so we
  // can tell the user "out of date — re-score" when they edit after scoring.
  const [scoredCaption, setScoredCaption] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<ViralAnalysis | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      aiApi.analyseViral({
        content: caption.trim(),
        platform: primaryPlatform ?? "instagram",
      }),
    onSuccess: (res) => {
      if (res?.data) {
        setAnalysis(res.data);
        setScoredCaption(caption);
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      toast.error(
        msg.includes("INSUFFICIENT_CREDITS")
          ? "Out of AI credits"
          : msg.includes("VALIDATION_ERROR")
          ? "Write a caption first"
          : msg,
      );
    },
  });

  const canScore =
    caption.trim().length >= 10 && !!primaryPlatform && !mut.isPending;
  const stale = analysis !== null && caption !== scoredCaption;

  // Map 0-100 score to a colour bucket so the badge reads at a glance.
  const scoreColour = (s: number) =>
    s >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : s >= 60
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  const bgColour = (s: number) =>
    s >= 80
      ? "bg-emerald-500"
      : s >= 60
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Predicted engagement
        </span>
        <span className="text-[10px] font-normal normal-case opacity-60">~2 cr</span>
      </h3>

      {!analysis ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            AI-scored prediction with strengths & improvement suggestions for this platform.
          </p>
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={!canScore}
            className="w-full"
            title={
              !primaryPlatform
                ? "Select a platform first"
                : caption.trim().length < 10
                ? "Write at least 10 characters"
                : undefined
            }
          >
            {mut.isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Scoring…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Score this draft
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Score + grade */}
          <div className="flex items-center gap-3">
            <div className={`text-3xl font-bold leading-none ${scoreColour(analysis.score)}`}>
              {analysis.score}
              <span className="ml-1 text-base font-medium text-muted-foreground">/100</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{analysis.grade}</p>
              {analysis.estimated_reach && (
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <TrendingUp className="h-2.5 w-2.5" />
                  {analysis.estimated_reach}
                </p>
              )}
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${bgColour(analysis.score)}`}
              style={{ width: `${Math.min(100, analysis.score)}%` }}
            />
          </div>

          {/* Strengths */}
          {analysis.strengths?.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Strengths
              </p>
              <ul className="space-y-0.5 text-xs">
                {analysis.strengths.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {analysis.improvements?.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Improvements
              </p>
              <ul className="space-y-0.5 text-xs">
                {analysis.improvements.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Stale notice + rescore */}
          {stale && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              Caption changed since this score — re-run to refresh.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => mut.mutate()}
            disabled={!canScore}
            className="w-full"
          >
            {mut.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-3.5 w-3.5" />
            )}
            {stale ? "Re-score" : "Score again"}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Quality checks ───────────────────────────────────────────────────────────

function QualityChecks({ caption }: { caption: string }) {
  const length = [...caption].length;
  const hashtagCount = (caption.match(/#[A-Za-z0-9_]+/g) ?? []).length;
  const hasHook = length > 0 && firstSentenceWordCount(caption) <= 12;
  const emojiCount = countEmoji(caption);

  const checks = [
    {
      ok: length >= 30,
      label: length >= 30 ? "Has substance (30+ chars)" : "Too short — aim for 30+ characters",
    },
    {
      ok: hasHook,
      label: hasHook
        ? "Strong hook (≤12 words in first sentence)"
        : "Tighten the opening — first sentence should be ≤12 words",
    },
    {
      ok: hashtagCount >= 1 && hashtagCount <= 10,
      label:
        hashtagCount === 0
          ? "Add 1-10 hashtags"
          : hashtagCount > 10
          ? `${hashtagCount} hashtags — consider trimming to ≤10`
          : `${hashtagCount} hashtag${hashtagCount === 1 ? "" : "s"} ✓`,
    },
    {
      ok: emojiCount >= 1 && emojiCount <= 8,
      label:
        emojiCount === 0
          ? "Consider adding an emoji for visual hook"
          : emojiCount > 8
          ? `${emojiCount} emoji — might feel spammy`
          : `${emojiCount} emoji ✓`,
    },
  ];

  return (
    <ul className="space-y-1.5 text-xs">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span
            className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
              c.ok ? "bg-emerald-500" : "bg-amber-400"
            }`}
          />
          <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
        </li>
      ))}
    </ul>
  );
}

function firstSentenceWordCount(s: string): number {
  const first = s.split(/[.!?\n]/)[0] ?? "";
  return first.trim().split(/\s+/).filter(Boolean).length;
}

function countEmoji(s: string): number {
  // Loose count — matches the basic emoji range. Good enough for guidance.
  const matches = s.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  return matches ? matches.length : 0;
}
