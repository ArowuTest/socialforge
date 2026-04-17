"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Image,
  Video,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
  Hash,
  Link,
  FileText,
  Download,
  ExternalLink,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getPlatformDisplayName } from "@/lib/utils";
import { aiApi, repurposeApi } from "@/lib/api";
import { AIJob, AIJobStatus, Platform } from "@/types";
import { useComposeStore } from "@/lib/stores/compose";

const platforms = [
  { id: Platform.INSTAGRAM, label: "Instagram" },
  { id: Platform.TIKTOK, label: "TikTok" },
  { id: Platform.YOUTUBE, label: "YouTube" },
  { id: Platform.LINKEDIN, label: "LinkedIn" },
  { id: Platform.TWITTER, label: "Twitter / X" },
  { id: Platform.FACEBOOK, label: "Facebook" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy
        </>
      )}
    </Button>
  );
}

// Credit usage bar
function CreditsBar() {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-credits"],
    queryFn: () => aiApi.getCreditsUsage(),
    refetchInterval: 60000,
  });

  if (isLoading) return <Skeleton className="h-10 w-full" />;

  const { used = 0, limit = 100 } = data?.data ?? {};
  const percentage = Math.round((used / limit) * 100);
  const isLow = percentage >= 80;

  return (
    <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
      <Zap className={cn("h-4 w-4 flex-shrink-0", isLow ? "text-red-500" : "text-violet-600")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            AI Credits
          </span>
          <span className={cn("text-xs font-medium", isLow ? "text-red-500" : "text-muted-foreground")}>
            {used} / {limit} used
          </span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isLow ? "bg-red-500" : percentage >= 60 ? "bg-amber-500" : "bg-violet-600"
            )}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
      {isLow && (
        <Button size="sm" variant="outline" className="text-xs flex-shrink-0">
          Upgrade
        </Button>
      )}
    </div>
  );
}

// Poll AI job
function useJobPoller(
  jobId: string | null,
  onComplete: (job: AIJob) => void,
  onFail?: (job: AIJob) => void,
) {
  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await aiApi.getJobStatus(jobId);
        if (cancelled) return;
        if (res.data.status === AIJobStatus.COMPLETED) {
          onComplete(res.data);
        } else if (res.data.status === AIJobStatus.FAILED) {
          toast.error(res.data.error || "Generation failed");
          onFail?.(res.data);
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [jobId]);
}

// ==================== Generate Caption Tab ====================
function GenerateCaptionTab({ onGenerateMatchingImage }: { onGenerateMatchingImage?: (prompt: string) => void }) {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = React.useState<Platform>(Platform.INSTAGRAM);
  const [topic, setTopic] = React.useState("");
  const [tone, setTone] = React.useState("casual");
  const [audience, setAudience] = React.useState("");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [result, setResult] = React.useState<AIJob | null>(null);
  const [history, setHistory] = React.useState<AIJob[]>([]);

  useJobPoller(jobId, (job) => {
    setResult(job);
    setHistory((prev) => [job, ...prev].slice(0, 5));
    setJobId(null);
    setIsGenerating(false);
  }, () => {
    setJobId(null);
    setIsGenerating(false);
  });

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic");
      return;
    }
    setIsGenerating(true);
    setResult(null);
    try {
      const res = await aiApi.generateCaption({
        platform,
        topic,
        tone: tone as "professional" | "casual" | "funny" | "inspirational",
        targetAudience: audience || undefined,
      });
      // Backend returns caption synchronously in res.data.caption (not a job)
      const data = res.data as unknown as { caption?: string; hashtags?: string[] };
      if (data.caption) {
        const syntheticJob: AIJob = {
          id: crypto.randomUUID(),
          workspaceId: "",
          type: "caption",
          status: AIJobStatus.COMPLETED,
          output_data: { caption: data.caption, hashtags: data.hashtags },
          creditsUsed: 0,
          createdAt: new Date().toISOString(),
        };
        setResult(syntheticJob);
        setHistory((prev) => [syntheticJob, ...prev].slice(0, 5));
        queryClient.invalidateQueries({ queryKey: ["ai-credits"] });
      } else {
        throw new Error("No caption returned");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start generation");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseInComposer = (caption: string) => {
    useComposeStore.getState().setCaption(caption);
    toast.success("Caption added to composer!");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Platform</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platforms.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
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
            className="h-24 resize-none"
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

        <div className="space-y-2">
          <Label>Target Audience <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            placeholder="e.g. small business owners, Gen Z"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />
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

      {/* Result + History */}
      <div className="space-y-4">
        {/* Current result */}
        {isGenerating && !result && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
        )}

        {result?.output_data?.caption && (
          <Card className="border-violet-200 dark:border-violet-800">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  Generated Caption
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {result.output_data.caption.length} chars
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed mb-3">
                {result.output_data.caption}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <CopyButton text={result.output_data.caption} />
                <Button
                  size="sm"
                  onClick={() => handleUseInComposer(result.output_data!.caption!)}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Use in Composer
                </Button>
                {onGenerateMatchingImage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Build a concise image prompt from the topic context
                      const imagePrompt = `Professional social media product/lifestyle image for: ${topic}. Clean composition, vibrant colors, brand-ready visual, no text overlays`;
                      onGenerateMatchingImage(imagePrompt);
                    }}
                  >
                    <Image className="h-3.5 w-3.5 mr-1.5" />
                    Generate matching image
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Recent Generations
            </h3>
            <div className="space-y-2">
              {history.slice(0, 5).map((job) =>
                job.output_data?.caption ? (
                  <div
                    key={job.id}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800"
                  >
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1.5">
                      {job.output_data.caption}
                    </p>
                    <div className="flex gap-1.5">
                      <CopyButton text={job.output_data.caption} />
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Generate Image Tab ====================
function GenerateImageTab({ suggestedPrompt, onPromptConsumed }: { suggestedPrompt?: string; onPromptConsumed?: () => void }) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = React.useState("");

  // When a suggested prompt arrives from the caption tab, apply it once
  React.useEffect(() => {
    if (suggestedPrompt) {
      setPrompt(suggestedPrompt);
      onPromptConsumed?.();
    }
  }, [suggestedPrompt]);
  const [style, setStyle] = React.useState("photorealistic");
  const [aspectRatio, setAspectRatio] = React.useState<"1:1" | "9:16" | "16:9">("1:1");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<AIJob | null>(null);

  // Fake progress animation
  React.useEffect(() => {
    if (!isGenerating) { setProgress(0); return; }
    setProgress(5);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) { clearInterval(interval); return p; }
        return p + Math.random() * 8;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  useJobPoller(jobId, (job) => {
    setResult(job);
    setJobId(null);
    setIsGenerating(false);
    setProgress(100);
    queryClient.invalidateQueries({ queryKey: ["ai-credits"] });
  }, () => {
    setJobId(null);
    setIsGenerating(false);
    setProgress(0);
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Please enter a prompt"); return; }
    setIsGenerating(true);
    setResult(null);
    try {
      const res = await aiApi.generateImage({
        prompt,
        style: style as "photorealistic" | "cartoon" | "minimalist" | "3d",
        aspectRatio,
      });
      // Backend returns {"data": {"job_id": "..."}}
      const jobId = (res.data as unknown as { job_id?: string }).job_id;
      setJobId(jobId ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start generation");
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Image Prompt</Label>
          <Textarea
            placeholder="Describe the image you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="h-28 resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Style</Label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="photorealistic">Photorealistic</SelectItem>
              <SelectItem value="cartoon">Illustration</SelectItem>
              <SelectItem value="minimalist">Minimalist</SelectItem>
              <SelectItem value="3d">3D Render</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Aspect Ratio</Label>
          <div className="flex gap-2">
            {(["1:1", "9:16", "16:9"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setAspectRatio(r)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium border transition-all",
                  aspectRatio === r
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Image className="h-4 w-4 mr-2" />
              Generate Image
            </>
          )}
        </Button>
      </div>

      {/* Result */}
      <div>
        {isGenerating && (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="mb-4">
                <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Generating your image...
                </p>
                <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{Math.round(progress)}%</p>
            </CardContent>
          </Card>
        )}

        {result?.output_data?.url && (
          <Card className="border-violet-200 dark:border-violet-800">
            <CardContent className="p-4">
              <img
                src={result.output_data.url}
                alt="AI generated"
                className="w-full rounded-lg mb-3"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = result.output_data!.url!;
                    a.download = "ai-image.png";
                    a.click();
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Use in Composer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isGenerating && !result && (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
            <div>
              <Image className="h-10 w-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-muted-foreground">
                Your generated image will appear here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Generate Video Tab ====================
function GenerateVideoTab() {
  const queryClient = useQueryClient();
  const [concept, setConcept] = React.useState("");
  const [duration, setDuration] = React.useState<5 | 10>(5);
  const [style, setStyle] = React.useState("cinematic");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [queuePosition, setQueuePosition] = React.useState(3);
  const [result, setResult] = React.useState<AIJob | null>(null);

  React.useEffect(() => {
    if (!isGenerating) { setProgress(0); return; }
    setProgress(2);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) { clearInterval(interval); return p; }
        return p + Math.random() * 4;
      });
      setQueuePosition((q) => Math.max(0, q - 1));
    }, 1500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  useJobPoller(jobId, (job) => {
    setResult(job);
    setJobId(null);
    setIsGenerating(false);
    setProgress(100);
    queryClient.invalidateQueries({ queryKey: ["ai-credits"] });
  }, () => {
    setJobId(null);
    setIsGenerating(false);
    setProgress(0);
  });

  const handleGenerate = async () => {
    if (!concept.trim()) { toast.error("Please describe your video concept"); return; }
    setIsGenerating(true);
    setResult(null);
    try {
      const res = await aiApi.generateVideo({ concept, duration, style });
      const jobId = (res.data as unknown as { job_id?: string }).job_id;
      setJobId(jobId ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start video generation");
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Video Concept</Label>
          <Textarea
            placeholder="Describe what your video should show and communicate..."
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            className="h-28 resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Duration</Label>
          <div className="flex gap-2">
            {([5, 10] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium border transition-all",
                  duration === d
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300"
                )}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Visual Style</Label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cinematic">Cinematic</SelectItem>
              <SelectItem value="animated">Animated</SelectItem>
              <SelectItem value="slideshow">Slideshow</SelectItem>
              <SelectItem value="documentary">Documentary</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !concept.trim()}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Video className="h-4 w-4 mr-2" />
              Generate Video
            </>
          )}
        </Button>
      </div>

      <div>
        {isGenerating && (
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <Video className="h-10 w-10 animate-pulse text-violet-600 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  Generating your video...
                </p>
                {queuePosition > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Queue position: {queuePosition}
                  </p>
                )}
              </div>
              <div>
                <Progress value={progress} className="h-2 mb-1" />
                <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Video generation usually takes 2–5 minutes
              </p>
            </CardContent>
          </Card>
        )}

        {result?.result?.videoUrl && (
          <Card className="border-violet-200 dark:border-violet-800">
            <CardContent className="p-4">
              <video
                src={result.result.videoUrl}
                controls
                className="w-full rounded-lg mb-3"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
                <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Use in Composer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isGenerating && !result && (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
            <div>
              <Video className="h-10 w-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-muted-foreground">
                Your generated video will appear here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type PlatformDraft = { content: string; hashtags: string[]; char_count: number; media_prompt?: string };

// ==================== Repurpose Tab ====================
function RepurposeTab() {
  const [sourceMode, setSourceMode] = React.useState<"url" | "text">("text");
  const [source, setSource] = React.useState("");
  const [targetPlatforms, setTargetPlatforms] = React.useState<Platform[]>([]);
  const [isRepurposing, setIsRepurposing] = React.useState(false);
  const [results, setResults] = React.useState<Record<string, PlatformDraft> | null>(null);

  const togglePlatform = (p: Platform) => {
    setTargetPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleRepurpose = async () => {
    if (!source.trim()) { toast.error("Please provide content to repurpose"); return; }
    if (targetPlatforms.length === 0) { toast.error("Please select target platforms"); return; }
    setIsRepurposing(true);
    setResults(null);
    try {
      const res = await repurposeApi.repurposeContent({
        source_type: sourceMode === "url" ? "url" : "text",
        source_url: sourceMode === "url" ? source : undefined,
        source_text: sourceMode === "text" ? source : undefined,
        platforms: targetPlatforms as unknown as string[],
      });
      setResults(res.platforms ?? {});
      toast.success("Content repurposed!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to repurpose content");
    } finally {
      setIsRepurposing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Source */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label>Source Content</Label>
          <div className="flex gap-1 ml-auto">
            <button
              onClick={() => setSourceMode("text")}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-all",
                sourceMode === "text"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
              )}
            >
              <FileText className="h-3 w-3 inline mr-1" />
              Paste Text
            </button>
            <button
              onClick={() => setSourceMode("url")}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-all",
                sourceMode === "url"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
              )}
            >
              <Link className="h-3 w-3 inline mr-1" />
              URL
            </button>
          </div>
        </div>

        {sourceMode === "url" ? (
          <Input
            placeholder="https://example.com/blog-post"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        ) : (
          <Textarea
            placeholder="Paste your existing content here (blog post, script, article...)..."
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-28 resize-none"
          />
        )}
      </div>

      {/* Target platforms */}
      <div className="space-y-2">
        <Label>Target Platforms</Label>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePlatform(p.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                targetPlatforms.includes(p.id)
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={handleRepurpose}
        disabled={isRepurposing || !source.trim() || targetPlatforms.length === 0}
        className="bg-violet-600 hover:bg-violet-700 text-white"
      >
        {isRepurposing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Repurposing...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Repurpose Content
          </>
        )}
      </Button>

      {/* Results */}
      {isRepurposing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {targetPlatforms.map((p) => (
            <Card key={p}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {results && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(results).map(([platform, draft]) => (
            <Card key={platform} className="border-violet-100 dark:border-violet-900">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {getPlatformDisplayName(platform as Platform)}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{draft.char_count} chars</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4 mb-3 leading-relaxed">
                  {draft.content}
                </p>
                {draft.hashtags.length > 0 && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mb-3">
                    {draft.hashtags.map((h) => h.startsWith("#") ? h : `#${h}`).join(" ")}
                  </p>
                )}
                <div className="flex gap-2">
                  <CopyButton text={draft.content} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      useComposeStore.getState().setCaption(draft.content);
                      toast.success(`${getPlatformDisplayName(platform as Platform)} caption added to composer!`);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Composer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Main Page ====================
export default function AIPage() {
  const [activeTab, setActiveTab] = React.useState("caption");
  const [suggestedImagePrompt, setSuggestedImagePrompt] = React.useState("");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Credits bar */}
      <div className="mb-6">
        <CreditsBar />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 bg-gray-100 dark:bg-gray-800">
          <TabsTrigger value="caption" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Generate Caption
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-1.5">
            <Image className="h-3.5 w-3.5" />
            Generate Image
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-1.5">
            <Video className="h-3.5 w-3.5" />
            Generate Video
          </TabsTrigger>
          <TabsTrigger value="repurpose" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Repurpose
          </TabsTrigger>
        </TabsList>

        <TabsContent value="caption">
          <GenerateCaptionTab
            onGenerateMatchingImage={(prompt) => {
              setSuggestedImagePrompt(prompt);
              setActiveTab("image");
            }}
          />
        </TabsContent>
        <TabsContent value="image">
          <GenerateImageTab suggestedPrompt={suggestedImagePrompt} onPromptConsumed={() => setSuggestedImagePrompt("")} />
        </TabsContent>
        <TabsContent value="video">
          <GenerateVideoTab />
        </TabsContent>
        <TabsContent value="repurpose">
          <RepurposeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
