"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  Video,
  MessageCircle,
  Pin,
  Loader2,
  ExternalLink,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { accountsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { AccountStatus, Platform, SocialAccount } from "@/types";
import { cn, formatRelativeTime, formatNumber, getPlatformDisplayName } from "@/lib/utils";

const platformConfig = [
  { id: Platform.INSTAGRAM, label: "Instagram", Icon: Instagram, gradient: "from-purple-600 via-pink-500 to-orange-400" },
  { id: Platform.TIKTOK, label: "TikTok", Icon: Video, gradient: "from-gray-900 to-black" },
  { id: Platform.YOUTUBE, label: "YouTube", Icon: Youtube, gradient: "from-red-600 to-red-700" },
  { id: Platform.LINKEDIN, label: "LinkedIn", Icon: Linkedin, gradient: "from-blue-700 to-blue-800" },
  { id: Platform.TWITTER, label: "Twitter / X", Icon: Twitter, gradient: "from-gray-900 to-black" },
  { id: Platform.FACEBOOK, label: "Facebook", Icon: Facebook, gradient: "from-blue-600 to-blue-700" },
  { id: Platform.PINTEREST, label: "Pinterest", Icon: Pin, gradient: "from-red-600 to-red-700" },
  { id: Platform.THREADS, label: "Threads", Icon: MessageCircle, gradient: "from-gray-900 to-black" },
  { id: Platform.BLUESKY, label: "Bluesky", Icon: Globe, gradient: "from-blue-500 to-blue-600" },
];

function StatusBadge({ status }: { status: AccountStatus }) {
  const config = {
    [AccountStatus.ACTIVE]: {
      icon: CheckCircle2,
      label: "Active",
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
    [AccountStatus.EXPIRED]: {
      icon: Clock,
      label: "Token Expired",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    },
    [AccountStatus.ERROR]: {
      icon: AlertCircle,
      label: "Error",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    [AccountStatus.DISCONNECTED]: {
      icon: AlertCircle,
      label: "Disconnected",
      className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    },
  };
  const { icon: Icon, label, className } = config[status] ?? config[AccountStatus.DISCONNECTED];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function AccountCard({
  account,
  onDisconnect,
  onRefresh,
}: {
  account: SocialAccount;
  onDisconnect: (id: string) => void;
  onRefresh: (id: string) => void;
}) {
  const [showConfirm, setShowConfirm] = React.useState(false);
  const platform = platformConfig.find((p) => p.id === account.platform);

  const daysSinceConnected = Math.floor(
    (Date.now() - new Date(account.connectedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <>
      <Card className="hover:shadow-md transition-all card-hover">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Platform icon */}
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br text-white",
                platform?.gradient ?? "from-gray-400 to-gray-500"
              )}
            >
              {platform && <platform.Icon className="h-5 w-5" />}
            </div>

            {/* Account info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                  {account.displayName}
                </p>
                <StatusBadge status={account.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                @{account.handle} • {getPlatformDisplayName(account.platform)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(account.followerCount)} followers •{" "}
                Connected {daysSinceConnected} days ago
              </p>
            </div>

            {/* Avatar */}
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={account.avatar} alt={account.displayName} />
              <AvatarFallback className="text-xs font-semibold">
                {account.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            {account.status !== AccountStatus.ACTIVE && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={() => onRefresh(account.id)}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reconnect
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-7 text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/10 dark:border-red-800 dark:text-red-400"
              onClick={() => setShowConfirm(true)}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirm disconnect dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect{" "}
              <strong>@{account.handle}</strong> from ChiselPost? You can
              reconnect at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowConfirm(false);
                onDisconnect(account.id);
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-1.5" />
            <Skeleton className="h-3 w-24 mb-1" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
        </div>
        <Skeleton className="h-7 w-full mt-3" />
      </CardContent>
    </Card>
  );
}

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const { workspace } = useAuthStore();
  const addAccountRef = React.useRef<HTMLDivElement>(null);

  // Bluesky connection dialog state
  const [blueskyDialogOpen, setBlueskyDialogOpen] = React.useState(false);
  const [blueskyHandle, setBlueskyHandle] = React.useState("");
  const [blueskyAppPassword, setBlueskyAppPassword] = React.useState("");
  const [blueskyConnecting, setBlueskyConnecting] = React.useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => accountsApi.list(),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => accountsApi.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account disconnected");
    },
    onError: () => toast.error("Failed to disconnect account"),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => accountsApi.refresh(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account refreshed");
    },
    onError: () => toast.error("Failed to refresh account"),
  });

  const handleConnect = async (platform: Platform) => {
    if (!workspace) {
      toast.error("No workspace found");
      return;
    }
    // Bluesky uses app passwords instead of OAuth
    if (platform === Platform.BLUESKY) {
      setBlueskyDialogOpen(true);
      return;
    }
    try {
      const res = await accountsApi.getOAuthUrl(platform);
      window.location.href = res.data.url;
    } catch {
      toast.error(`Failed to connect ${getPlatformDisplayName(platform)}`);
    }
  };

  const handleBlueskySubmit = async () => {
    if (!blueskyHandle.trim() || !blueskyAppPassword.trim()) {
      toast.error("Please fill in both fields");
      return;
    }
    setBlueskyConnecting(true);
    try {
      await accountsApi.connectBluesky(blueskyHandle.trim(), blueskyAppPassword.trim());
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Bluesky account connected");
      setBlueskyDialogOpen(false);
      setBlueskyHandle("");
      setBlueskyAppPassword("");
    } catch {
      toast.error("Failed to connect Bluesky account");
    } finally {
      setBlueskyConnecting(false);
    }
  };

  // accountsApi.list() returns { data: { platform: SocialAccount[] } } grouped by platform
  const accountsGrouped = (data?.data ?? {}) as Record<string, SocialAccount[]>;
  const accounts: SocialAccount[] = Object.values(accountsGrouped).flat();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <Button
          className="bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => {
            addAccountRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Connect Account
        </Button>
      </div>

      {/* Connected accounts */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <AccountSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-500 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg mb-8">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">Failed to load accounts. Please try again.</p>
        </div>
      ) : accounts.length === 0 ? (
        /* Empty state */
        <div className="text-center py-16 mb-8">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            No accounts connected yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
            Connect your social media accounts to start scheduling content and viewing analytics.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold">1</span>
                <span>Choose a platform below</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Connected Accounts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
                onRefresh={(id) => refreshMutation.mutate(id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Connect new section */}
      <div ref={addAccountRef}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
          Add New Account
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {platformConfig.map((p) => {
            const alreadyConnected = accounts.some(
              (a) => a.platform === p.id && a.status === AccountStatus.ACTIVE
            );
            return (
              <button
                key={p.id}
                onClick={() => handleConnect(p.id)}
                disabled={alreadyConnected}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 transition-all",
                  alreadyConnected
                    ? "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50"
                    : "bg-white dark:bg-gray-900 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md cursor-pointer"
                )}
              >
                <div
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-white",
                    p.gradient
                  )}
                >
                  <p.Icon className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {p.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {alreadyConnected ? "Connected" : "Connect"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bluesky connection dialog */}
      <Dialog open={blueskyDialogOpen} onOpenChange={setBlueskyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Bluesky</DialogTitle>
            <DialogDescription>
              Bluesky uses app passwords instead of OAuth. Generate one at{" "}
              <a
                href="https://bsky.app/settings/app-passwords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
              >
                bsky.app/settings/app-passwords
                <ExternalLink className="h-3 w-3" />
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="bluesky-handle" className="text-sm font-medium">
                Handle
              </label>
              <Input
                id="bluesky-handle"
                placeholder="user.bsky.social"
                value={blueskyHandle}
                onChange={(e) => setBlueskyHandle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="bluesky-password" className="text-sm font-medium">
                App Password
              </label>
              <Input
                id="bluesky-password"
                type="password"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={blueskyAppPassword}
                onChange={(e) => setBlueskyAppPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlueskyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-500 hover:bg-blue-600 text-white"
              onClick={handleBlueskySubmit}
              disabled={blueskyConnecting}
            >
              {blueskyConnecting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
