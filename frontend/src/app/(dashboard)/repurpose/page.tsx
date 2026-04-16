"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { repurposeApi } from "@/lib/api";
import {
  Link,
  Youtube,
  Music,
  FileText,
  Upload,
  RefreshCw,
  Copy,
  Calendar,
  BookTemplate,
  ChevronDown,
  ChevronUp,
  Check,
  Instagram,
  Linkedin,
  Twitter,
  Facebook,
} from "lucide-react";

type InputTab = "url" | "youtube" | "tiktok" | "text" | "pdf";
type PlatformTab =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "twitter"
  | "facebook"
  | "pinterest"
  | "threads"
  | "bluesky";

const inputTabs: { id: InputTab; label: string; icon: React.ElementType }[] = [
  { id: "url", label: "URL", icon: Link },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "tiktok", label: "TikTok", icon: Music },
  { id: "text", label: "Text", icon: FileText },
  { id: "pdf", label: "PDF Upload", icon: Upload },
];

const platformTabs: { id: PlatformTab; label: string; color: string; charLimit: number }[] = [
  { id: "instagram", label: "Instagram", color: "bg-pink-500", charLimit: 2200 },
  { id: "tiktok", label: "TikTok", color: "bg-black", charLimit: 2200 },
  { id: "youtube", label: "YouTube", color: "bg-red-500", charLimit: 5000 },
  { id: "linkedin", label: "LinkedIn", color: "bg-blue-700", charLimit: 3000 },
  { id: "twitter", label: "Twitter", color: "bg-sky-500", charLimit: 280 },
  { id: "facebook", label: "Facebook", color: "bg-blue-600", charLimit: 63206 },
  { id: "pinterest", label: "Pinterest", color: "bg-red-600", charLimit: 500 },
  { id: "threads", label: "Threads", color: "bg-gray-900", charLimit: 500 },
  { id: "bluesky", label: "Bluesky", color: "bg-sky-500", charLimit: 300 },
];

const emptyPlatformContent: Record<PlatformTab, string> = {
  instagram: "", tiktok: "", youtube: "", linkedin: "",
  twitter: "", facebook: "", pinterest: "", threads: "", bluesky: "",
};

function PlatformIcon({ platform }: { platform: PlatformTab }) {
  const icons: Record<PlatformTab, React.ReactNode> = {
    instagram: <Instagram className="h-4 w-4 text-white" />,
    tiktok: <Music className="h-4 w-4 text-white" />,
    youtube: <Youtube className="h-4 w-4 text-white" />,
    linkedin: <Linkedin className="h-4 w-4 text-white" />,
    twitter: <Twitter className="h-4 w-4 text-white" />,
    facebook: <Facebook className="h-4 w-4 text-white" />,
    pinterest: <span className="text-white text-xs font-bold">P</span>,
    threads: <span className="text-white text-xs font-bold">@</span>,
    bluesky: <span className="text-white text-xs font-bold">B</span>,
  };
  const color = platformTabs.find((p) => p.id === platform)?.color ?? "bg-gray-500";
  return (
    <div className={cn("h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0", color)}>
      {icons[platform]}
    </div>
  );
}

export default function RepurposePage() {
  const [activeInputTab, setActiveInputTab] = React.useState<InputTab>("url");
  const [activePlatformTab, setActivePlatformTab] = React.useState<PlatformTab>("instagram");
  const [urlInput, setUrlInput] = React.useState("");
  const [youtubeInput, setYoutubeInput] = React.useState("");
  const [tiktokInput, setTiktokInput] = React.useState("");
  const [textInput, setTextInput] = React.useState("");
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = React.useState(false);
  const [tone, setTone] = React.useState("Professional");
  const [targetAudience, setTargetAudience] = React.useState("");
  const [addCTAs, setAddCTAs] = React.useState(true);
  const [addHashtags, setAddHashtags] = React.useState(true);
  const [includeEmoji, setIncludeEmoji] = React.useState(true);
  const [copiedPlatform, setCopiedPlatform] = React.useState<PlatformTab | null>(null);
  const [platformContent, setPlatformContent] = React.useState<Record<PlatformTab, string>>(emptyPlatformContent);
  const [repurposeError, setRepurposeError] = React.useState<string | null>(null);

  const handleRepurpose = async () => {
    // Determine source type and content from the active tab
    let sourceType: "url" | "youtube" | "tiktok" | "text";
    let sourceUrl = "";
    let sourceText = "";

    switch (activeInputTab) {
      case "url":
        if (!urlInput.trim()) return;
        sourceType = "url";
        sourceUrl = urlInput.trim();
        break;
      case "youtube":
        if (!youtubeInput.trim()) return;
        sourceType = "youtube";
        sourceUrl = youtubeInput.trim();
        break;
      case "tiktok":
        if (!tiktokInput.trim()) return;
        sourceType = "tiktok";
        sourceUrl = tiktokInput.trim();
        break;
      case "text":
      case "pdf":
      default:
        if (!textInput.trim()) return;
        sourceType = "text";
        sourceText = textInput.trim();
        break;
    }

    setIsProcessing(true);
    setIsComplete(false);
    setRepurposeError(null);

    try {
      const res = await repurposeApi.repurposeContent({
        source_type: sourceType,
        ...(sourceUrl && { source_url: sourceUrl }),
        ...(sourceText && { source_text: sourceText }),
        platforms: platformTabs.map((p) => p.id),
        tone: tone.toLowerCase(),
        include_hashtags: addHashtags,
        include_cta: addCTAs,
        include_emoji: includeEmoji,
      });

      const updated: Record<PlatformTab, string> = { ...emptyPlatformContent };
      for (const [platform, draft] of Object.entries(res.platforms)) {
        const p = platform as PlatformTab;
        let content = draft.content ?? "";
        if (addHashtags && draft.hashtags?.length > 0) {
          content += "\n\n" + draft.hashtags.join(" ");
        }
        updated[p] = content;
      }
      setPlatformContent(updated);
      setIsComplete(true);
    } catch (err) {
      setRepurposeError(err instanceof Error ? err.message : "Repurpose failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = (platform: PlatformTab) => {
    navigator.clipboard.writeText(platformContent[platform]).catch(() => {});
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  };

  const currentPlatform = platformTabs.find((p) => p.id === activePlatformTab)!;
  const charCount = platformContent[activePlatformTab].length;
  const isOverLimit = charCount > currentPlatform.charLimit;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0">
        {/* Left Panel */}
        <div className="w-full lg:w-[420px] lg:flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Content Input
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Paste a URL, YouTube link, TikTok URL, or text to repurpose
              </p>
            </div>

            {/* Input Tab Switcher */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {inputTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveInputTab(tab.id)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-md text-xs font-medium transition-all",
                    activeInputTab === tab.id
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Input Content */}
            <div className="space-y-3">
              {activeInputTab === "url" && (
                <>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/article"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white flex-shrink-0">
                      Extract
                    </Button>
                  </div>
                  {/* Preview Card */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                      <Link className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="p-3">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full mb-1" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-5/6" />
                      <p className="text-xs text-gray-400 mt-2">Enter a URL above to preview content</p>
                    </div>
                  </div>
                </>
              )}

              {activeInputTab === "youtube" && (
                <>
                  <input
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    value={youtubeInput}
                    onChange={(e) => setYoutubeInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="h-36 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/20 flex items-center justify-center">
                      <Youtube className="h-10 w-10 text-red-500" />
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transcript Preview</p>
                      <div className="space-y-1">
                        {[..."   "].map((_, i) => (
                          <div key={i} className="h-3 bg-gray-100 dark:bg-gray-800 rounded" style={{ width: `${75 + i * 8}%` }} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Paste a YouTube URL to extract transcript</p>
                    </div>
                  </div>
                </>
              )}

              {activeInputTab === "tiktok" && (
                <>
                  <input
                    type="url"
                    placeholder="https://tiktok.com/@user/video/..."
                    value={tiktokInput}
                    onChange={(e) => setTiktokInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded-full bg-black flex items-center justify-center">
                        <Music className="h-3 w-3 text-white" />
                      </div>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">TikTok Caption Preview</span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-4/5" />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Paste a TikTok URL to extract caption</p>
                  </div>
                </>
              )}

              {activeInputTab === "text" && (
                <textarea
                  placeholder="Paste your article, blog post, or any text content here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              )}

              {activeInputTab === "pdf" && (
                <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
                  <Upload className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Drag & drop your PDF here
                  </p>
                  <p className="text-xs text-gray-400 mb-3">or click to browse</p>
                  <Button size="sm" variant="outline" className="text-xs">
                    Browse Files
                  </Button>
                  <p className="text-xs text-gray-400 mt-3">Supports PDF, max 50MB</p>
                </div>
              )}
            </div>

            {/* AI Settings Collapsible */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setAiSettingsOpen(!aiSettingsOpen)}
                className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span>AI Settings</span>
                {aiSettingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {aiSettingsOpen && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  {/* Tone */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tone</label>
                    <div className="flex flex-wrap gap-1.5">
                      {["Professional", "Casual", "Humorous", "Inspirational"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTone(t)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                            tone === t
                              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Target Audience */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Audience</label>
                    <input
                      type="text"
                      placeholder="e.g. Marketing professionals, 25-40"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  {/* Toggles */}
                  <div className="space-y-2">
                    {[
                      { label: "Add CTAs", value: addCTAs, setter: setAddCTAs },
                      { label: "Add hashtags", value: addHashtags, setter: setAddHashtags },
                      { label: "Include emoji", value: includeEmoji, setter: setIncludeEmoji },
                    ].map(({ label, value, setter }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                        <button
                          onClick={() => setter(!value)}
                          className={cn(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                            value ? "bg-violet-600" : "bg-gray-200 dark:bg-gray-700"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow",
                              value ? "translate-x-4" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Error message */}
            {repurposeError && (
              <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {repurposeError}
              </div>
            )}

            {/* Repurpose Button */}
            <Button
              onClick={handleRepurpose}
              disabled={isProcessing}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white h-10 font-medium"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Repurposing with AI...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Repurpose with AI
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
          {!isComplete && !isProcessing && (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <div className="h-16 w-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
                  <RefreshCw className="h-8 w-8 text-violet-600 dark:text-violet-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Ready to repurpose
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enter your content on the left and click &ldquo;Repurpose with AI&rdquo; to generate
                  platform-native posts for all your channels.
                </p>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="p-6 space-y-4">
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-48 animate-pulse" />
              <div className="flex gap-2 mb-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-8 w-20 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
                ))}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3">
                <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-32 animate-pulse" />
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" style={{ width: `${85 - i * 5}%` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {isComplete && (
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Generated Content</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">8 platform-optimized posts ready</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <BookTemplate className="h-3.5 w-3.5" />
                    Save as Template
                  </Button>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Add All to Queue
                  </Button>
                </div>
              </div>

              {/* Platform tabs */}
              <div className="flex flex-wrap gap-1.5">
                {platformTabs.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePlatformTab(p.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                      activePlatformTab === p.id
                        ? "bg-violet-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-violet-300"
                    )}
                  >
                    <PlatformIcon platform={p.id} />
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Active platform output */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={activePlatformTab} />
                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                      {currentPlatform.label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-mono font-medium px-2 py-0.5 rounded",
                      isOverLimit
                        ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                    )}
                  >
                    {charCount}/{currentPlatform.charLimit}
                  </span>
                </div>
                <div className="p-4">
                  <textarea
                    value={platformContent[activePlatformTab]}
                    onChange={(e) =>
                      setPlatformContent((prev) => ({ ...prev, [activePlatformTab]: e.target.value }))
                    }
                    rows={10}
                    className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent resize-none focus:outline-none leading-relaxed"
                  />
                </div>

                {/* Platform-specific fields */}
                {activePlatformTab === "youtube" && (
                  <div className="px-4 pb-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Video Title</label>
                    <input
                      defaultValue="How AI is Revolutionizing Content Repurposing in 2024"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                )}
                {activePlatformTab === "pinterest" && (
                  <div className="px-4 pb-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Board</label>
                    <input
                      defaultValue="Content Marketing Tips"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                )}
                {activePlatformTab === "instagram" && (
                  <div className="px-4 pb-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Hashtag suggestions</label>
                    <div className="flex flex-wrap gap-1.5">
                      {["#ContentCreation", "#SocialMedia", "#AIMarketing", "#DigitalMarketing"].map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 p-4 pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => handleCopy(activePlatformTab)}
                  >
                    {copiedPlatform === activePlatformTab ? (
                      <><Check className="h-3.5 w-3.5 text-green-500" /> Copied!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </Button>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5 ml-auto">
                    <Calendar className="h-3.5 w-3.5" />
                    Add to Queue
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
