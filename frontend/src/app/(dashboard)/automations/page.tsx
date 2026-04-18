"use client";

import * as React from "react";
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  RefreshCw,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { automationsApi } from "@/lib/api";
import {
  Automation,
  AutomationTriggerType,
  AutomationActionType,
  CreateAutomationRequest,
} from "@/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  post_published: "Post Published",
  post_failed: "Post Failed",
  schedule: "Schedule",
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  send_notification: "Send Notification",
  auto_repurpose: "Auto-Repurpose",
  republish_after_delay: "Republish After Delay",
};

const TRIGGER_COLORS: Record<AutomationTriggerType, string> = {
  post_published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  post_failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  schedule: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const ACTION_COLORS: Record<AutomationActionType, string> = {
  send_notification: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  auto_repurpose: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  republish_after_delay: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
};

const PLATFORMS = [
  "twitter",
  "instagram",
  "linkedin",
  "facebook",
  "tiktok",
  "youtube",
  "pinterest",
  "threads",
  "bluesky",
];

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── AutomationCard ───────────────────────────────────────────────────────────

interface AutomationCardProps {
  automation: Automation;
  onToggle: (id: string) => void;
  onEdit: (automation: Automation) => void;
  onDelete: (id: string) => void;
  isTogglingId: string | null;
  isDeletingId: string | null;
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDelete,
  isTogglingId,
  isDeletingId,
}: AutomationCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {automation.name}
          </h3>
          {automation.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
              {automation.description}
            </p>
          )}
        </div>
        <Switch
          checked={automation.is_enabled}
          onCheckedChange={() => onToggle(automation.id)}
          disabled={isTogglingId === automation.id}
          className="flex-shrink-0 mt-0.5"
        />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TRIGGER_COLORS[automation.trigger_type]}`}
        >
          <Zap className="h-3 w-3" />
          {TRIGGER_LABELS[automation.trigger_type]}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${ACTION_COLORS[automation.action_type]}`}
        >
          <RefreshCw className="h-3 w-3" />
          {ACTION_LABELS[automation.action_type]}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          {automation.run_count} run{automation.run_count !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last: {formatDate(automation.last_triggered_at)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => onEdit(automation)}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          onClick={() => onDelete(automation.id)}
          disabled={isDeletingId === automation.id}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          {isDeletingId === automation.id ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  );
}

// ─── AutomationFormDialog ─────────────────────────────────────────────────────

interface FormState {
  name: string;
  description: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  // convenience fields for form binding
  platforms: string[];
  cron: string;
  notifMessage: string;
  targetPlatforms: string[];
  delayHours: number;
}

const defaultForm = (): FormState => ({
  name: "",
  description: "",
  trigger_type: "post_published",
  trigger_config: {},
  action_type: "send_notification",
  action_config: {},
  platforms: [],
  cron: "0 9 * * 1",
  notifMessage: "",
  targetPlatforms: [],
  delayHours: 24,
});

function formToRequest(form: FormState): CreateAutomationRequest {
  const trigger_config: Record<string, unknown> = {};
  if (form.trigger_type === "schedule") {
    trigger_config.cron = form.cron;
  } else {
    trigger_config.platforms = form.platforms;
  }

  const action_config: Record<string, unknown> = {};
  if (form.action_type === "send_notification") {
    action_config.message = form.notifMessage;
  } else if (form.action_type === "auto_repurpose") {
    action_config.target_platforms = form.targetPlatforms;
  } else if (form.action_type === "republish_after_delay") {
    action_config.delay_hours = form.delayHours;
  }

  return {
    name: form.name,
    description: form.description || undefined,
    trigger_type: form.trigger_type,
    trigger_config,
    action_type: form.action_type,
    action_config,
  };
}

function automationToForm(a: Automation): FormState {
  const tc = a.trigger_config as Record<string, unknown>;
  const ac = a.action_config as Record<string, unknown>;
  return {
    name: a.name,
    description: a.description ?? "",
    trigger_type: a.trigger_type,
    trigger_config: tc,
    action_type: a.action_type,
    action_config: ac,
    platforms: (tc.platforms as string[]) ?? [],
    cron: (tc.cron as string) ?? "0 9 * * 1",
    notifMessage: (ac.message as string) ?? "",
    targetPlatforms: (ac.target_platforms as string[]) ?? [],
    delayHours: (ac.delay_hours as number) ?? 24,
  };
}

interface AutomationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget: Automation | null;
  onSaved: () => void;
}

function AutomationFormDialog({
  open,
  onOpenChange,
  editTarget,
  onSaved,
}: AutomationFormDialogProps) {
  const [form, setForm] = React.useState<FormState>(defaultForm());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(editTarget ? automationToForm(editTarget) : defaultForm());
    }
  }, [open, editTarget]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlatform(platform: string, field: "platforms" | "targetPlatforms") {
    setForm((prev) => {
      const arr = prev[field] as string[];
      const next = arr.includes(platform)
        ? arr.filter((p) => p !== platform)
        : [...arr, platform];
      return { ...prev, [field]: next };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const req = formToRequest(form);
      if (editTarget) {
        await automationsApi.update(editTarget.id, req);
        toast.success("Automation updated");
      } else {
        await automationsApi.create(req);
        toast.success("Automation created");
      }
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save automation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editTarget ? "Edit Automation" : "Create Automation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="auto-name">Name *</Label>
            <Input
              id="auto-name"
              placeholder="e.g. Notify on post failure"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="auto-desc">Description</Label>
            <Textarea
              id="auto-desc"
              placeholder="Optional description"
              rows={2}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          {/* Trigger Type */}
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Select
              value={form.trigger_type}
              onValueChange={(v) => setField("trigger_type", v as AutomationTriggerType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post_published">Post Published</SelectItem>
                <SelectItem value="post_failed">Post Failed</SelectItem>
                <SelectItem value="schedule">Schedule (Cron)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger Config */}
          {form.trigger_type === "schedule" ? (
            <div className="space-y-1.5">
              <Label htmlFor="auto-cron">Cron Expression</Label>
              <Input
                id="auto-cron"
                placeholder="0 9 * * 1"
                value={form.cron}
                onChange={(e) => setField("cron", e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Example: <code>0 9 * * 1</code> = every Monday at 9am. Uses UTC.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Platforms (optional filter)</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p, "platforms")}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      form.platforms.includes(p)
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-400"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">Leave empty to trigger for all platforms.</p>
            </div>
          )}

          {/* Action Type */}
          <div className="space-y-1.5">
            <Label>Action</Label>
            <Select
              value={form.action_type}
              onValueChange={(v) => setField("action_type", v as AutomationActionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="send_notification">Send Notification</SelectItem>
                <SelectItem value="auto_repurpose">Auto-Repurpose</SelectItem>
                <SelectItem value="republish_after_delay">Republish After Delay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Config */}
          {form.action_type === "send_notification" && (
            <div className="space-y-1.5">
              <Label htmlFor="auto-msg">Notification Message</Label>
              <Textarea
                id="auto-msg"
                placeholder="Enter the notification message..."
                rows={3}
                value={form.notifMessage}
                onChange={(e) => setField("notifMessage", e.target.value)}
              />
            </div>
          )}

          {form.action_type === "auto_repurpose" && (
            <div className="space-y-1.5">
              <Label>Target Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p, "targetPlatforms")}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      form.targetPlatforms.includes(p)
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-400"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.action_type === "republish_after_delay" && (
            <div className="space-y-1.5">
              <Label htmlFor="auto-delay">Delay (hours)</Label>
              <Input
                id="auto-delay"
                type="number"
                min={1}
                max={720}
                value={form.delayHours}
                onChange={(e) => setField("delayHours", Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : editTarget ? "Save Changes" : "Create Automation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [automations, setAutomations] = React.useState<Automation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Automation | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function loadAutomations() {
    try {
      setError(null);
      const res = await automationsApi.list();
      setAutomations(res.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load automations");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAutomations();
  }, []);

  function openCreate() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(automation: Automation) {
    setEditTarget(automation);
    setDialogOpen(true);
  }

  async function handleToggle(id: string) {
    setTogglingId(id);
    try {
      const res = await automationsApi.toggle(id);
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? res.data : a))
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle automation");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await automationsApi.delete(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      toast.success("Automation deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete automation");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Automations</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create rules that run automatically when events occur.
          </p>
        </div>
        <Button
          className="bg-violet-600 hover:bg-violet-700 text-white"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Automation
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-20">
          <p className="text-red-500 mb-3">{error}</p>
          <Button variant="outline" onClick={loadAutomations}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && automations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-4">
            <Zap className="h-8 w-8 text-violet-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No automations yet
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
            Automate your workflow by creating rules that trigger actions on post events or schedules.
          </p>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create your first automation
          </Button>

          {/* Example cards */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl text-left">
            {[
              {
                icon: Bell,
                title: "Post Failed Alert",
                desc: "Send a notification when a post fails to publish",
              },
              {
                icon: RefreshCw,
                title: "Auto-Repurpose",
                desc: "Repurpose published posts to other platforms automatically",
              },
              {
                icon: ToggleRight,
                title: "Weekly Summary",
                desc: "Receive a weekly summary notification every Monday",
              },
            ].map((ex) => (
              <div
                key={ex.title}
                className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col gap-2"
              >
                <ex.icon className="h-5 w-5 text-violet-500" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">{ex.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{ex.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation grid */}
      {!loading && !error && automations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
              isTogglingId={togglingId}
              isDeletingId={deletingId}
            />
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <AutomationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        onSaved={loadAutomations}
      />
    </div>
  );
}
