"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Copy,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  Music,
  Facebook,
  Globe,
} from "lucide-react";

type SubTab = "mine" | "public";

interface Template {
  id: number;
  name: string;
  platform: string;
  type: string;
  usedCount: number;
  lastUsed: string;
  prompt: string;
  exampleOutput: string;
}

interface PublicTemplate {
  id: number;
  name: string;
  platform: string;
  type: string;
  description: string;
  copiedCount: number;
}

const myTemplates: Template[] = [
  {
    id: 1, name: "Product launch caption", platform: "Instagram", type: "Caption",
    usedCount: 12, lastUsed: "2 days ago",
    prompt: "Write an engaging Instagram caption for a product launch. Include excitement, key features, and a CTA.",
    exampleOutput: "🚀 It's finally here! Introducing [Product Name]...",
  },
  {
    id: 2, name: "LinkedIn thought leadership", platform: "LinkedIn", type: "Thread",
    usedCount: 8, lastUsed: "5 days ago",
    prompt: "Write a LinkedIn post sharing industry insights and positioning the author as a thought leader.",
    exampleOutput: "After 10 years in the industry, here's what I've learned...",
  },
  {
    id: 3, name: "YouTube video description", platform: "YouTube", type: "Description",
    usedCount: 5, lastUsed: "1 week ago",
    prompt: "Create an SEO-optimized YouTube video description with timestamps and hashtags.",
    exampleOutput: "In this video, we cover everything you need to know about...",
  },
  {
    id: 4, name: "Thread storm", platform: "Twitter", type: "Thread",
    usedCount: 15, lastUsed: "1 day ago",
    prompt: "Write a 10-tweet thread breaking down a complex topic into digestible insights.",
    exampleOutput: "1/ Let me break down why [topic] is changing everything...",
  },
  {
    id: 5, name: "TikTok viral hook", platform: "TikTok", type: "Caption",
    usedCount: 22, lastUsed: "3 hours ago",
    prompt: "Create a viral TikTok hook and caption that stops the scroll in the first 3 seconds.",
    exampleOutput: "POV: You just discovered the hack nobody talks about...",
  },
  {
    id: 6, name: "Agency case study", platform: "LinkedIn", type: "Story",
    usedCount: 3, lastUsed: "2 weeks ago",
    prompt: "Write a compelling agency case study post showing transformation and results.",
    exampleOutput: "We helped [Client] go from $0 to $100K in 90 days. Here's exactly how...",
  },
  {
    id: 7, name: "Promotional reel caption", platform: "Instagram", type: "Caption",
    usedCount: 9, lastUsed: "4 days ago",
    prompt: "Write a short, punchy Instagram Reels caption that drives engagement and saves.",
    exampleOutput: "Save this before you need it 🔖 Here's the secret to...",
  },
  {
    id: 8, name: "Pinterest pin description", platform: "Pinterest", type: "Description",
    usedCount: 4, lastUsed: "1 week ago",
    prompt: "Create a keyword-rich Pinterest pin description that drives clicks and saves.",
    exampleOutput: "Discover the ultimate guide to [topic]. Save this pin for later!",
  },
];

const publicTemplates: PublicTemplate[] = [
  { id: 101, name: "SaaS launch announcement", platform: "Twitter", type: "Thread", description: "Perfect for announcing a new software product or feature launch.", copiedCount: 1240 },
  { id: 102, name: "Morning motivation post", platform: "Instagram", type: "Caption", description: "Uplifting Monday morning content that resonates with your audience.", copiedCount: 3450 },
  { id: 103, name: "How-to tutorial thread", platform: "LinkedIn", type: "Thread", description: "Step-by-step educational threads that showcase expertise.", copiedCount: 890 },
  { id: 104, name: "Behind the scenes", platform: "TikTok", type: "Caption", description: "Authentic BTS content that builds brand trust and authenticity.", copiedCount: 2100 },
  { id: 105, name: "Weekly newsletter intro", platform: "LinkedIn", type: "Description", description: "Compelling newsletter opening that drives clicks to read more.", copiedCount: 670 },
  { id: 106, name: "Client testimonial carousel", platform: "Instagram", type: "Caption", description: "Social proof content formatted for carousel posts.", copiedCount: 1560 },
  { id: 107, name: "YouTube shorts hook", platform: "YouTube", type: "Caption", description: "High-retention YouTube Shorts opening hooks that perform.", copiedCount: 980 },
  { id: 108, name: "Product comparison post", platform: "Twitter", type: "Thread", description: "Contrarian comparison threads that drive discussion.", copiedCount: 430 },
  { id: 109, name: "Community building CTA", platform: "Facebook", type: "Caption", description: "Community-focused posts that encourage engagement and sharing.", copiedCount: 320 },
  { id: 110, name: "Thought leadership opener", platform: "LinkedIn", type: "Story", description: "Bold opening statements that capture attention immediately.", copiedCount: 2890 },
  { id: 111, name: "Event promotion post", platform: "Instagram", type: "Caption", description: "Urgency-driven event promotion with compelling CTAs.", copiedCount: 755 },
  { id: 112, name: "Pinterest seasonal content", platform: "Pinterest", type: "Description", description: "Seasonal content optimized for Pinterest search and discovery.", copiedCount: 1200 },
];

function PlatformIcon({ platform, size = "sm" }: { platform: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const map: Record<string, React.ReactNode> = {
    Instagram: <Instagram className={cn(cls, "text-pink-500")} />,
    LinkedIn: <Linkedin className={cn(cls, "text-blue-700")} />,
    YouTube: <Youtube className={cn(cls, "text-red-500")} />,
    Twitter: <Twitter className={cn(cls, "text-sky-500")} />,
    TikTok: <Music className={cn(cls, "text-gray-800 dark:text-gray-200")} />,
    Facebook: <Facebook className={cn(cls, "text-blue-600")} />,
    Pinterest: <Globe className={cn(cls, "text-red-600")} />,
    Threads: <Globe className={cn(cls, "text-gray-800 dark:text-gray-200")} />,
  };
  return <>{map[platform] ?? <Globe className={cn(cls, "text-gray-400")} />}</>;
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    Instagram: "bg-pink-50 text-pink-600 dark:bg-pink-950/30 dark:text-pink-400 border-pink-200 dark:border-pink-800",
    LinkedIn: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    YouTube: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-800",
    Twitter: "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400 border-sky-200 dark:border-sky-800",
    TikTok: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700",
    Facebook: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    Pinterest: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", colors[platform] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
      <PlatformIcon platform={platform} />
      {platform}
    </span>
  );
}

interface CreateFormState {
  name: string;
  platform: string;
  type: string;
  prompt: string;
  exampleOutput: string;
  isPublic: boolean;
}

const defaultForm: CreateFormState = {
  name: "",
  platform: "Instagram",
  type: "Caption",
  prompt: "",
  exampleOutput: "",
  isPublic: false,
};

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = React.useState<SubTab>("mine");
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [form, setForm] = React.useState<CreateFormState>(defaultForm);
  const [templates, setTemplates] = React.useState<Template[]>(myTemplates);
  const [copiedIds, setCopiedIds] = React.useState<Set<number>>(new Set());
  const [editingId, setEditingId] = React.useState<number | null>(null);

  const handleCreate = () => {
    if (!form.name.trim()) return;
    const newTemplate: Template = {
      id: Date.now(),
      name: form.name,
      platform: form.platform,
      type: form.type,
      usedCount: 0,
      lastUsed: "Never",
      prompt: form.prompt,
      exampleOutput: form.exampleOutput,
    };
    setTemplates([newTemplate, ...templates]);
    setForm(defaultForm);
    setShowCreateForm(false);
  };

  const handleDelete = (id: number) => {
    setTemplates(templates.filter((t) => t.id !== id));
  };

  const handleCopyPublic = (id: number) => {
    setCopiedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setCopiedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }, 2000);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Sub-tab header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 gap-1">
          {([
            { id: "mine", label: "My Templates" },
            { id: "public", label: "Public Templates" },
          ] as { id: SubTab; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "mine" && (
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        )}
      </div>

      {/* Create Template Form (inline) */}
      {showCreateForm && activeTab === "mine" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-violet-200 dark:border-violet-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">New Template</h3>
            <button
              onClick={() => setShowCreateForm(false)}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Template Name *</label>
              <input
                type="text"
                placeholder="e.g. Product launch caption"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {["Instagram", "LinkedIn", "YouTube", "Twitter", "TikTok", "Facebook", "Pinterest", "Threads"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Template Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {["Caption", "Thread", "Story", "Description"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Make Public</label>
                <button
                  onClick={() => setForm({ ...form, isPublic: !form.isPublic })}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors mt-1",
                    form.isPublic ? "bg-violet-600" : "bg-gray-200 dark:bg-gray-700"
                  )}
                >
                  <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow", form.isPublic ? "translate-x-4" : "translate-x-1")} />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prompt Text</label>
            <textarea
              placeholder="Describe what AI should generate when using this template..."
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Example Output</label>
            <textarea
              placeholder="Paste an example of what the output should look like..."
              value={form.exampleOutput}
              onChange={(e) => setForm({ ...form, exampleOutput: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleCreate}
            >
              Create Template
            </Button>
          </div>
        </div>
      )}

      {/* My Templates grid */}
      {activeTab === "mine" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-violet-200 dark:hover:border-violet-800 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <PlatformBadge platform={template.platform} />
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingId(editingId === template.id ? null : template.id)}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1 leading-tight">
                {template.name}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {template.type} · Used {template.usedCount}×
              </p>

              {template.exampleOutput && (
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3 italic">
                  &ldquo;{template.exampleOutput}&rdquo;
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Last used: {template.lastUsed}</span>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 px-3">
                  Use
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Public Templates grid */}
      {activeTab === "public" && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Curated by SocialForge — copy any template to your library and customize it.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {publicTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-violet-200 dark:hover:border-violet-800 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <PlatformBadge platform={template.platform} />
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                    ✦ Official
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1 leading-tight">
                  {template.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{template.type}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                  {template.description}
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{template.copiedCount.toLocaleString()} copies</span>
                  <Button
                    size="sm"
                    variant={copiedIds.has(template.id) ? "outline" : "default"}
                    className={cn(
                      "text-xs h-7 px-3 gap-1",
                      !copiedIds.has(template.id) && "bg-violet-600 hover:bg-violet-700 text-white"
                    )}
                    onClick={() => handleCopyPublic(template.id)}
                  >
                    <Copy className="h-3 w-3" />
                    {copiedIds.has(template.id) ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
