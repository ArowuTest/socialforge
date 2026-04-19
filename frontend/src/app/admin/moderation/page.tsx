"use client";

import * as React from "react";
import {
  Shield, Plus, X, Save, AlertTriangle, CheckCircle2,
  Filter, Search, RefreshCw, Ban, Eye, Flag, MessageSquare,
  ToggleLeft, ToggleRight, ChevronDown, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────
type TabId = "blocklist" | "filters" | "flagged";

type SafetyFilter = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

type FlaggedItem = {
  id: string;
  workspace: string;
  type: "caption" | "image" | "campaign";
  content: string;
  reason: string;
  flaggedAt: string;
  status: "pending" | "approved" | "rejected";
};

// ── Default safety filters ────────────────────────────────────────────────
const DEFAULT_FILTERS: SafetyFilter[] = [
  {
    key: "block_explicit",
    label: "Block explicit content",
    description: "Prevent AI from generating sexually explicit or adult-only content in captions and image prompts.",
    enabled: true,
  },
  {
    key: "block_hate_speech",
    label: "Block hate speech",
    description: "Filter captions and content containing discriminatory language targeting protected groups.",
    enabled: true,
  },
  {
    key: "block_violence",
    label: "Block violent content",
    description: "Prevent generation of content promoting or glorifying violence.",
    enabled: true,
  },
  {
    key: "block_spam",
    label: "Block spam patterns",
    description: "Detect and block repetitive, misleading, or spam-like caption patterns.",
    enabled: true,
  },
  {
    key: "require_review_autopilot",
    label: "Require human review for Autopilot posts",
    description: "All AI-generated campaign posts must be manually approved before publishing.",
    enabled: false,
  },
  {
    key: "flag_competitor_mentions",
    label: "Flag competitor brand mentions",
    description: "Automatically flag AI-generated content that mentions competitor brand names.",
    enabled: false,
  },
];

// ── Mock flagged content (replace with real API when backend supports it) ─
const MOCK_FLAGGED: FlaggedItem[] = [
  {
    id: "f1",
    workspace: "TechBrand Inc.",
    type: "caption",
    content: "This product is absolutely the best and beats all competitors...",
    reason: "Spam pattern detected",
    flaggedAt: "2026-04-19T08:23:00Z",
    status: "pending",
  },
  {
    id: "f2",
    workspace: "Digital Agency Co.",
    type: "image",
    content: "Image prompt: generate a photo of person holding gun...",
    reason: "Violence filter triggered",
    flaggedAt: "2026-04-18T14:10:00Z",
    status: "rejected",
  },
];

export default function ModerationPage() {
  const [tab, setTab] = React.useState<TabId>("blocklist");

  // ── Keyword blocklist state ───────────────────────────────────────────
  const [keywords, setKeywords] = React.useState<string[]>([]);
  const [newKeyword, setNewKeyword] = React.useState("");
  const [keywordsLoading, setKeywordsLoading] = React.useState(true);
  const [keywordsSaving, setKeywordsSaving] = React.useState(false);

  // ── Safety filters state ──────────────────────────────────────────────
  const [filters, setFilters] = React.useState<SafetyFilter[]>(DEFAULT_FILTERS);
  const [filtersSaving, setFiltersSaving] = React.useState(false);

  // ── Flagged content state ─────────────────────────────────────────────
  const [flagged] = React.useState<FlaggedItem[]>(MOCK_FLAGGED);
  const [flagSearch, setFlagSearch] = React.useState("");

  // Load keywords and safety filters from platform_settings on mount
  React.useEffect(() => {
    adminApi.getPlatformSettings()
      .then((res) => {
        const settings = (res as { data?: Record<string, string> })?.data ?? {};

        // Keyword blocklist
        const kwVal = settings["moderation_keyword_blocklist"];
        if (kwVal) {
          try {
            const parsed = JSON.parse(kwVal);
            if (Array.isArray(parsed)) setKeywords(parsed);
          } catch { /* ignore */ }
        }

        // Safety filters
        const filterVal = settings["moderation_safety_filters"];
        if (filterVal) {
          try {
            const parsed = JSON.parse(filterVal) as Record<string, boolean>;
            setFilters((prev) =>
              prev.map((f) => ({ ...f, enabled: parsed[f.key] ?? f.enabled }))
            );
          } catch { /* ignore */ }
        }
      })
      .catch(() => { /* settings not yet set — start with defaults */ })
      .finally(() => setKeywordsLoading(false));
  }, []);

  // Add keyword
  const handleAddKeyword = () => {
    const kw = newKeyword.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) return;
    setKeywords((prev) => [...prev, kw]);
    setNewKeyword("");
  };

  // Remove keyword
  const handleRemoveKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  // Save keywords
  const handleSaveKeywords = async () => {
    setKeywordsSaving(true);
    try {
      await adminApi.updatePlatformSetting(
        "moderation_keyword_blocklist",
        JSON.stringify(keywords)
      );
      toast.success("Keyword blocklist saved");
    } catch {
      toast.error("Failed to save blocklist");
    } finally {
      setKeywordsSaving(false);
    }
  };

  // Toggle safety filter
  const handleToggleFilter = (key: string) => {
    setFilters((prev) =>
      prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f))
    );
  };

  // Save safety filters
  const handleSaveFilters = async () => {
    setFiltersSaving(true);
    try {
      const obj = Object.fromEntries(filters.map((f) => [f.key, f.enabled]));
      await adminApi.updatePlatformSetting(
        "moderation_safety_filters",
        JSON.stringify(obj)
      );
      toast.success("Safety filters saved");
    } catch {
      toast.error("Failed to save filters");
    } finally {
      setFiltersSaving(false);
    }
  };

  const filteredFlagged = flagged.filter(
    (f) =>
      f.workspace.toLowerCase().includes(flagSearch.toLowerCase()) ||
      f.content.toLowerCase().includes(flagSearch.toLowerCase()) ||
      f.reason.toLowerCase().includes(flagSearch.toLowerCase())
  );

  const pendingCount = flagged.filter((f) => f.status === "pending").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-400" />
            Content Moderation
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage keyword blocklists, AI safety filters, and review flagged content.
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700/50 text-amber-400 text-sm font-medium px-3 py-1.5 rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            {pendingCount} item{pendingCount > 1 ? "s" : ""} need review
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-xl p-1 w-fit border border-slate-800">
        {(["blocklist", "filters", "flagged"] as TabId[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all relative",
              tab === t
                ? "bg-violet-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            {t === "blocklist" && "Keyword Blocklist"}
            {t === "filters" && "Safety Filters"}
            {t === "flagged" && (
              <span className="flex items-center gap-2">
                Flagged Content
                {pendingCount > 0 && (
                  <span className="h-4 w-4 rounded-full bg-amber-500 text-[10px] font-bold text-white flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Keyword Blocklist ─────────────────────────────────────────── */}
      {tab === "blocklist" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Keyword Blocklist</h2>
            <p className="text-xs text-slate-400">
              AI-generated content containing these words or phrases will be automatically blocked or flagged for review.
              Case-insensitive. Partial matches apply.
            </p>
          </div>

          {/* Add keyword */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter a word or phrase to block..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              onClick={handleAddKeyword}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {/* Keyword chips */}
          {keywordsLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading blocklist...
            </div>
          ) : keywords.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Ban className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No blocked keywords yet. Add words or phrases above.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 bg-red-900/20 border border-red-800/40 text-red-400 text-xs font-medium px-3 py-1.5 rounded-full"
                >
                  <Ban className="h-3 w-3" />
                  {kw}
                  <button
                    onClick={() => handleRemoveKeyword(kw)}
                    className="hover:text-red-200 transition-colors ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Save */}
          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-500">{keywords.length} keyword{keywords.length !== 1 ? "s" : ""} blocked</p>
            <button
              onClick={handleSaveKeywords}
              disabled={keywordsSaving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {keywordsSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Blocklist
            </button>
          </div>
        </div>
      )}

      {/* ── Safety Filters ────────────────────────────────────────────── */}
      {tab === "filters" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white mb-1">AI Safety Filters</h2>
              <p className="text-xs text-slate-400">
                Control what types of content the AI is allowed to generate. Changes apply to all new AI generations platform-wide.
              </p>
            </div>
            <button
              onClick={handleSaveFilters}
              disabled={filtersSaving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
            >
              {filtersSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Filters
            </button>
          </div>

          <div className="space-y-3">
            {filters.map((filter) => (
              <div
                key={filter.key}
                className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50"
              >
                <button
                  onClick={() => handleToggleFilter(filter.key)}
                  className={cn(
                    "relative flex-shrink-0 h-6 w-11 rounded-full transition-colors mt-0.5",
                    filter.enabled ? "bg-violet-600" : "bg-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                      filter.enabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{filter.label}</p>
                    {filter.enabled ? (
                      <span className="text-xs bg-green-900/30 border border-green-800/40 text-green-400 px-2 py-0.5 rounded-full">On</span>
                    ) : (
                      <span className="text-xs bg-slate-800 border border-slate-700 text-slate-500 px-2 py-0.5 rounded-full">Off</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{filter.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-lg bg-amber-900/10 border border-amber-800/30 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/80">
              Disabling safety filters may allow AI to generate content that violates platform terms of service or social media community guidelines. Use with caution.
            </p>
          </div>
        </div>
      )}

      {/* ── Flagged Content ───────────────────────────────────────────── */}
      {tab === "flagged" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          {/* Search bar */}
          <div className="p-4 border-b border-slate-800 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search flagged items..."
                value={flagSearch}
                onChange={(e) => setFlagSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Table */}
          {filteredFlagged.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Flag className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No flagged content</p>
              <p className="text-xs mt-1">AI-generated content that triggers safety filters will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filteredFlagged.map((item) => (
                <div key={item.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
                          item.type === "caption"
                            ? "bg-blue-900/30 border border-blue-800/40 text-blue-400"
                            : item.type === "image"
                            ? "bg-purple-900/30 border border-purple-800/40 text-purple-400"
                            : "bg-green-900/30 border border-green-800/40 text-green-400"
                        )}>
                          {item.type}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">{item.workspace}</span>
                        <span className="text-xs text-slate-600">
                          {new Date(item.flaggedAt).toLocaleDateString("en-GB", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 truncate mb-1">{item.content}</p>
                      <div className="flex items-center gap-1.5 text-xs text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {item.reason}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.status === "pending" ? (
                        <>
                          <button className="flex items-center gap-1 px-3 py-1.5 bg-green-900/30 hover:bg-green-900/50 border border-green-800/40 text-green-400 text-xs font-medium rounded-lg transition-colors">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button className="flex items-center gap-1 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 text-red-400 text-xs font-medium rounded-lg transition-colors">
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className={cn(
                          "text-xs font-medium px-2.5 py-1 rounded-full capitalize",
                          item.status === "approved"
                            ? "bg-green-900/20 text-green-400 border border-green-800/30"
                            : "bg-red-900/20 text-red-400 border border-red-800/30"
                        )}>
                          {item.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 border-t border-slate-800 text-xs text-slate-500 text-center">
            Showing {filteredFlagged.length} of {flagged.length} flagged items · Real-time flagging requires backend webhook integration
          </div>
        </div>
      )}
    </div>
  );
}
