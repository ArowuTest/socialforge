"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Sparkles,
  Hash,
  RefreshCw,
  BarChart2,
  Upload,
  X,
  Clock,
  Send,
  Save,
  Image,
  Video,
  ChevronDown,
  Loader2,
  AlertCircle,
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  MessageCircle,
  Pin,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, getPlatformDisplayName, getCharacterLimit } from "@/lib/utils";
import { useComposeStore } from "@/lib/stores/compose";
import { postsApi, aiApi, mediaApi, repurposeApi } from "@/lib/api";
import { Platform, PostType } from "@/types";

// Platform config
const platforms = [
  { id: Platform.INSTAGRAM, label: "Instagram", Icon: Instagram, color: "from-purple-600 to-pink-500" },
  { id: Platform.TIKTOK, label: "TikTok", Icon: Video, color: "from-gray-900 to-black" },
  { id: Platform.YOUTUBE, label: "YouTube", Icon: Youtube, color: "from-red-600 to-red-700" },
  { id: Platform.LINKEDIN, label: "LinkedIn", Icon: Linkedin, color: "from-blue-700 to-blue-800" },
  { id: Platform.TWITTER, label: "Twitter / X", Icon: Twitter, color: "from-sky-500 to-sky-600" },
  { id: Platform.FACEBOOK, label: "Facebook", Icon: Facebook, color: "from-blue-600 to-blue-700" },
  { id: Platform.PINTEREST, label: "Pinterest", Icon: Pin, color: "from-red-600 to-red-700" },
  { id: Platform.THREADS, label: "Threads", Icon: MessageCircle, color: "from-gray-900 to-black" },
  { id: Platform.BLUESKY, label: "Bluesky", Icon: Globe, color: "from-sky-400 to-cyan-500" },
];

const postTypes = [
  { value: PostType.POST, label: "Post" },
  { value: PostType.REEL, label: "Reel" },
  { value: PostType.STORY, label: "Story" },
  { value: PostType.CAROUSEL, label: "Carousel" },
  { value: PostType.THREAD, label: "Thread" },
  { value: PostType.VIDEO, label: "Video" },
  { value: PostType.SHORT, label: "Short" },
];

// Which platforms support each post type
const postTypeCompatibility: Record<string, Platform[]> = {
  [PostType.POST]:     [Platform.INSTAGRAM, Platform.TWITTER, Platform.LINKEDIN, Platform.FACEBOOK, Platform.THREADS, Platform.BLUESKY, Platform.PINTEREST],
  [PostType.REEL]:     [Platform.INSTAGRAM, Platform.TIKTOK, Platform.FACEBOOK],
  [PostType.STORY]:    [Platform.INSTAGRAM, Platform.FACEBOOK],
  [PostType.CAROUSEL]: [Platform.INSTAGRAM, Platform.LINKEDIN, Platform.FACEBOOK],
  [PostType.THREAD]:   [Platform.TWITTER, Platform.THREADS],
  [PostType.VIDEO]:    [Platform.YOUTUBE, Platform.LINKEDIN, Platform.FACEBOOK, Platform.TIKTOK, Platform.TWITTER],
  [PostType.SHORT]:    [Platform.YOUTUBE, Platform.TIKTOK],
};

/** Returns true if the post type is supported by at least one selected platform */
function isPostTypeCompatible(ptValue: string, selectedPlatforms: string[]): boolean {
  if (selectedPlatforms.length === 0) return true;
  const supported = postTypeCompatibility[ptValue] ?? [];
  return selectedPlatforms.some((p) => supported.includes(p as Platform));
}

function CharacterCounter({ platform, count }: { platform: Platform; count: number }) {
  const limit = getCharacterLimit(platform);
  const remaining = limit - count;
  const isOver = remaining < 0;
  const isWarning = remaining < 20 && remaining >= 0;

  return (
    <div
      className={cn(
        "text-xs font-mono",
        isOver ? "text-red-500" : isWarning ? "text-amber-500" : "text-muted-foreground"
      )}
    >
      {isOver ? `-${Math.abs(remaining)}` : remaining}
    </div>
  );
}

// Platform-specific previews
function InstagramPreview({ caption, handle }: { caption: string; handle: string }) {
  return (
    <div className="phone-frame bg-black w-56 mx-auto overflow-hidden">
      {/* Status bar */}
      <div className="bg-black flex items-center justify-between px-4 py-1">
        <span className="text-white text-xs">9:41</span>
        <div className="flex gap-1">
          <div className="h-1.5 w-4 bg-white rounded-sm opacity-80" />
        </div>
      </div>
      {/* Header */}
      <div className="bg-white px-3 py-2 flex items-center justify-between border-b">
        <span className="font-bold text-sm">Instagram</span>
      </div>
      {/* Post */}
      <div className="bg-white">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-600 to-pink-500" />
          <div>
            <p className="text-xs font-semibold">{handle || "yourhandle"}</p>
          </div>
        </div>
        <div className="bg-gradient-to-br from-violet-200 to-purple-300 aspect-square" />
        <div className="px-3 py-2">
          <p className="text-xs leading-relaxed line-clamp-3">
            {caption || "Your caption will appear here..."}
          </p>
        </div>
      </div>
    </div>
  );
}

function TwitterPreview({ caption, handle }: { caption: string; handle: string }) {
  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-gray-900 max-w-xs mx-auto shadow-sm">
      <div className="flex gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <span className="font-bold text-sm text-gray-900 dark:text-white">Display Name</span>
            <span className="text-sm text-gray-500">@{handle || "yourhandle"}</span>
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed break-words">
            {caption || "Your tweet will appear here..."}
          </p>
          <div className="flex items-center gap-4 mt-3 text-gray-400 text-xs">
            <span className="flex items-center gap-1 hover:text-blue-500 cursor-pointer">💬 0</span>
            <span className="flex items-center gap-1 hover:text-green-500 cursor-pointer">🔁 0</span>
            <span className="flex items-center gap-1 hover:text-red-500 cursor-pointer">❤️ 0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInPreview({ caption, name }: { caption: string; name: string }) {
  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-900 max-w-xs mx-auto shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex-shrink-0" />
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-white">{name || "Your Name"}</p>
          <p className="text-xs text-gray-500">Your Title • 1st</p>
        </div>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">
        {caption || "Your LinkedIn post will appear here..."}
      </p>
      <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-gray-400">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>🔁 Repost</span>
      </div>
    </div>
  );
}

function TikTokPreview({ caption }: { caption: string }) {
  return (
    <div className="phone-frame bg-black w-40 mx-auto overflow-hidden">
      <div className="relative aspect-[9/16] bg-gradient-to-b from-violet-900 via-purple-800 to-pink-900 flex flex-col justify-end">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
            <Video className="h-6 w-6 text-white" />
          </div>
        </div>
        <div className="p-3 pb-4">
          <p className="text-white text-xs leading-relaxed line-clamp-2">
            {caption || "Your TikTok caption..."}
          </p>
        </div>
      </div>
    </div>
  );
}

// AI Generate Image Dialog
function AIImageDialog({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  onGenerated: (imageUrl: string) => void;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [style, setStyle] = React.useState<"photorealistic" | "cartoon" | "minimalist" | "3d">("photorealistic");
  const [aspectRatio, setAspectRatio] = React.useState<"1:1" | "4:5" | "9:16" | "16:9" | "1.91:1">("1:1");
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please describe the image you want");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await aiApi.generateImage({ prompt, style, aspectRatio });
      // Backend returns {"data": {"job_id": "..."}}
      const jobId = (res.data as unknown as { job_id?: string }).job_id;
      if (!jobId) throw new Error("No job ID returned");
      let attempts = 0;
      const poll = async () => {
        if (attempts > 40) throw new Error("Image generation timed out");
        attempts++;
        const jobRes = await aiApi.getJobStatus(jobId);
        // Backend stores image URL in output_data.url
        const outputData = jobRes.data.output_data as Record<string, unknown> | undefined;
        if (jobRes.data.status === "completed" && outputData?.url) {
          onGenerated(outputData.url as string);
          onClose();
          toast.success("Image generated!");
        } else if (jobRes.data.status === "failed") {
          throw new Error(jobRes.data.error || "Image generation failed");
        } else {
          await new Promise((r) => setTimeout(r, 2000));
          await poll();
        }
      };
      await poll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="h-5 w-5 text-blue-500" />
            AI Image Generator
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Image Description</Label>
            <Textarea
              placeholder="A vibrant flat-lay of coffee and pastries on a wooden table, morning light..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="h-24 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as typeof style)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="photorealistic">Photorealistic</SelectItem>
                  <SelectItem value="cartoon">Cartoon</SelectItem>
                  <SelectItem value="minimalist">Minimalist</SelectItem>
                  <SelectItem value="3d">3D Render</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  <SelectItem value="4:5">4:5 (Portrait)</SelectItem>
                  <SelectItem value="9:16">9:16 (Story)</SelectItem>
                  <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                  <SelectItem value="1.91:1">1.91:1 (Banner)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating image…
              </>
            ) : (
              <>
                <Image className="h-4 w-4 mr-2" />
                Generate Image
              </>
            )}
          </Button>
          {isGenerating && (
            <p className="text-xs text-center text-muted-foreground">
              Image generation takes 10–30 seconds. Please wait…
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// AI Generate Caption Dialog
function AICaptionDialog({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  onGenerated: (caption: string) => void;
}) {
  const [topic, setTopic] = React.useState("");
  const [tone, setTone] = React.useState("casual");
  const [targetPlatform, setTargetPlatform] = React.useState(Platform.INSTAGRAM);
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await aiApi.generateCaption({
        platform: targetPlatform,
        topic,
        tone: tone as "professional" | "casual" | "funny" | "inspirational",
      });
      // Backend returns caption synchronously in res.data.caption
      const caption = (res.data as unknown as { caption?: string }).caption;
      if (caption) {
        onGenerated(caption);
        onClose();
        toast.success("Caption generated!");
      } else {
        throw new Error("No caption returned");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate caption");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            AI Caption Generator
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={targetPlatform} onValueChange={(v) => setTargetPlatform(v as Platform)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Topic / Prompt</Label>
            <Textarea
              placeholder="Describe what your post is about..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-20 resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="funny">Funny</SelectItem>
                <SelectItem value="inspirational">Inspirational</SelectItem>
                <SelectItem value="educational">Educational</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Caption
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Extracted into its own component so it can be wrapped in Suspense (required by Next.js for useSearchParams)
function CaptionFromSearchParams() {
  const searchParams = useSearchParams();
  const { caption, setCaption } = useComposeStore();
  React.useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (prompt && !caption) {
      setCaption(prompt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function ComposePage() {
  const {
    caption,
    selectedPlatforms,
    media,
    postType,
    scheduledAt,
    useNextSlot,
    isPublishing,
    setCaption,
    togglePlatform,
    setPostType,
    setScheduledAt,
    setUseNextSlot,
    setIsPublishing,
    reset,
  } = useComposeStore();

  const [activePreviewTab, setActivePreviewTab] = React.useState<string>("");
  const [showAIDialog, setShowAIDialog] = React.useState(false);
  const [showImageDialog, setShowImageDialog] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Set active preview tab when platforms change
  React.useEffect(() => {
    if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(activePreviewTab as Platform)) {
      setActivePreviewTab(selectedPlatforms[0]);
    }
  }, [selectedPlatforms]);

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [caption]);

  const handleAddHashtags = async () => {
    if (!caption.trim()) {
      toast.error("Please write some content first");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Please select a platform first");
      return;
    }
    try {
      const res = await aiApi.addHashtags({
        content: caption,
        platform: selectedPlatforms[0] as Platform,
        count: 8,
      });
      const tags = res.data.hashtags;
      if (tags.length > 0) {
        setCaption(caption.trimEnd() + "\n\n" + tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" "));
        toast.success("Hashtags added!");
      }
    } catch {
      toast.error("Failed to generate hashtags");
    }
  };

  const handleRepurpose = async () => {
    if (!caption.trim()) {
      toast.error("Please write some content first");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Please select a platform first");
      return;
    }
    try {
      const targetPlatforms = platforms
        .map((p) => p.id)
        .filter((p) => !selectedPlatforms.includes(p));
      const allPlatforms = targetPlatforms.length > 0 ? targetPlatforms : platforms.map((p) => p.id);
      const res = await repurposeApi.repurposeContent({
        source_type: "text",
        source_text: caption,
        platforms: allPlatforms,
      });
      if (res.platforms && Object.keys(res.platforms).length > 0) {
        toast.success("Content repurposed! Check the Repurpose page for results.");
      } else {
        throw new Error("Repurpose returned no results");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to repurpose content");
    }
  };

  const handleAnalyse = async () => {
    if (!caption.trim()) {
      toast.error("Please write some content first");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Please select a platform first");
      return;
    }
    try {
      const res = await aiApi.analyse({
        content: caption,
        platform: selectedPlatforms[0] as Platform,
      });
      // Backend returns analysis synchronously
      const r = res.data as unknown as Record<string, unknown>;
      const score = r.score ?? r.viral_score ?? "N/A";
      toast.success(`Viral potential score: ${score}/100`, {
        description: (r.feedback || r.suggestions || "Analysis complete") as string,
        duration: 8000,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to analyse content");
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 10 - media.length);
    newFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      useComposeStore.getState().addMedia({
        id: Math.random().toString(36).slice(2),
        url,
        type: file.type.startsWith("video/") ? "video" : "image",
        file,
      });
    });
  };

  /**
   * Upload any locally-selected media files via the presigned-URL flow and
   * return their storage keys. Files that have already been uploaded (or have
   * no backing File object) are silently skipped.
   */
  const uploadPendingMedia = async (): Promise<string[]> => {
    const publicUrls: string[] = [];
    for (const m of media) {
      if (!m.file) continue; // already-uploaded or URL-only entry — skip
      const presignRes = await mediaApi.presign({
        filename: m.file.name,
        contentType: m.file.type,
      });
      const { upload_url, public_url } = presignRes.data;
      await fetch(upload_url, {
        method: "PUT",
        body: m.file,
        headers: { "Content-Type": m.file.type },
      });
      publicUrls.push(public_url);
    }
    return publicUrls;
  };

  const handlePublishNow = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }
    if (!caption.trim()) {
      toast.error("Please write a caption");
      return;
    }
    setIsPublishing(true);
    try {
      const mediaUrls = await uploadPendingMedia();
      await postsApi.create({
        caption,
        platforms: selectedPlatforms as Platform[],
        postType,
        ...(mediaUrls.length > 0 && { mediaUrls }),
      });
      toast.success("Post published successfully!");
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish post");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSchedule = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }
    if (!caption.trim()) {
      toast.error("Please write a caption");
      return;
    }
    if (!scheduledAt && !useNextSlot) {
      toast.error("Please select a time or enable next free slot");
      return;
    }
    setIsPublishing(true);
    try {
      const mediaUrls = await uploadPendingMedia();
      // datetime-local gives "2026-04-18T09:00" — convert to full ISO8601
      const isoScheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      await postsApi.create({
        caption,
        platforms: selectedPlatforms as Platform[],
        postType,
        scheduledAt: isoScheduledAt,
        useNextSlot,
        ...(mediaUrls.length > 0 && { mediaUrls }),
      });
      toast.success("Post scheduled successfully!");
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to schedule post");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!caption.trim() && selectedPlatforms.length === 0) {
      toast.error("Please add some content first");
      return;
    }
    try {
      const mediaUrls = await uploadPendingMedia();
      await postsApi.create({
        caption,
        platforms: selectedPlatforms as Platform[],
        postType,
        ...(mediaUrls.length > 0 && { mediaUrls }),
      });
      toast.success("Draft saved!");
    } catch {
      toast.error("Failed to save draft");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <React.Suspense fallback={null}>
        <CaptionFromSearchParams />
      </React.Suspense>
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Panel: Editor */}
        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
          <div className="p-4 md:p-6 space-y-5">
            {/* Platform selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">
                  Select Platforms
                  {selectedPlatforms.length > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      ({selectedPlatforms.length} selected)
                    </span>
                  )}
                </Label>
                {selectedPlatforms.length === 0 && (
                  <a
                    href="/accounts"
                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    Connect accounts →
                  </a>
                )}
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {platforms.map((p) => {
                  const isActive = selectedPlatforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlatform(p.id)}
                      title={p.label}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all",
                        isActive
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900"
                      )}
                    >
                      <div
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br text-white transition-all",
                          isActive ? p.color : "from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600"
                        )}
                      >
                        <p.Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-gray-500 dark:text-gray-400")} />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 leading-none text-center hidden sm:block">
                        {p.label.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedPlatforms.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  Select at least one platform to publish. Make sure you have{" "}
                  <a href="/accounts" className="underline hover:no-underline">connected accounts</a>{" "}
                  for your chosen platforms.
                </p>
              )}
            </div>

            {/* Post type */}
            {selectedPlatforms.length > 0 && (
              <div>
                <Label className="mb-2 block text-sm font-medium">Post Type</Label>
                <div className="flex flex-wrap gap-2">
                  {postTypes.map((pt) => {
                    const compatible = isPostTypeCompatible(pt.value, selectedPlatforms);
                    const isSelected = postType === pt.value;
                    return (
                      <button
                        key={pt.value}
                        onClick={() => setPostType(pt.value)}
                        title={!compatible ? `Not supported by your selected platform(s)` : undefined}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                          isSelected
                            ? "bg-violet-600 text-white border-violet-600"
                            : compatible
                            ? "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300"
                            : "bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed"
                        )}
                      >
                        {pt.label}
                        {!compatible && <span className="ml-1 text-[10px]">✕</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Hint when incompatible selection */}
                {!isPostTypeCompatible(postType, selectedPlatforms) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    The selected post type may not be supported on all chosen platforms
                  </p>
                )}
              </div>
            )}

            {/* Caption editor */}
            <div>
              <Label className="mb-2 block text-sm font-medium">Caption</Label>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write your caption here... or use AI to generate one"
                  className="w-full min-h-[140px] p-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 resize-none transition-all"
                />
                {/* Character counts per platform */}
                {selectedPlatforms.length > 0 && (
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    {selectedPlatforms.map((p) => (
                      <div key={p} className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {getPlatformDisplayName(p as Platform).split(" ")[0]}:
                        </span>
                        <CharacterCounter platform={p as Platform} count={caption.length} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI Assist bar */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                <Sparkles className="h-3 w-3 inline mr-1 text-violet-500" />
                AI Tools — uses credits from your balance
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-violet-600 border-violet-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400"
                  onClick={() => setShowAIDialog(true)}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Generate Caption
                  <span className="ml-1.5 text-[10px] font-normal opacity-60">~5 cr</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
                  onClick={() => setShowImageDialog(true)}
                >
                  <Image className="h-3.5 w-3.5 mr-1.5" />
                  Generate Image
                  <span className="ml-1.5 text-[10px] font-normal opacity-60">~20 cr</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddHashtags}
                  disabled={!caption.trim()}
                  title={!caption.trim() ? "Write a caption first" : undefined}
                >
                  <Hash className="h-3.5 w-3.5 mr-1.5" />
                  Hashtags
                  <span className="ml-1.5 text-[10px] font-normal opacity-60">~2 cr</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!caption.trim()}
                  onClick={handleRepurpose}
                  title={!caption.trim() ? "Write a caption first" : "Adapt this post for other platforms"}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Repurpose
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!caption.trim()}
                  onClick={handleAnalyse}
                  title={!caption.trim() ? "Write a caption first" : "Get a viral-potential score"}
                >
                  <BarChart2 className="h-3.5 w-3.5 mr-1.5" />
                  Analyse
                </Button>
              </div>
            </div>

            {/* Media upload */}
            <div>
              <Label className="mb-2 block text-sm font-medium">
                Media
                {media.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    ({media.length}/10)
                  </span>
                )}
              </Label>

              {/* Drop zone */}
              <div
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFileSelect(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                  isDragging
                    ? "border-violet-400 bg-violet-50 dark:bg-violet-900/10"
                    : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                )}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Drag & drop images or videos, or{" "}
                  <span className="text-violet-600 dark:text-violet-400 font-medium">
                    browse
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max 10 files • Images and videos
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />

              {/* Media previews */}
              {media.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {media.map((m) => (
                    <div key={m.id} className="relative group">
                      {m.type === "image" ? (
                        <img
                          src={m.url}
                          alt="upload preview"
                          className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-black flex items-center justify-center">
                          <Video className="h-6 w-6 text-white" />
                        </div>
                      )}
                      <button
                        onClick={() => useComposeStore.getState().removeMedia(m.id)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Preview */}
        <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col overflow-y-auto bg-gray-50 dark:bg-gray-950">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</h3>
          </div>

          {selectedPlatforms.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center p-6">
              <div>
                <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <Instagram className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  No platform selected
                </p>
                <p className="text-xs text-muted-foreground max-w-[160px]">
                  Pick a platform on the left to see a live preview of your post
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <Tabs value={activePreviewTab} onValueChange={setActivePreviewTab}>
                <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-gray-100 dark:bg-gray-800 p-1">
                  {selectedPlatforms.map((p) => (
                    <TabsTrigger
                      key={p}
                      value={p}
                      className="text-xs flex-1 min-w-0"
                    >
                      {getPlatformDisplayName(p as Platform).split(" ")[0]}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {selectedPlatforms.map((p) => (
                  <TabsContent key={p} value={p} className="mt-4">
                    {p === Platform.INSTAGRAM && (
                      <InstagramPreview caption={caption} handle="yourhandle" />
                    )}
                    {p === Platform.TWITTER && (
                      <TwitterPreview caption={caption} handle="yourhandle" />
                    )}
                    {p === Platform.LINKEDIN && (
                      <LinkedInPreview caption={caption} name="Your Name" />
                    )}
                    {p === Platform.TIKTOK && (
                      <TikTokPreview caption={caption} />
                    )}
                    {![Platform.INSTAGRAM, Platform.TWITTER, Platform.LINKEDIN, Platform.TIKTOK].includes(p as Platform) && (
                      <div className="border rounded-xl p-4 bg-white dark:bg-gray-900 text-center">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          {getPlatformDisplayName(p as Platform)} Preview
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                          {caption || "Your post content will appear here..."}
                        </p>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveDraft}
          disabled={isPublishing}
        >
          <Save className="h-4 w-4 mr-1.5" />
          Save Draft
        </Button>

        <div className="flex-1" />

        {/* Schedule controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="nextSlot"
              checked={useNextSlot}
              onCheckedChange={setUseNextSlot}
              className="data-[state=checked]:bg-violet-600"
            />
            <Label
              htmlFor="nextSlot"
              className="text-sm cursor-pointer whitespace-nowrap"
              title="Posts at the next available time slot from your posting schedule (set in Calendar → Schedule)"
            >
              Auto-schedule
            </Label>
          </div>

          {!useNextSlot && (
            <div className="flex flex-col gap-0.5">
              <input
                type="datetime-local"
                value={scheduledAt ?? ""}
                onChange={(e) => setScheduledAt(e.target.value || null)}
                className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-500 pl-1">
                {Intl.DateTimeFormat().resolvedOptions().timeZone} (your local time)
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleSchedule}
            disabled={isPublishing}
            className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20"
          >
            <Clock className="h-4 w-4 mr-1.5" />
            Schedule
          </Button>

          <Button
            size="sm"
            onClick={handlePublishNow}
            disabled={isPublishing}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Post Now
          </Button>
        </div>
      </div>

      {/* AI Caption Dialog */}
      <AICaptionDialog
        open={showAIDialog}
        onClose={() => setShowAIDialog(false)}
        onGenerated={(c) => {
          setCaption(c);
          toast.success("Caption applied!");
        }}
      />

      {/* AI Image Dialog */}
      <AIImageDialog
        open={showImageDialog}
        onClose={() => setShowImageDialog(false)}
        onGenerated={(imageUrl) => {
          // Add the generated image as a media item
          useComposeStore.getState().addMedia({
            id: Math.random().toString(36).slice(2),
            url: imageUrl,
            type: "image",
          });
          toast.success("Image added to your post!");
        }}
      />
    </div>
  );
}
