"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiKeysApi } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Webhook,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Terminal,
  Code2,
  Globe,
  Loader2,
} from "lucide-react";

type CodeTab = "curl" | "nodejs" | "python";

interface WebhookDelivery {
  id: number;
  status: number;
  event: string;
  timestamp: string;
  duration: string;
}

const webhookDeliveries: WebhookDelivery[] = [
  { id: 1, status: 200, event: "post.published", timestamp: "2 min ago", duration: "142ms" },
  { id: 2, status: 200, event: "post.published", timestamp: "15 min ago", duration: "98ms" },
  { id: 3, status: 500, event: "ai_job.completed", timestamp: "1 hour ago", duration: "5001ms" },
  { id: 4, status: 200, event: "post.scheduled", timestamp: "2 hours ago", duration: "110ms" },
  { id: 5, status: 404, event: "account.disconnected", timestamp: "3 hours ago", duration: "230ms" },
  { id: 6, status: 200, event: "post.published", timestamp: "5 hours ago", duration: "125ms" },
  { id: 7, status: 200, event: "billing.updated", timestamp: "Yesterday", duration: "88ms" },
  { id: 8, status: 200, event: "post.published", timestamp: "Yesterday", duration: "102ms" },
  { id: 9, status: 200, event: "ai_job.completed", timestamp: "2 days ago", duration: "156ms" },
  { id: 10, status: 422, event: "post.failed", timestamp: "2 days ago", duration: "67ms" },
];

const codeExamples: Record<CodeTab, string> = {
  curl: `# Authenticate with your API key
curl -X POST https://api.ChiselPost.io/v1/workspaces/ws_abc123/posts \\
  -H "Authorization: Bearer sf_live_a8f3..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "platforms": ["instagram", "linkedin", "twitter"],
    "content": "Exciting news — our new feature is live! 🚀",
    "scheduled_at": "2025-04-10T09:00:00Z",
    "media_ids": ["media_xyz789"]
  }'

# Response
{
  "id": "post_k9m3x",
  "status": "scheduled",
  "platforms": ["instagram", "linkedin", "twitter"],
  "scheduled_at": "2025-04-10T09:00:00Z",
  "created_at": "2025-04-06T14:30:00Z"
}`,
  nodejs: `import ChiselPost from '@ChiselPost/node';

const client = new ChiselPost({
  apiKey: process.env.SF_API_KEY,
  workspaceId: 'ws_abc123',
});

// Schedule a post across platforms
const post = await client.posts.create({
  platforms: ['instagram', 'linkedin', 'twitter'],
  content: 'Exciting news — our new feature is live! 🚀',
  scheduledAt: new Date('2025-04-10T09:00:00Z'),
  mediaIds: ['media_xyz789'],
});

console.log('Post scheduled:', post.id);

// Listen for webhook events
client.webhooks.on('post.published', (event) => {
  console.log('Post published:', event.postId);
});`,
  python: `from ChiselPost import ChiselPost
import os

client = ChiselPost(
    api_key=os.environ["SF_API_KEY"],
    workspace_id="ws_abc123"
)

# Schedule a post across platforms
post = client.posts.create(
    platforms=["instagram", "linkedin", "twitter"],
    content="Exciting news — our new feature is live! 🚀",
    scheduled_at="2025-04-10T09:00:00Z",
    media_ids=["media_xyz789"]
)

print(f"Post scheduled: {post.id}")

# Retrieve post analytics
analytics = client.analytics.get_post(post.id)
print(f"Engagement rate: {analytics.engagement_rate}%")`,
};

const integrations = [
  {
    name: "n8n",
    description: "Official node available — automate workflows with ChiselPost triggers and actions.",
    badge: "Official node available",
    badgeColor: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    iconBg: "bg-orange-100 dark:bg-orange-900/20",
    iconColor: "text-orange-600 dark:text-orange-400",
    buttonLabel: "Install Node",
    buttonVariant: "default" as const,
  },
  {
    name: "Make.com",
    description: "Official connector available — build powerful multi-step automations.",
    badge: "Official connector",
    badgeColor: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    iconBg: "bg-purple-100 dark:bg-purple-900/20",
    iconColor: "text-purple-600 dark:text-purple-400",
    buttonLabel: "Connect",
    buttonVariant: "default" as const,
  },
  {
    name: "Zapier",
    description: "Connect ChiselPost with 5,000+ apps. Coming soon to Zapier's marketplace.",
    badge: "Coming soon",
    badgeColor: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    iconBg: "bg-orange-100 dark:bg-orange-900/20",
    iconColor: "text-orange-500 dark:text-orange-400",
    buttonLabel: "Notify me",
    buttonVariant: "outline" as const,
  },
  {
    name: "Pabbly Connect",
    description: "One-time payment automation platform integration. Coming soon.",
    badge: "Coming soon",
    badgeColor: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    iconBg: "bg-blue-100 dark:bg-blue-900/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    buttonLabel: "Notify me",
    buttonVariant: "outline" as const,
  },
];

function StatusIcon({ status }: { status: number }) {
  if (status === 200) return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status >= 500) return <XCircle className="h-4 w-4 text-red-500" />;
  return <AlertCircle className="h-4 w-4 text-amber-500" />;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatLastUsed(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return formatDate(dateStr);
}

export default function DeveloperPage() {
  const queryClient = useQueryClient();

  const { data: keysData, isLoading, error } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysApi.list(),
  });
  const apiKeys = (keysData?.data ?? []).map((k: any) => ({
    ...k,
    createdAt: k.createdAt ?? k.created_at,
    lastUsedAt: k.lastUsedAt ?? k.last_used_at,
    keyPreview: k.keyPreview ?? k.key_prefix,
    workspaceId: k.workspaceId ?? k.workspace_id,
  }));

  const createMutation = useMutation({
    mutationFn: (data: { name: string; permissions?: string[] }) => apiKeysApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setCreatedKey(res.data.key);
      toast.success("API key created! Copy it now — it won't be shown again.");
      setNewKeyName("");
      setNewKeyPerms(["Read posts", "Write posts"]);
      setShowCreateKeyForm(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create API key");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to revoke API key");
    },
  });

  const [showCreateKeyForm, setShowCreateKeyForm] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [newKeyPerms, setNewKeyPerms] = React.useState<string[]>(["Read posts", "Write posts"]);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = React.useState("https://myapp.com/webhooks/ChiselPost");
  const [secretVisible, setSecretVisible] = React.useState(false);
  const [webhookEvents, setWebhookEvents] = React.useState<string[]>(["post.published", "post.failed"]);
  const [webhookTestResult, setWebhookTestResult] = React.useState<"idle" | "success" | "fail">("idle");
  const [codeTab, setCodeTab] = React.useState<CodeTab>("curl");
  const [copiedCode, setCopiedCode] = React.useState(false);

  const allPermissions = ["Read posts", "Write posts", "Manage accounts", "Webhooks"];
  const allEvents = ["post.published", "post.failed", "post.scheduled", "account.disconnected", "ai_job.completed", "billing.updated"];

  const togglePerm = (perm: string) => {
    setNewKeyPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const toggleEvent = (event: string) => {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    createMutation.mutate({ name: newKeyName, permissions: newKeyPerms });
  };

  const handleRevokeKey = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Enter a webhook URL first.");
      return;
    }
    setWebhookTestResult("idle");
    try {
      // Send a real test ping to the configured webhook URL via browser fetch.
      // Note: cross-origin requests may be blocked by the target server's CORS policy.
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "webhook.test",
          timestamp: new Date().toISOString(),
          data: { message: "Test ping from ChiselPost" },
        }),
        signal: AbortSignal.timeout(8000),
      });
      setWebhookTestResult(res.ok ? "success" : "fail");
    } catch {
      // Network error or CORS block — treat as failure
      setWebhookTestResult("fail");
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeExamples[codeTab]).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* === 1. API Keys === */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-violet-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API Keys</h2>
          </div>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            onClick={() => setShowCreateKeyForm(!showCreateKeyForm)}
          >
            <Plus className="h-4 w-4" />
            Create New API Key
          </Button>
        </div>

        {/* Created key modal */}
        {createdKey && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  API Key created — save it now!
                </p>
              </div>
              <button onClick={() => setCreatedKey(null)} className="text-emerald-500 hover:text-emerald-700 text-xs">
                Dismiss
              </button>
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">
              This key will only be shown once. Copy it and store it securely.
            </p>
            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg border border-emerald-200 dark:border-emerald-700 px-3 py-2">
              <code className="flex-1 text-sm font-mono text-gray-800 dark:text-gray-200 break-all">{createdKey}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(createdKey).catch(() => {}); }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Create key form */}
        {showCreateKeyForm && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New API Key</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Key Name</label>
              <input
                type="text"
                placeholder="e.g. Production, n8n Integration"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Permissions</label>
              <div className="grid grid-cols-2 gap-2">
                {allPermissions.map((perm) => (
                  <label key={perm} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newKeyPerms.includes(perm)}
                      onChange={() => togglePerm(perm)}
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{perm}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreateKeyForm(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleCreateKey}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Creating...
                  </>
                ) : (
                  "Create Key"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Keys list */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading API keys...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertCircle className="h-5 w-5 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-500">Failed to load API keys</p>
                <p className="text-xs text-gray-400 mt-1">{(error as Error).message}</p>
              </div>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Key className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No API keys yet</p>
                <p className="text-xs text-gray-400 mt-1">Create one to get started with the API</p>
              </div>
            </div>
          ) : (
            apiKeys.map((key, idx) => (
              <div
                key={key.id}
                className={cn(
                  "flex items-center gap-4 p-4",
                  idx !== apiKeys.length - 1 && "border-b border-gray-100 dark:border-gray-800"
                )}
              >
                <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                  <Key className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{key.name}</span>
                    <code className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      {key.keyPreview}
                    </code>
                  </div>
                  {key.permissions && key.permissions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {key.permissions.map((p: string) => (
                        <span key={p} className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    Created {formatDate(key.createdAt)} · Last used {formatLastUsed(key.lastUsedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeKey(key.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 dark:border-red-800 hover:border-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Revoking..." : "Revoke"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* === 2. Webhooks === */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Webhook Configuration</h2>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Webhook URL</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Secret Key</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                <code className="flex-1 text-sm font-mono text-gray-700 dark:text-gray-300">
                  {secretVisible ? "whsec_7a9f3b2e1d8c4a6f0e2b5d9c3a7f1e4b" : "whsec_••••••••••••••••••••••••••••••"}
                </code>
                <button
                  onClick={() => setSecretVisible(!secretVisible)}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                >
                  {secretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Subscribe to Events</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {allEvents.map((event) => (
                <label key={event} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhookEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <code className="text-xs text-gray-700 dark:text-gray-300">{event}</code>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleTestWebhook}>
              <Terminal className="h-3.5 w-3.5" />
              Test Webhook
            </Button>
            {webhookTestResult === "success" && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle className="h-3.5 w-3.5" /> Success — 200 OK
              </span>
            )}
            {webhookTestResult === "fail" && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <XCircle className="h-3.5 w-3.5" /> Failed — connection refused
              </span>
            )}
          </div>
        </div>

        {/* Delivery log */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Delivery Log</h3>
            <span className="text-xs text-gray-400 italic">Webhook delivery logs coming soon</span>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Event</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Duration</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
                </tr>
              </thead>
              <tbody>
                {webhookDeliveries.map((d, idx) => (
                  <tr
                    key={d.id}
                    className={cn(
                      "border-b border-gray-50 dark:border-gray-800/50",
                      idx === webhookDeliveries.length - 1 && "border-b-0"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={d.status} />
                        <span className={cn(
                          "text-xs font-mono font-medium",
                          d.status === 200 ? "text-green-600 dark:text-green-400" : d.status >= 500 ? "text-red-500" : "text-amber-500"
                        )}>
                          {d.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <code className="text-xs text-gray-700 dark:text-gray-300">{d.event}</code>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell">{d.duration}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{d.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* === 3. API Reference === */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API Quick-Start</h2>
        </div>

        <div className="bg-gray-950 rounded-xl overflow-hidden border border-gray-800">
          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-gray-800">
            {(["curl", "nodejs", "python"] as CodeTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setCodeTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-xs font-medium transition-colors",
                  codeTab === tab
                    ? "text-white border-b-2 border-violet-500"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                {tab === "curl" ? "cURL" : tab === "nodejs" ? "Node.js" : "Python"}
              </button>
            ))}
            <div className="ml-auto pr-3">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white transition-colors rounded hover:bg-gray-800"
              >
                {copiedCode ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedCode ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Code block */}
          <div className="p-5 overflow-x-auto">
            <pre className="text-sm leading-relaxed">
              {codeExamples[codeTab].split("\n").map((line, i) => {
                const isComment = line.trim().startsWith("#") || line.trim().startsWith("//");
                const isString = line.includes('"') || line.includes("'");
                const isKeyword = /^(import|from|const|let|var|async|await|export|return)\s/.test(line.trim());
                return (
                  <div key={i} className={cn(
                    "font-mono",
                    isComment ? "text-gray-500" : isKeyword ? "text-violet-400" : "text-gray-200"
                  )}>
                    {line || " "}
                  </div>
                );
              })}
            </pre>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href="https://docs.chiselpost.io" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              View Full API Docs
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const base = process.env.NEXT_PUBLIC_API_URL ?? "";
              window.open(`${base}/api/v1/openapi.json`, "_blank", "noopener,noreferrer");
            }}
          >
            <Globe className="h-3.5 w-3.5" />
            OpenAPI Spec
          </Button>
        </div>
      </section>

      {/* === 4. Integrations === */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Integrations</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-start gap-4 hover:border-violet-200 dark:hover:border-violet-800 transition-colors"
            >
              <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0", integration.iconBg)}>
                <span className={cn("text-lg font-bold", integration.iconColor)}>
                  {integration.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{integration.name}</h3>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", integration.badgeColor)}>
                    {integration.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{integration.description}</p>
                <Button
                  size="sm"
                  variant={integration.buttonVariant}
                  className={cn(
                    "text-xs h-7 px-3",
                    integration.buttonVariant === "default" && "bg-violet-600 hover:bg-violet-700 text-white"
                  )}
                >
                  {integration.buttonLabel}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
