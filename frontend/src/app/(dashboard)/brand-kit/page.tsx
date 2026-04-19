"use client";

import * as React from "react";
import {
  Palette,
  Plus,
  Trash2,
  Loader2,
  Star,
  X,
  AlertTriangle,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { brandKitApi } from "@/lib/api";
import { BrandKit, CreateBrandKitRequest } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Constants ──────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Technology",
  "E-commerce",
  "Food & Beverage",
  "Fashion",
  "Health & Fitness",
  "Real Estate",
  "Finance",
  "Education",
  "Entertainment",
  "Non-profit",
  "Other",
];

// ── Completeness score ─────────────────────────────────────────────────────

function computeCompleteness(kit: BrandKit): number {
  let filled = 0;
  if (kit.name?.trim()) filled++;
  if (kit.industry) filled++;
  if (kit.primary_color) filled++;
  if (kit.secondary_color) filled++;
  if (kit.brand_voice?.trim()) filled++;
  if (kit.target_audience?.trim()) filled++;
  if ((kit.content_pillars ?? []).length >= 2) filled++;
  if ((kit.brand_hashtags ?? []).length >= 1) filled++;
  if ((kit.dos ?? []).length >= 1) filled++;
  if ((kit.donts ?? []).length >= 1) filled++;
  if (kit.logo_url?.trim()) filled++;
  return Math.round((filled / 11) * 100);
}

function completenessColor(pct: number) {
  if (pct < 40) return "bg-red-500";
  if (pct < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function completenessLabel(pct: number) {
  if (pct < 40) return "Getting started";
  if (pct < 70) return "Good progress";
  return "Well defined";
}

// ── TagInput ───────────────────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  placeholder,
  max,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (max !== undefined && value.length >= max) {
      toast.error(`Maximum ${max} items allowed.`);
      return;
    }
    if (value.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const atMax = max !== undefined && value.length >= max;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 px-2.5 py-0.5 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              className="ml-0.5 hover:text-violet-600 dark:hover:text-violet-200 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {!atMax && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="flex-1 text-sm h-8"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={add}
            disabled={!draft.trim()}
            className="h-8 px-3"
          >
            Add
          </Button>
        </div>
      )}
      {max && (
        <p className="text-xs text-muted-foreground">
          {value.length}/{max} {max === 6 ? "pillars" : "items"}
        </p>
      )}
    </div>
  );
}

// ── ColorField ─────────────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value || "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-9 cursor-pointer rounded border border-gray-200 dark:border-gray-700 bg-transparent p-0.5"
          />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 font-mono text-sm h-9"
          maxLength={7}
        />
        {value && /^#[0-9A-Fa-f]{6}$/.test(value) && (
          <div
            className="h-9 w-9 rounded border border-gray-200 dark:border-gray-700 flex-shrink-0"
            style={{ backgroundColor: value }}
          />
        )}
      </div>
    </div>
  );
}

// ── LogoPreview ────────────────────────────────────────────────────────────

function LogoPreview({ url, label }: { url: string; label: string }) {
  const [valid, setValid] = React.useState(false);
  React.useEffect(() => {
    setValid(false);
    if (!url) return;
    try {
      new URL(url);
      setValid(true);
    } catch {
      setValid(false);
    }
  }, [url]);

  if (!valid) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={label}
      onError={() => setValid(false)}
      className="mt-2 h-12 max-w-[200px] object-contain rounded border border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-gray-900"
    />
  );
}

// ── Brand Kit Editor ───────────────────────────────────────────────────────

interface EditorProps {
  kit: BrandKit;
  onSaved: (kit: BrandKit) => void;
  onDeleted: () => void;
}

function BrandKitEditor({ kit, onSaved, onDeleted }: EditorProps) {
  // Local state mirrors kit fields
  const [name, setName] = React.useState(kit.name);
  const [industry, setIndustry] = React.useState(kit.industry ?? "");
  const [isDefault, setIsDefault] = React.useState(kit.is_default);
  const [primaryColor, setPrimaryColor] = React.useState(kit.primary_color ?? "");
  const [secondaryColor, setSecondaryColor] = React.useState(kit.secondary_color ?? "");
  const [accentColor, setAccentColor] = React.useState(kit.accent_color ?? "");
  const [logoUrl, setLogoUrl] = React.useState(kit.logo_url ?? "");
  const [logoDarkUrl, setLogoDarkUrl] = React.useState(kit.logo_dark_url ?? "");
  const [brandVoice, setBrandVoice] = React.useState(kit.brand_voice ?? "");
  const [targetAudience, setTargetAudience] = React.useState(kit.target_audience ?? "");
  const [contentPillars, setContentPillars] = React.useState<string[]>(kit.content_pillars ?? []);
  const [brandHashtags, setBrandHashtags] = React.useState<string[]>(kit.brand_hashtags ?? []);
  const [dos, setDos] = React.useState<string[]>(kit.dos ?? []);
  const [donts, setDonts] = React.useState<string[]>(kit.donts ?? []);

  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  // Build a synthetic kit for completeness score
  const syntheticKit: BrandKit = {
    ...kit,
    name,
    industry: industry || undefined,
    primary_color: primaryColor || undefined,
    secondary_color: secondaryColor || undefined,
    brand_voice: brandVoice || undefined,
    target_audience: targetAudience || undefined,
    content_pillars: contentPillars,
    brand_hashtags: brandHashtags,
    dos,
    donts,
    logo_url: logoUrl || undefined,
  };
  const completeness = computeCompleteness(syntheticKit);
  const colorClass = completenessColor(completeness);

  const buildPayload = (): Partial<CreateBrandKitRequest> => ({
    name: name.trim(),
    industry: industry || undefined,
    is_default: isDefault,
    primary_color: primaryColor || undefined,
    secondary_color: secondaryColor || undefined,
    accent_color: accentColor || undefined,
    logo_url: logoUrl || undefined,
    logo_dark_url: logoDarkUrl || undefined,
    brand_voice: brandVoice || undefined,
    target_audience: targetAudience || undefined,
    content_pillars: contentPillars,
    brand_hashtags: brandHashtags,
    dos,
    donts,
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await brandKitApi.update(kit.id, buildPayload());
      toast.success("Brand kit saved.");
      onSaved(res.data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save brand kit.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (checked: boolean) => {
    setIsDefault(checked);
    if (checked) {
      try {
        const res = await brandKitApi.setDefault(kit.id);
        toast.success("Set as default brand kit.");
        onSaved(res.data);
      } catch (err: unknown) {
        setIsDefault(false);
        toast.error(err instanceof Error ? err.message : "Failed to set default.");
      }
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await brandKitApi.delete(kit.id);
      toast.success("Brand kit deleted.");
      setDeleteDialogOpen(false);
      onDeleted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete brand kit.");
    } finally {
      setIsDeleting(false);
    }
  };

  const hasColors = primaryColor || secondaryColor || accentColor;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{kit.name}</h3>
          {kit.is_default && (
            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-xs border-0">
              <Star className="h-3 w-3 mr-1" />
              Default
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="mb-4 flex-wrap h-auto gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <TabsTrigger value="identity" className="text-xs sm:text-sm">Identity</TabsTrigger>
          <TabsTrigger value="visual" className="text-xs sm:text-sm">Visual</TabsTrigger>
          <TabsTrigger value="voice" className="text-xs sm:text-sm">Voice & Audience</TabsTrigger>
          <TabsTrigger value="content" className="text-xs sm:text-sm">Content Strategy</TabsTrigger>
          <TabsTrigger value="guidelines" className="text-xs sm:text-sm">Guidelines</TabsTrigger>
        </TabsList>

        {/* Tab 1: Identity */}
        <TabsContent value="identity">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Brand Identity</CardTitle>
              <CardDescription>Basic information about this brand kit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor={`bk-name-${kit.id}`}>
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id={`bk-name-${kit.id}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`bk-industry-${kit.id}`}>Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger id={`bk-industry-${kit.id}`}>
                    <SelectValue placeholder="Select industry…" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Set as Default</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    AI will use this brand kit by default when generating content.
                  </p>
                </div>
                <Switch
                  checked={isDefault}
                  onCheckedChange={handleSetDefault}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Visual Identity */}
        <TabsContent value="visual">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Visual Identity</CardTitle>
              <CardDescription>Colors and logos that define your brand.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ColorField label="Primary Color" value={primaryColor} onChange={setPrimaryColor} />
              <ColorField label="Secondary Color" value={secondaryColor} onChange={setSecondaryColor} />
              <ColorField label="Accent Color" value={accentColor} onChange={setAccentColor} />

              {hasColors && (
                <div className="space-y-2">
                  <Label className="text-sm">Color Preview</Label>
                  <div className="flex gap-2">
                    {[
                      { color: primaryColor, label: "Primary" },
                      { color: secondaryColor, label: "Secondary" },
                      { color: accentColor, label: "Accent" },
                    ]
                      .filter((c) => c.color && /^#[0-9A-Fa-f]{6}$/.test(c.color))
                      .map((c) => (
                        <div key={c.label} className="flex flex-col items-center gap-1">
                          <div
                            className="h-10 w-16 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="text-xs text-muted-foreground">{c.label}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`bk-logo-${kit.id}`}>Logo URL</Label>
                <Input
                  id={`bk-logo-${kit.id}`}
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
                {logoUrl && (
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Preview:</span>
                    <LogoPreview url={logoUrl} label="Logo" />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`bk-logo-dark-${kit.id}`}>Logo (Dark Mode) URL</Label>
                <Input
                  id={`bk-logo-dark-${kit.id}`}
                  value={logoDarkUrl}
                  onChange={(e) => setLogoDarkUrl(e.target.value)}
                  placeholder="https://example.com/logo-dark.png"
                />
                {logoDarkUrl && (
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Preview:</span>
                    <LogoPreview url={logoDarkUrl} label="Logo Dark" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Voice & Audience */}
        <TabsContent value="voice">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Voice & Audience</CardTitle>
              <CardDescription>
                Define how your brand communicates and who it speaks to.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor={`bk-voice-${kit.id}`}>Brand Voice / Tone</Label>
                <Textarea
                  id={`bk-voice-${kit.id}`}
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="Describe how your brand speaks… e.g. 'Professional yet approachable, uses industry jargon sparingly, never uses slang, always ends with a clear call to action'"
                  rows={5}
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`bk-audience-${kit.id}`}>Target Audience</Label>
                <Textarea
                  id={`bk-audience-${kit.id}`}
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Who is your ideal customer? e.g. 'Women aged 25-40, interested in skincare and wellness, middle to high income, active on Instagram and TikTok'"
                  rows={5}
                  className="resize-none text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Content Strategy */}
        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Content Strategy</CardTitle>
              <CardDescription>
                Content pillars and hashtags that shape your presence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Content Pillars</Label>
                  <span className="text-xs text-muted-foreground">
                    {contentPillars.length}/6 pillars
                  </span>
                </div>
                <TagInput
                  value={contentPillars}
                  onChange={setContentPillars}
                  placeholder="e.g. Education, Behind the Scenes, Product Showcase"
                  max={6}
                />
              </div>

              <div className="space-y-2">
                <Label>Brand Hashtags</Label>
                <TagInput
                  value={brandHashtags}
                  onChange={setBrandHashtags}
                  placeholder="e.g. #YourBrand, #YourNiche"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Guidelines */}
        <TabsContent value="guidelines">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Brand Guidelines</CardTitle>
                <CardDescription>
                  Rules the AI will always follow when creating content.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-green-700 dark:text-green-400">
                    Do&apos;s — things the brand always does
                  </Label>
                  <TagInput
                    value={dos}
                    onChange={setDos}
                    placeholder="e.g. Always use inclusive language"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-red-600 dark:text-red-400">
                    Don&apos;ts — things to never do or say
                  </Label>
                  <TagInput
                    value={donts}
                    onChange={setDonts}
                    placeholder='e.g. Never use the word "cheap"'
                  />
                </div>
              </CardContent>
            </Card>

            {/* Completeness card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Brand Kit Completeness</CardTitle>
                <CardDescription>
                  A more complete brand kit gives the AI richer context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      completeness < 40
                        ? "text-red-600 dark:text-red-400"
                        : completeness < 70
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {completeness}% complete
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {completenessLabel(completeness)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", colorClass)}
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Scored on: name, industry, colors (primary + secondary), brand voice, target audience,
                  content pillars (≥2), hashtags (≥1), do&apos;s (≥1), don&apos;ts (≥1), logo URL.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete Brand Kit
        </Button>
        <Button
          className="bg-violet-600 hover:bg-violet-700 text-white"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Changes
        </Button>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Brand Kit
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{kit.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-5">
        <Palette className="h-8 w-8 text-violet-600 dark:text-violet-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        No brand kits yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        A Brand Kit is your workspace&apos;s brand identity. The AI uses it when generating campaign
        content — including colors, tone, audience, hashtags, and content guidelines.
      </p>
      <Button
        className="bg-violet-600 hover:bg-violet-700 text-white"
        onClick={onNew}
      >
        <Plus className="h-4 w-4 mr-2" />
        Create your first Brand Kit
      </Button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function BrandKitPage() {
  const [kits, setKits] = React.useState<BrandKit[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeKitId, setActiveKitId] = React.useState<string | null>(null);

  const [newDialogOpen, setNewDialogOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);

  const activeKit = kits.find((k) => k.id === activeKitId) ?? kits[0] ?? null;

  // Load on mount
  React.useEffect(() => {
    setIsLoading(true);
    brandKitApi
      .list()
      .then((res) => {
        const list = res.data ?? [];
        setKits(list);
        // Prefer default kit, else first
        const def = list.find((k) => k.is_default);
        setActiveKitId(def?.id ?? list[0]?.id ?? null);
      })
      .catch(() => toast.error("Failed to load brand kits."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Name is required.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await brandKitApi.create({
        name: newName.trim(),
        is_default: kits.length === 0,
      });
      const created = res.data;
      setKits((prev) => [...prev, created]);
      setActiveKitId(created.id);
      setNewDialogOpen(false);
      setNewName("");
      toast.success("Brand kit created.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create brand kit.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaved = (updated: BrandKit) => {
    setKits((prev) =>
      prev.map((k) => {
        if (k.id === updated.id) return updated;
        // If updated is now default, clear others
        if (updated.is_default) return { ...k, is_default: false };
        return k;
      })
    );
  };

  const handleDeleted = () => {
    setKits((prev) => {
      const next = prev.filter((k) => k.id !== activeKitId);
      const def = next.find((k) => k.is_default);
      setActiveKitId(def?.id ?? next[0]?.id ?? null);
      return next;
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Brand Kit</h2>
          <p className="text-sm text-muted-foreground">
            Manage your brand identities. The AI uses these when generating content.
          </p>
        </div>
        <Button
          className="bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => setNewDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Brand Kit
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && kits.length === 0 && (
        <EmptyState onNew={() => setNewDialogOpen(true)} />
      )}

      {/* Kit list + editor */}
      {!isLoading && kits.length > 0 && (
        <div className="space-y-4">
          {/* Kit selector tabs (when multiple) */}
          {kits.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {kits.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setActiveKitId(k.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    activeKitId === k.id || (!activeKitId && k.id === kits[0]?.id)
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {k.name}
                  {k.is_default && <Star className="h-3 w-3" />}
                </button>
              ))}
            </div>
          )}

          {/* Active kit summary strip */}
          {activeKit && kits.length === 1 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
              <div
                className="h-8 w-8 rounded-md border border-gray-200 dark:border-gray-700 flex-shrink-0"
                style={{ backgroundColor: activeKit.primary_color || "#7C3AED" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {activeKit.name}
                </p>
                {activeKit.industry && (
                  <p className="text-xs text-muted-foreground">{activeKit.industry}</p>
                )}
              </div>
              {activeKit.is_default && (
                <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-xs border-0 flex-shrink-0">
                  <Star className="h-3 w-3 mr-1" />
                  Default
                </Badge>
              )}
              <div className="text-xs text-muted-foreground flex-shrink-0">
                {computeCompleteness(activeKit)}% complete
              </div>
            </div>
          )}

          {/* Editor */}
          {activeKit && (
            <BrandKitEditor
              key={activeKit.id}
              kit={activeKit}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          )}
        </div>
      )}

      {/* New kit dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Brand Kit</DialogTitle>
            <DialogDescription>
              Give your brand kit a name. You&apos;ll fill in the details after.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-bk-name">Name</Label>
              <Input
                id="new-bk-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Main Brand, Summer Campaign"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewDialogOpen(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!newName.trim() || isCreating}
              onClick={handleCreate}
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
