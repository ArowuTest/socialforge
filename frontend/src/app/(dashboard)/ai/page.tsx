"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  LayoutGrid,
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
          toast.error(res.data.error_message || "Generation failed");
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
  const router = useRouter();
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
    router.push("/compose");
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
            placeholder="e.g. New summer collection launch — bright colours, beach vibes, limited time offer..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="h-24 resize-none"
          />
          {!topic && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">💡 Try an example:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "New product launch — summer skincare collection",
                  "Monday motivation for entrepreneurs",
                  "Behind-the-scenes at our office — team day",
                  "50% off sale this weekend only",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setTopic(example)}
                    className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-violet-300 hover:text-violet-600 dark:hover:text-violet-400 transition-all"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = React.useState("");

  // Fetch live credit costs from the DB-backed endpoint
  const { data: jobCosts } = useQuery({
    queryKey: ["ai-job-costs"],
    queryFn: () => aiApi.getJobCosts(),
    staleTime: 5 * 60 * 1000, // cache for 5 min
  });
  const costMap = jobCosts?.cost_map ?? {};
  // Fallback values match the DB seed defaults
  const standardImageCredits = costMap["image_standard"] ?? costMap["generate_image"] ?? 10;
  const premiumImageCredits  = costMap["image_premium"]  ?? costMap["generate_image_premium"] ?? 25;

  // When a suggested prompt arrives from the caption tab, apply it once
  React.useEffect(() => {
    if (suggestedPrompt) {
      setPrompt(suggestedPrompt);
      onPromptConsumed?.();
    }
  }, [suggestedPrompt]);
  const [style, setStyle] = React.useState("photorealistic");
  const [aspectRatio, setAspectRatio] = React.useState<"1:1" | "9:16" | "16:9">("1:1");
  const [imageModel, setImageModel] = React.useState<"standard" | "premium">("standard");
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
        model: imageModel,
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
            placeholder="e.g. Vibrant flat-lay of coffee, notebook, and flowers on marble table, morning golden light, top-down view..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="h-28 resize-none"
          />
          {!prompt && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">💡 Try an example:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Flat-lay coffee and notebook on marble, morning light",
                  "Minimalist product photo on white background, studio lighting",
                  "Afrobeats concert with colorful stage lights and crowd",
                  "Entrepreneur working at standing desk, modern office",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setPrompt(example)}
                    className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          <Label>Generation Model</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "standard" as const, label: "⚡ Standard", sub: `Flux Dev · ${standardImageCredits} credits`, badge: null },
              { value: "premium" as const,  label: "✨ Premium",  sub: `GPT Image 2 · ${premiumImageCredits} credits`, badge: "NEW" },
            ]).map(({ value, label, sub, badge }) => (
              <button
                key={value}
                onClick={() => setImageModel(value)}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all",
                  imageModel === value
                    ? "bg-violet-50 dark:bg-violet-900/20 border-violet-500"
                    : "border-gray-200 dark:border-gray-700 hover:border-violet-300"
                )}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm font-medium">{label}</span>
                  {badge && (
                    <span className="text-xs bg-violet-100 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded font-medium">
                      {badge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{sub}</div>
              </button>
            ))}
          </div>
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
              Generate Image · {imageModel === "premium" ? premiumImageCredits : standardImageCredits} credits
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
              {result.input_data?.enriched_prompt && (
                <details className="mb-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                    ✨ AI-enhanced prompt
                  </summary>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {result.input_data.enriched_prompt}
                  </p>
                </details>
              )}
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
                  onClick={() => {
                    useComposeStore.getState().addMedia({ id: Date.now().toString(), url: result.output_data!.url!, type: "image" });
                    toast.success("Image added to composer!");
                    router.push("/compose");
                  }}
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [concept, setConcept] = React.useState("");
  const [duration, setDuration] = React.useState<5 | 10>(5);
  const [style, setStyle] = React.useState("cinematic");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  // Elapsed seconds since generation started — used for honest "this is
  // taking ~Ns" messaging instead of a fake progress bar that decrements a
  // made-up queue position.
  const [elapsed, setElapsed] = React.useState(0);
  const [result, setResult] = React.useState<AIJob | null>(null);

  React.useEffect(() => {
    if (!isGenerating) { setElapsed(0); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  useJobPoller(jobId, (job) => {
    setResult(job);
    setJobId(null);
    setIsGenerating(false);
    queryClient.invalidateQueries({ queryKey: ["ai-credits"] });
  }, () => {
    setJobId(null);
    setIsGenerating(false);
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
                  Generating your video
                </p>
                <p className="text-xs text-muted-foreground">
                  Elapsed: {Math.floor(elapsed / 60)}m {elapsed % 60}s · this usually takes 2–5 min
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                You can navigate away — we'll notify you in the bell when it's ready.
              </p>
              {jobId && (
                <a href="/ai/jobs" className="text-xs text-violet-600 hover:underline">
                  View job status →
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {result?.output_data?.url && (
          <Card className="border-violet-200 dark:border-violet-800">
            <CardContent className="p-4">
              <video
                src={result.output_data.url}
                controls
                className="w-full rounded-lg mb-3"
              />
              {result.input_data?.enriched_prompt && (
                <details className="mb-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                    ✨ AI-enhanced prompt
                  </summary>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {result.input_data.enriched_prompt}
                  </p>
                </details>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => {
                    useComposeStore.getState().addMedia({ id: Date.now().toString(), url: result!.output_data!.url!, type: "video" });
                    toast.success("Video added to composer!");
                    router.push("/compose");
                  }}
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

// ==================== Carousel Generator Tab ====================
//
// Generates a swipeable slide deck for a topic. Each slide has a headline,
// body copy, optional CTA, and an image-prompt the user can feed straight
// into Generate Image. The tab does NOT auto-generate images for every slide
// — that would burn 6× the credits without confirmation. Users opt in
// per-slide instead.

interface CarouselSlide {
  slide_number: number;
  headline: string;
  body_text: string;
  call_to_action?: string;
  image_prompt: string;
}

function CarouselGeneratorTab() {
  const [topic, setTopic] = React.useState("");
  const [slides, setSlides] = React.useState(6);
  const [platform, setPlatform] = React.useState("instagram");
  const [result, setResult] = React.useState<CarouselSlide[] | null>(null);
  const [active, setActive] = React.useState(0);

  const mut = useMutation({
    mutationFn: () =>
      aiApi.generateCarousel({ topic, slides, platform }),
    onSuccess: (res) => {
      const list = res.data?.slides ?? [];
      setResult(list);
      setActive(0);
      toast.success(`${list.length} slides generated`);
    },
    onError: (err: Error) => {
      const m = err.message ?? "Failed to generate carousel";
      toast.error(
        m.toLowerCase().includes("insufficient")
          ? "Out of AI credits. Top up in Billing to keep using AI."
          : m
      );
    },
  });

  const copyOne = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Left: form ──────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <Label htmlFor="carousel-topic" className="text-sm">Topic / Hook</Label>
            <Textarea
              id="carousel-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. 5 ways to grow your Instagram following organically in 2026"
              rows={3}
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Tip: write it like the first slide hook. The AI mirrors your phrasing.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Number of slides</Label>
              <Select value={String(slides)} onValueChange={(v) => setSlides(Number(v))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 5, 6, 7, 8, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} slides</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="threads">Threads</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => mut.mutate()}
            disabled={!topic.trim() || mut.isPending}
          >
            {mut.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating {slides} slides…</>
            ) : (
              <><LayoutGrid className="h-4 w-4 mr-2" /> Generate Carousel</>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Uses 1 AI credit · Generates text only · Image generation is per-slide
          </p>
        </CardContent>
      </Card>

      {/* ── Right: preview ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6">
          {!result ? (
            <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
              <LayoutGrid className="h-12 w-12 mb-3 text-gray-300 dark:text-gray-700" />
              <p className="text-sm">Your generated slides will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Slide nav strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {result.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={cn(
                      "h-8 w-8 flex-shrink-0 rounded-md text-xs font-medium border transition-colors",
                      active === i
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-violet-300"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              {/* Active slide */}
              {result[active] && (
                <div className="space-y-3">
                  <div className="p-5 rounded-lg bg-gradient-to-br from-violet-50 to-pink-50 dark:from-violet-950/40 dark:to-pink-950/40 border border-violet-200 dark:border-violet-800 min-h-[200px] flex flex-col justify-center">
                    <p className="text-[10px] uppercase tracking-wider text-violet-600 dark:text-violet-300 font-semibold mb-2">
                      Slide {result[active].slide_number} of {result.length}
                    </p>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mb-2">
                      {result[active].headline}
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                      {result[active].body_text}
                    </p>
                    {result[active].call_to_action && (
                      <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-800/60">
                        <p className="text-xs uppercase tracking-wider text-pink-600 dark:text-pink-300 font-semibold mb-0.5">
                          Call to action
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {result[active].call_to_action}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                      🎨 Image prompt for this slide
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {result[active].image_prompt}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => copyOne(result[active].image_prompt)}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy prompt
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-2">
                    <button
                      onClick={() => setActive(Math.max(0, active - 1))}
                      disabled={active === 0}
                      className="text-violet-600 dark:text-violet-300 hover:underline disabled:opacity-30 disabled:no-underline"
                    >
                      ← Previous
                    </button>
                    <span>{active + 1} / {result.length}</span>
                    <button
                      onClick={() => setActive(Math.min(result.length - 1, active + 1))}
                      disabled={active === result.length - 1}
                      className="text-violet-600 dark:text-violet-300 hover:underline disabled:opacity-30 disabled:no-underline"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  const all = result
                    .map(
                      (s) =>
                        `Slide ${s.slide_number}:\n${s.headline}\n\n${s.body_text}${
                          s.call_to_action ? `\n\nCTA: ${s.call_to_action}` : ""
                        }`
                    )
                    .join("\n\n———\n\n");
                  copyOne(all);
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy all slides
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
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
          <TabsTrigger value="carousel" className="gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5" />
            Carousel
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
        <TabsContent value="carousel">
          <CarouselGeneratorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
