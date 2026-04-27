"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Lock,
  Copy,
  Trash2,
  Plus,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Info,
  Upload,
  Globe,
  Save,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { authApi, billingApi, apiKeysApi, workspaceApi, whitelabelApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { PlanType } from "@/types";
import { cn, formatRelativeTime, getInitials, slugify } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ColorPicker } from "@/components/ui/color-picker";

// ── Constants ──────────────────────────────────────────────────────────────

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese (Simplified)" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
];

// ── Password strength ──────────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "bg-gray-200" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: score * 20, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score: score * 20, label: "Fair", color: "bg-amber-500" };
  if (score <= 3) return { score: score * 20, label: "Good", color: "bg-sky-500" };
  return { score: Math.min(score * 20, 100), label: "Strong", color: "bg-green-500" };
}

// ══════════════════════════════════════════════════════════════════════════
// PROFILE TAB
// ══════════════════════════════════════════════════════════════════════════

function ProfileTab() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = React.useState(user?.name ?? "");
  const [email] = React.useState(user?.email ?? "");
  const [bio, setBio] = React.useState("");
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(user?.avatar ?? null);

  // Sync local state when the auth store hydrates asynchronously after mount
  React.useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);
  const [currentPw, setCurrentPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const strength = passwordStrength(newPw);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const res = await authApi.updateProfile({ name });
      if (user) setUser({ ...user, ...res.data });
      toast.success("Profile updated.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { toast.error("Passwords don't match."); return; }
    if (newPw.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    setIsSaving(true);
    try {
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw });
      toast.success("Password changed successfully.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Avatar */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profile Photo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            <div
              className="relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview ?? undefined} alt={user?.name} />
                <AvatarFallback className="bg-violet-100 text-violet-700 text-xl font-bold">
                  {user?.name ? getInitials(user.name) : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="h-6 w-6 text-white" />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.name ?? "User"}
              </p>
              <p className="text-xs text-muted-foreground mb-2">{user?.email}</p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Change Photo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profile Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full-name">Full Name</Label>
            <Input
              id="full-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Input id="email" value={email} readOnly className="pr-28 bg-gray-50 dark:bg-gray-800" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verified
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Contact support to change your email address.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us a bit about yourself…"
              rows={3}
              className="resize-none"
            />
          </div>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleSaveProfile}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-pw">Current Password</Label>
            <div className="relative">
              <Input
                id="current-pw"
                type={showCurrent ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setShowCurrent((v) => !v)}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New Password</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setShowNew((v) => !v)}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPw && (
              <div className="space-y-1.5 mt-2">
                <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", strength.color)}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{strength.label}</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirm New Password</Label>
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
            />
            {confirmPw && newPw !== confirmPw && (
              <p className="text-xs text-red-500">Passwords do not match.</p>
            )}
          </div>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleChangePassword}
            disabled={isSaving || !currentPw || !newPw || newPw !== confirmPw}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Change Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// WORKSPACE TAB
// ══════════════════════════════════════════════════════════════════════════

function WorkspaceTab() {
  const { workspace, setWorkspace } = useAuthStore();
  const [wsName, setWsName] = React.useState(workspace?.name ?? "");
  const [slug, setSlug] = React.useState(workspace?.slug ?? "");
  const [timezone, setTimezone] = React.useState(workspace?.timezone ?? "UTC");
  const [language, setLanguage] = React.useState("en");
  const [logoPreview, setLogoPreview] = React.useState<string | null>(workspace?.logo ?? null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const debouncedName = useDebounce(wsName, 400);
  React.useEffect(() => {
    if (debouncedName && !workspace?.slug) {
      setSlug(slugify(debouncedName));
    }
  }, [debouncedName, workspace?.slug]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!workspace) return;
    setIsSaving(true);
    try {
      const res = await workspaceApi.update(workspace.id, { name: wsName, slug, timezone });
      setWorkspace(res.data);
      toast.success("Workspace settings saved.");
    } catch {
      toast.error("Failed to save workspace settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Basic info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Workspace Details</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {/* Logo */}
          <div className="space-y-2">
            <Label>Workspace Logo</Label>
            <div className="flex items-center gap-4">
              <div
                className="h-16 w-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer hover:border-violet-400 transition-colors bg-gray-50 dark:bg-gray-800/30 overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Workspace logo" className="h-full w-full object-cover" />
                ) : (
                  <Upload className="h-6 w-6 text-gray-400" />
                )}
              </div>
              <div>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Upload Logo
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, SVG — 512×512px recommended</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Workspace Name</Label>
            <Input
              id="ws-name"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="My Agency"
            />
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <Label htmlFor="ws-slug">Workspace Slug</Label>
            <Input
              id="ws-slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="my-agency"
            />
            <p className="text-xs text-muted-foreground font-mono">
              app.ChiselPost.io/<span className="text-violet-600 dark:text-violet-400">{slug || "my-agency"}</span>
            </p>
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Default Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <Label htmlFor="language">Default Post Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Workspace
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-base text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Delete Workspace</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this workspace and all its data. This action cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="self-start sm:self-auto flex-shrink-0"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete Workspace
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{workspace?.name}</strong> and all associated data including posts, accounts, and billing. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-bold">{workspace?.name}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={workspace?.name}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== workspace?.name}
              onClick={() => {
                toast.info("To permanently delete this workspace, please contact support@chiselpost.io — our team will process the request within 24 hours.");
                setDeleteDialogOpen(false);
                setDeleteConfirmText("");
              }}
            >
              Delete Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// BILLING TAB
// ══════════════════════════════════════════════════════════════════════════

const PLAN_CONFIG = [
  {
    type: PlanType.STARTER,
    name: "Starter",
    price: 29,
    features: {
      "Social Accounts": "10",
      "AI Credits": "100/mo",
      "API Access": false,
      "White-label": false,
      "Dedicated Support": false,
    },
  },
  {
    type: PlanType.PRO,
    name: "Pro",
    price: 97,
    features: {
      "Social Accounts": "50",
      "AI Credits": "500/mo",
      "API Access": true,
      "White-label": false,
      "Dedicated Support": false,
    },
  },
  {
    type: PlanType.AGENCY,
    name: "Agency",
    price: 499,
    features: {
      "Social Accounts": "500",
      "AI Credits": "Unlimited",
      "API Access": true,
      "White-label": true,
      "Dedicated Support": true,
    },
  },
];

function BillingTab() {
  const { workspace } = useWorkspace();

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => billingApi.getSubscription(),
  });

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["billing-usage"],
    queryFn: () => billingApi.getUsage(),
  });

  const handleManageBilling = async () => {
    try {
      const res = await billingApi.getPortalUrl();
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to open billing portal.");
    }
  };

  const handleUpgrade = async (planType: PlanType) => {
    try {
      const res = await billingApi.createSubscription({ planType, interval: "monthly" });
      window.location.href = res.data.checkoutUrl;
    } catch {
      toast.error("Failed to initiate checkout.");
    }
  };

  const currentPlan = workspace?.plan ?? PlanType.STARTER;
  const sub = subData?.data;
  const usage = usageData?.data;

  const statusConfig: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    trialing: { label: "Trial", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    past_due: { label: "Past Due", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    canceled: { label: "Canceled", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  };

  const statusInfo = statusConfig[sub?.status ?? "active"] ?? statusConfig["active"];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Current plan card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Current Plan</CardTitle>
              {subLoading ? (
                <Skeleton className="h-4 w-40 mt-1" />
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Renews on{" "}
                  {sub?.currentPeriodEnd
                    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                    : "—"}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleManageBilling}
            >
              <ExternalLink className="h-4 w-4" />
              Manage Billing
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-bold text-gray-900 dark:text-white capitalize">{currentPlan}</span>
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.className)}>
              {statusInfo.label}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader><CardTitle className="text-base">Usage This Month</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {usageLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              {/* AI Credits */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">AI Credits</span>
                  <span className="text-muted-foreground">
                    {usage?.aiCreditsUsed ?? 0} / {usage?.aiCreditsLimit ?? 100} credits used
                  </span>
                </div>
                <Progress
                  value={usage ? (usage.aiCreditsUsed / usage.aiCreditsLimit) * 100 : 0}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">Resets at the start of your next billing cycle.</p>
              </div>

              {/* Social Accounts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Social Accounts</span>
                  <span className="text-muted-foreground">
                    {usage?.socialAccountsUsed ?? 0} / {usage?.socialAccountsLimit ?? 10} accounts connected
                  </span>
                </div>
                <Progress
                  value={usage ? (usage.socialAccountsUsed / usage.socialAccountsLimit) * 100 : 0}
                  className="h-2"
                />
              </div>

              {/* Scheduled posts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Posts This Month</span>
                  <span className="text-muted-foreground">
                    {usage?.scheduledPostsUsed ?? 0} posts
                  </span>
                </div>
                <Progress
                  value={usage ? (usage.scheduledPostsUsed / (usage.scheduledPostsLimit || 1)) * 100 : 0}
                  className="h-2"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Plan comparison */}
      <Card>
        <CardHeader><CardTitle className="text-base">Plan Comparison</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left p-4 font-medium text-muted-foreground w-[35%]">Feature</th>
                {PLAN_CONFIG.map((plan) => (
                  <th
                    key={plan.type}
                    className={cn(
                      "text-center p-4 font-semibold",
                      currentPlan === plan.type
                        ? "text-violet-700 dark:text-violet-300"
                        : "text-gray-900 dark:text-white"
                    )}
                  >
                    <div className={cn(
                      "rounded-lg p-2 mx-auto",
                      currentPlan === plan.type ? "ring-2 ring-violet-500" : ""
                    )}>
                      <p>{plan.name}</p>
                      <p className="text-lg font-bold">${plan.price}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(PLAN_CONFIG[0].features).map((feature, fi) => (
                <tr key={feature} className={cn("border-b border-gray-50 dark:border-gray-800/50", fi % 2 === 0 && "bg-gray-50/50 dark:bg-gray-800/10")}>
                  <td className="p-4 text-gray-700 dark:text-gray-300">{feature}</td>
                  {PLAN_CONFIG.map((plan) => {
                    const val = plan.features[feature as keyof typeof plan.features];
                    return (
                      <td key={plan.type} className="p-4 text-center">
                        {typeof val === "boolean" ? (
                          val
                            ? <Check className="h-4 w-4 text-green-500 mx-auto" />
                            : <span className="text-gray-300 dark:text-gray-600 text-lg leading-none">—</span>
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300">{val}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="p-4" />
                {PLAN_CONFIG.map((plan) => (
                  <td key={plan.type} className="p-4 text-center">
                    {currentPlan === plan.type ? (
                      <Button size="sm" variant="outline" disabled className="w-full text-xs">
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className={cn(
                          "w-full text-xs",
                          plan.price > (PLAN_CONFIG.find((p) => p.type === currentPlan)?.price ?? 0)
                            ? "bg-violet-600 hover:bg-violet-700 text-white"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300"
                        )}
                        onClick={() => handleUpgrade(plan.type)}
                      >
                        {plan.price > (PLAN_CONFIG.find((p) => p.type === currentPlan)?.price ?? 0)
                          ? "Upgrade"
                          : "Downgrade"}
                      </Button>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// API KEYS TAB
// ══════════════════════════════════════════════════════════════════════════

function ApiKeysTab() {
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = React.useState("");
  const [newKeyValue, setNewKeyValue] = React.useState<string | null>(null);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [isCopied, setIsCopied] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiKeysApi.create({ name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewKeyValue(res.data.key);
      setNewKeyName(res.data.name);
      setKeyName("");
    },
    onError: () => toast.error("Failed to create API key."),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked.");
      setRevokeTarget(null);
    },
    onError: () => toast.error("Failed to revoke API key."),
  });

  const handleCopy = () => {
    if (!newKeyValue) return;
    navigator.clipboard.writeText(newKeyValue).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const keys = data?.data ?? [];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Info card */}
      <Card className="border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">API Keys</p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                Use API keys to integrate ChiselPost with your tools. Keep keys secret — treat them like passwords.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create key */}
      <Card>
        <CardHeader><CardTitle className="text-base">Generate New Key</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g., Production App)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyName.trim()) createMutation.mutate(keyName.trim());
              }}
              className="flex-1"
            />
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!keyName.trim() || createMutation.isPending || keys.length >= 10}
              onClick={() => createMutation.mutate(keyName.trim())}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Generate Key
            </Button>
          </div>
          {keys.length >= 10 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Maximum of 10 API keys reached. Delete an existing key to create a new one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* New key reveal dialog */}
      <Dialog open={!!newKeyValue} onOpenChange={(v) => !v && setNewKeyValue(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your New API Key</DialogTitle>
            <DialogDescription>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium mt-1">
                <AlertTriangle className="h-4 w-4" />
                This key will only be shown once. Copy it now.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Key: <strong>{newKeyName}</strong></p>
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 font-mono text-xs break-all">
              <span className="flex-1 select-all">{newKeyValue}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="flex-shrink-0"
                onClick={handleCopy}
              >
                {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyValue(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keys table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Your API Keys ({keys.length}/10)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-muted-foreground">No API keys yet. Generate one above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-muted-foreground font-medium">
                    <th className="text-left p-4">Name</th>
                    <th className="text-left p-4">Created</th>
                    <th className="text-left p-4">Last Used</th>
                    <th className="p-4 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{key.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{key.keyPreview}</p>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(key.createdAt)}
                      </td>
                      <td className="p-4 text-muted-foreground whitespace-nowrap">
                        {key.lastUsedAt ? formatRelativeTime(key.lastUsedAt) : "Never"}
                      </td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10"
                          onClick={() => setRevokeTarget(key.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke confirmation */}
      <Dialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              This API key will stop working immediately. Any integrations using it will break.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
            >
              {revokeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revoke Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// WHITE-LABEL TAB
// ══════════════════════════════════════════════════════════════════════════

function WhitelabelTab() {
  const { isPlanAtLeast } = useWorkspace();
  const isAgency = isPlanAtLeast(PlanType.AGENCY);
  const [enabled, setEnabled] = React.useState(false);
  const [logoUrl, setLogoUrl] = React.useState("");
  const [primaryColor, setPrimaryColor] = React.useState("#7C3AED");
  const [appName, setAppName] = React.useState("ChiselPost");
  const [customDomain, setCustomDomain] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [dnsOpen, setDnsOpen] = React.useState(false);
  const [dnsStatus, setDnsStatus] = React.useState<"idle" | "checking" | "ok" | "fail">("idle");

  const { data: wlData } = useQuery({
    queryKey: ["whitelabel"],
    queryFn: () => whitelabelApi.getConfig(),
    enabled: isAgency,
  });

  React.useEffect(() => {
    if (wlData?.data) {
      const d = wlData.data;
      setEnabled(d.is_whitelabel ?? false);
      setPrimaryColor(d.primary_color ?? "#7C3AED");
      setAppName(d.brand_name ?? d.name ?? "");
      setCustomDomain(d.custom_domain ?? "");
      setLogoUrl(d.logo_url ?? "");
    }
  }, [wlData]);

  if (!isAgency) {
    return (
      <div className="max-w-md">
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardContent className="pt-6 pb-6 text-center">
            <Lock className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Agency Plan Required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              White-labeling is available on the Agency plan. Upgrade to customize the platform for your clients.
            </p>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white">
              Upgrade to Agency
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await whitelabelApi.updateConfig({
        is_whitelabel: enabled,
        brand_name: appName || undefined,
        logo_url: logoUrl || undefined,
        primary_color: primaryColor || undefined,
        custom_domain: customDomain || undefined,
      });
      toast.success("White-label settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDnsCheck = async () => {
    if (!customDomain) return;
    setDnsStatus("checking");
    try {
      const res = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(customDomain)}&type=CNAME`
      );
      const json = await res.json();
      const answers: Array<{ data: string }> = json?.Answer ?? [];
      const pointsCorrectly = answers.some((a) =>
        a.data?.toLowerCase().includes("proxy.chiselpost.com")
      );
      setDnsStatus(pointsCorrectly ? "ok" : "fail");
    } catch {
      setDnsStatus("fail");
    }
  };

  const disabled = !enabled;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">White-label Configuration</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-48">Customize ChiselPost branding for your clients</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="wl-tab-toggle" className="text-sm text-muted-foreground">Enable</Label>
              <Switch id="wl-tab-toggle" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Logo */}
          <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
            <Label htmlFor="wl-logo-url">Logo URL</Label>
            <div className="flex items-center gap-2">
              <Input
                id="wl-logo-url"
                placeholder="https://cdn.yourdomain.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
              {logoUrl && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors whitespace-nowrap"
                  onClick={() => setLogoUrl("")}
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Paste a publicly accessible image URL (PNG, SVG, WebP). Displayed in your client portal header.
            </p>
            {logoUrl && (
              <div className="mt-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 p-4 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="h-12 max-w-[180px] object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>

          {/* Brand colour */}
          <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
            <Label>Brand Colour</Label>
            <ColorPicker value={primaryColor} onChange={setPrimaryColor} label="Primary" />
          </div>

          {/* Custom domain */}
          <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
            <Label htmlFor="wl-domain">Custom Domain</Label>
            <div className="flex items-center gap-2">
              <Input
                id="wl-domain"
                placeholder="clients.yourdomain.com"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
              />
              <Popover open={dnsOpen} onOpenChange={setDnsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="whitespace-nowrap">
                    <Globe className="h-4 w-4 mr-1.5" />
                    Verify DNS
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="end">
                  <h4 className="font-semibold text-sm mb-3">DNS Instructions</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Add the following CNAME record to your DNS provider:
                  </p>
                  <div className="space-y-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs font-mono">
                    <div><span className="text-muted-foreground">Type:</span> CNAME</div>
                    <div><span className="text-muted-foreground">Name:</span> {customDomain || "your-subdomain"}</div>
                    <div><span className="text-muted-foreground">Value:</span> proxy.chiselpost.com</div>
                    <div><span className="text-muted-foreground">TTL:</span> 300</div>
                  </div>
                  {dnsStatus === "ok" && (
                    <div className="mt-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                      CNAME verified — DNS is pointing correctly.
                    </div>
                  )}
                  {dnsStatus === "fail" && (
                    <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      ⚠ CNAME not found or not pointing to proxy.chiselpost.com. DNS changes can take up to 48 h to propagate.
                    </div>
                  )}
                  <Button
                    className="w-full mt-3 bg-violet-600 hover:bg-violet-700 text-white"
                    size="sm"
                    disabled={!customDomain || dnsStatus === "checking"}
                    onClick={handleDnsCheck}
                  >
                    {dnsStatus === "checking" ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Checking…</>
                    ) : "Check Now"}
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* App name */}
          <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
            <Label htmlFor="wl-appname">App Name</Label>
            <Input
              id="wl-appname"
              placeholder="ChiselPost"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              What clients see instead of &quot;ChiselPost&quot;
            </p>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                if (customDomain) {
                  window.open(`https://${customDomain}/login`, "_blank", "noopener,noreferrer");
                } else {
                  toast.info("Enter and save a custom domain first to preview your branded login page.");
                }
              }}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              Preview Login Page
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 ml-auto"
              disabled={disabled || isSaving}
              onClick={handleSave}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account, workspace, and billing preferences.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6 flex-wrap h-auto gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-full sm:w-auto">
          <TabsTrigger value="profile" className="text-sm">Profile</TabsTrigger>
          <TabsTrigger value="workspace" className="text-sm">Workspace</TabsTrigger>
          <TabsTrigger value="billing" className="text-sm">Billing</TabsTrigger>
          <TabsTrigger value="api-keys" className="text-sm">API Keys</TabsTrigger>
          <TabsTrigger value="white-label" className="text-sm">White-label</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="workspace">
          <WorkspaceTab />
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="white-label">
          <WhitelabelTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
