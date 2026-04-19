"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Check,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  Music,
  Facebook,
  Globe,
  Plus,
  X,
  ArrowRight,
  Sparkles,
  PenSquare,
  Zap,
  Rocket,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { workspaceApi, accountsApi, scheduleApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

// Step 0 = path selection, Steps 1-5 = setup wizard
type Step = 0 | 1 | 2 | 3 | 4 | 5;
type Mode = "manual" | "autopilot" | null;

// Day name → backend dayOfWeek int (0=Sun..6=Sat)
const dayToInt: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
// Slot label → HH:MM
const slotToTime: Record<string, string> = {
  Morning: "09:00", Noon: "12:00", Evening: "17:00", Night: "20:00",
};

const majorTimezones = [
  "UTC-12:00 Baker Island", "UTC-11:00 American Samoa", "UTC-10:00 Hawaii",
  "UTC-09:00 Alaska", "UTC-08:00 Pacific Time (US)", "UTC-07:00 Mountain Time (US)",
  "UTC-06:00 Central Time (US)", "UTC-05:00 Eastern Time (US)", "UTC-04:00 Atlantic Time",
  "UTC-03:00 Buenos Aires", "UTC-02:00 Mid-Atlantic", "UTC-01:00 Azores",
  "UTC+00:00 London", "UTC+01:00 Paris, Berlin", "UTC+02:00 Cairo, Athens",
  "UTC+03:00 Moscow, Nairobi", "UTC+04:00 Dubai, Baku", "UTC+05:00 Karachi",
  "UTC+05:30 Mumbai, Delhi", "UTC+06:00 Dhaka", "UTC+07:00 Bangkok, Jakarta",
  "UTC+08:00 Singapore, Beijing", "UTC+09:00 Tokyo, Seoul", "UTC+10:00 Sydney",
  "UTC+11:00 Solomon Islands", "UTC+12:00 Auckland",
];

const platforms = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "from-pink-500 to-rose-600" },
  { id: "tiktok", label: "TikTok", icon: Music, color: "from-gray-800 to-black" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "from-red-500 to-red-600" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "from-blue-600 to-blue-700" },
  { id: "twitter", label: "Twitter", icon: Twitter, color: "from-sky-400 to-sky-500" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "from-blue-500 to-blue-600" },
  { id: "pinterest", label: "Pinterest", icon: Globe, color: "from-red-600 to-rose-700" },
  { id: "threads", label: "Threads", icon: Globe, color: "from-gray-700 to-gray-800" },
];

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeSlots = ["Morning", "Noon", "Evening", "Night"];

export default function OnboardingPage() {
  const router = useRouter();
  const workspace = useAuthStore((s) => s.workspace);
  const [step, setStep] = React.useState<Step>(0);
  const [mode, setMode] = React.useState<Mode>(null);
  const [workspaceName, setWorkspaceName] = React.useState("");
  const [timezone, setTimezone] = React.useState("UTC+00:00 London");
  const [connectingPlatform, setConnectingPlatform] = React.useState<string | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = React.useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("Editor");
  const [pendingInvites, setPendingInvites] = React.useState<{ email: string; role: string }[]>([]);
  const [selectedSlots, setSelectedSlots] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Step 1 → save workspace name, then advance.
  const handleStep1Continue = async () => {
    if (!workspaceName.trim() || !workspace?.id) {
      setStep(2);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await workspaceApi.update(workspace.id, { name: workspaceName.trim() });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workspace");
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2 → kick off real OAuth flow in a new tab.
  const handleConnectPlatform = async (platformId: string) => {
    if (connectedPlatforms.includes(platformId)) return;
    setConnectingPlatform(platformId);
    setError(null);
    try {
      const res = await accountsApi.getOAuthUrl(platformId as never);
      const url = (res as { data?: { url?: string } })?.data?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setConnectedPlatforms((prev) => [...prev, platformId]);
      } else {
        setError(`Could not start OAuth for ${platformId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth failed");
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleAddInvite = () => {
    if (!inviteEmail.trim()) return;
    setPendingInvites([...pendingInvites, { email: inviteEmail.trim(), role: inviteRole }]);
    setInviteEmail("");
  };

  // Step 3 → POST each pending invite, then advance.
  const handleStep3Continue = async () => {
    if (pendingInvites.length === 0) {
      setStep(4);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Promise.all(
        pendingInvites.map((inv) =>
          workspaceApi.inviteMember({ email: inv.email, role: inv.role.toLowerCase() })
        )
      );
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send some invites");
    } finally {
      setSubmitting(false);
    }
  };

  // Step 4 → POST each selected schedule slot, then advance.
  const handleStep4Continue = async () => {
    if (selectedSlots.size === 0 || connectedPlatforms.length === 0 || !workspace?.id) {
      setStep(5);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const tzName =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          : "UTC";
      const calls: Promise<unknown>[] = [];
      for (const key of selectedSlots) {
        const [day, slot] = key.split("-");
        for (const platform of connectedPlatforms) {
          calls.push(
            scheduleApi.createSlot({
              platform,
              dayOfWeek: dayToInt[day],
              time: slotToTime[slot],
              timezone: tzName,
            })
          );
        }
      }
      await Promise.all(calls);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveInvite = (idx: number) => {
    setPendingInvites(pendingInvites.filter((_, i) => i !== idx));
  };

  const toggleSlot = (day: string, slot: string) => {
    const key = `${day}-${slot}`;
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Wizard step labels (shown after path selection)
  const stepLabels = ["Welcome", "Connect", "Team", "Schedule", "Done"];

  // ── Step 0: Choose your path ─────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-full bg-gradient-to-br from-gray-50 to-violet-50/30 dark:from-gray-950 dark:to-violet-950/10 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-violet-600 shadow-lg mb-4">
              <Zap className="h-7 w-7 text-white fill-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome to ChiselPost
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              How would you like to create content? You can always switch between modes.
            </p>
          </div>

          {/* Path cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Manual */}
            <button
              onClick={() => { setMode("manual"); setStep(1); }}
              className={cn(
                "group relative text-left p-6 rounded-2xl border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg",
                mode === "manual"
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-violet-300 dark:hover:border-violet-700"
              )}
            >
              <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 transition-colors">
                <PenSquare className="h-6 w-6 text-gray-600 dark:text-gray-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                🖊️ Manual Mode
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                I'll create and schedule my own content using AI as a helper — generating captions, images, and repurposing on demand.
              </p>
              <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> Compose posts manually</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> AI Studio on demand</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> Full calendar control</li>
              </ul>
              <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                Get Started <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            {/* Autopilot */}
            <button
              onClick={() => { setMode("autopilot"); setStep(1); }}
              className={cn(
                "group relative text-left p-6 rounded-2xl border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg overflow-hidden",
                mode === "autopilot"
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                  : "border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 hover:border-violet-400 dark:hover:border-violet-600"
              )}
            >
              {/* Subtle gradient backdrop */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 to-purple-50/50 dark:from-violet-950/20 dark:to-purple-950/20 pointer-events-none" />
              <div className="relative">
                <div className="h-12 w-12 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mb-4">
                  <Rocket className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    ✨ Autopilot Mode
                  </h2>
                  <span className="text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                  I want AI to plan and post content automatically — brand-matched images, captions, and videos based on my brief.
                </p>
                <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" /> AI generates full campaigns</li>
                  <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" /> Brand-matched images & captions</li>
                  <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" /> Auto-posts on schedule</li>
                </ul>
                <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400">
                  Set Up Brand Kit <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            You can use both modes at any time — this just sets your starting point.
          </p>
        </div>
      </div>
    );
  }

  // ── Steps 1-5: Setup wizard ──────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 flex items-start justify-center p-6 pt-12">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {stepLabels.map((label, idx) => {
            const stepNum = (idx + 1) as Exclude<Step, 0>;
            const isCompleted = step > stepNum;
            const isCurrent = step === stepNum;
            return (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                      isCompleted
                        ? "bg-violet-600 border-violet-600 text-white"
                        : isCurrent
                        ? "bg-white dark:bg-gray-900 border-violet-600 text-violet-600"
                        : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-400"
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                  </div>
                  <span className={cn(
                    "text-xs mt-1 font-medium",
                    isCurrent ? "text-violet-600 dark:text-violet-400" : "text-gray-400 dark:text-gray-500"
                  )}>
                    {label}
                  </span>
                </div>
                {idx < stepLabels.length - 1 && (
                  <div className={cn(
                    "h-0.5 w-12 mx-1 mb-5 flex-shrink-0 transition-colors",
                    step > stepNum ? "bg-violet-500" : "bg-gray-200 dark:bg-gray-700"
                  )} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Step content */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="p-8 space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-3">🎉</div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Welcome to ChiselPost
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Let&apos;s get your workspace set up in just a few steps.
                </p>
                {mode === "autopilot" && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 px-3 py-1.5 rounded-full">
                    <Sparkles className="h-3 w-3" /> Autopilot mode — Brand Kit setup comes after
                  </div>
                )}
              </div>

              <div className="space-y-4 max-w-md mx-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Marketing, Sarah's Agency"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {majorTimezones.map((tz) => (
                      <option key={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(0)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  ← Back
                </button>
                <Button
                  className="bg-violet-600 hover:bg-violet-700 text-white px-8 gap-2"
                  onClick={handleStep1Continue}
                  disabled={!workspaceName.trim() || submitting}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Connect accounts */}
          {step === 2 && (
            <div className="p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Connect your social accounts
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connect at least one account to start scheduling posts. You can always add more later.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {platforms.map((platform) => {
                  const isConnected = connectedPlatforms.includes(platform.id);
                  const isConnecting = connectingPlatform === platform.id;
                  return (
                    <button
                      key={platform.id}
                      onClick={() => handleConnectPlatform(platform.id)}
                      disabled={isConnected || isConnecting}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        isConnected
                          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10"
                          : isConnecting
                          ? "border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/10 cursor-wait"
                          : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/10 cursor-pointer"
                      )}
                    >
                      <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center", platform.color)}>
                        {isConnected ? (
                          <Check className="h-5 w-5 text-white" />
                        ) : (
                          <platform.icon className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <span className={cn(
                        "text-xs font-medium",
                        isConnected ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-300"
                      )}>
                        {isConnecting ? "Connecting..." : isConnected ? "Connected" : platform.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {connectedPlatforms.length > 0 && (
                <p className="text-center text-sm text-green-600 dark:text-green-400">
                  ✓ {connectedPlatforms.length} account{connectedPlatforms.length > 1 ? "s" : ""} connected
                </p>
              )}

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(3)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  Skip for now
                </button>
                <Button
                  className="bg-violet-600 hover:bg-violet-700 text-white px-8 gap-2"
                  onClick={() => setStep(3)}
                  disabled={submitting}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Invite team */}
          {step === 3 && (
            <div className="p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Invite your team
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Collaborate with team members or clients by inviting them to your workspace.
                </p>
              </div>

              <div className="space-y-3 max-w-md mx-auto">
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddInvite()}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Admin</option>
                    <option>Editor</option>
                    <option>Viewer</option>
                  </select>
                  <Button
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white flex-shrink-0 gap-1"
                    onClick={handleAddInvite}
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>

                {pendingInvites.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Pending invites</p>
                    {pendingInvites.map((invite, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{invite.email}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{invite.role}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveInvite(idx)}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(4)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  Skip for now
                </button>
                <Button
                  className="bg-violet-600 hover:bg-violet-700 text-white px-8 gap-2"
                  onClick={handleStep3Continue}
                  disabled={submitting}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Posting schedule */}
          {step === 4 && (
            <div className="p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Set your posting schedule
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select your preferred posting times. AI will use these as defaults when scheduling.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left pb-3 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-20" />
                      {days.map((day) => (
                        <th key={day} className="pb-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 text-center">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeSlots.map((slot) => (
                      <tr key={slot}>
                        <td className="pr-3 py-2 text-xs text-gray-600 dark:text-gray-400 font-medium">{slot}</td>
                        {days.map((day) => {
                          const key = `${day}-${slot}`;
                          const isSelected = selectedSlots.has(key);
                          return (
                            <td key={day} className="px-2 py-2 text-center">
                              <button
                                onClick={() => toggleSlot(day, slot)}
                                className={cn(
                                  "w-9 h-9 rounded-lg transition-all text-xs font-medium border-2",
                                  isSelected
                                    ? "bg-violet-600 border-violet-600 text-white"
                                    : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-500"
                                )}
                              >
                                {isSelected && <Check className="h-3.5 w-3.5 mx-auto" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedSlots.size > 0 && (
                <p className="text-center text-sm text-violet-600 dark:text-violet-400">
                  ✓ {selectedSlots.size} time slot{selectedSlots.size > 1 ? "s" : ""} selected
                </p>
              )}

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(5)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  Skip for now
                </button>
                <Button
                  className="bg-violet-600 hover:bg-violet-700 text-white px-8 gap-2"
                  onClick={handleStep4Continue}
                  disabled={submitting}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: All set! */}
          {step === 5 && (
            <div className="p-8 space-y-6 text-center">
              <div className="space-y-2">
                <div className="text-5xl leading-none mb-4">
                  🎊 🚀 ✨
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  You&apos;re all set!
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your workspace is ready. Here&apos;s what you&apos;ve configured:
                </p>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <div className="bg-violet-50 dark:bg-violet-900/10 rounded-xl p-4 border border-violet-100 dark:border-violet-800">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-1">Workspace</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{workspaceName || "My Workspace"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{timezone.split(" ").slice(0, 2).join(" ")}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 border border-green-100 dark:border-green-800">
                  <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Accounts</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {connectedPlatforms.length} connected
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {connectedPlatforms.length > 0
                      ? connectedPlatforms.slice(0, 3).join(", ")
                      : "None yet"}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Schedule</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedSlots.size} time slots
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pendingInvites.length} team invite{pendingInvites.length !== 1 ? "s" : ""} sent
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-center text-sm text-gray-600 dark:text-gray-400">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <span>AI Studio is ready to help you create amazing content</span>
              </div>

              {/* CTA — context-aware by mode */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                {mode === "autopilot" ? (
                  <>
                    <Button
                      className="bg-violet-600 hover:bg-violet-700 text-white px-8 gap-2 h-11 text-base"
                      onClick={() => router.push("/brand-kit")}
                    >
                      <Sparkles className="h-5 w-5" />
                      Set Up Brand Kit
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 px-6 gap-2"
                      onClick={() => router.push("/dashboard")}
                    >
                      Go to Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    className="bg-violet-600 hover:bg-violet-700 text-white px-10 gap-2 h-11 text-base"
                    onClick={() => router.push("/dashboard")}
                  >
                    Go to Dashboard
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step indicator text */}
        {step > 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Step {step} of 5
          </p>
        )}
      </div>
    </div>
  );
}
