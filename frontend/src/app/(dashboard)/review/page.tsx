"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  Video,
  MessageCircle,
  Globe,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { postsApi, workspaceApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { Post, PostStatus, Platform } from "@/types";

// ─── Platform icon map ────────────────────────────────────────────────────────

const PlatformIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  tiktok: Video,
  youtube: Youtube,
  linkedin: Linkedin,
  twitter: Twitter,
  facebook: Facebook,
  pinterest: Globe,
  threads: MessageCircle,
  bluesky: Globe,
};

function PlatformBadges({ platforms }: { platforms: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {platforms.map((p) => {
        const Icon = PlatformIcon[p] ?? Globe;
        return (
          <span
            key={p}
            className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full capitalize"
          >
            <Icon className="h-3 w-3" />
            {p}
          </span>
        );
      })}
    </div>
  );
}

// ─── RejectDialog ─────────────────────────────────────────────────────────────

function RejectDialog({
  open,
  onOpenChange,
  onReject,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReject: (note: string) => void;
  isLoading: boolean;
}) {
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Optionally add a note to help the author understand what needs to change.
          </p>
          <Textarea
            placeholder="e.g. Please update the caption to match our brand voice…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => onReject(note)}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Reject Post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  canModerate,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  post: Post & { author_name?: string };
  canModerate: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  const content = post.content ?? post.caption ?? "";
  const scheduledAt = post.scheduledAt
    ? new Date(post.scheduledAt).toLocaleString()
    : null;

  return (
    <div className="rounded-xl border bg-card p-4 md:p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-xs">
              {getInitials(post.author_name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {post.author_name ?? "Unknown author"}
            </p>
            {scheduledAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {scheduledAt}
              </p>
            )}
          </div>
        </div>
        <Badge className="shrink-0 bg-amber-500/10 text-amber-700 border-amber-500/30">
          Pending Review
        </Badge>
      </div>

      {/* Content */}
      <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-5">
        {content || <em className="text-muted-foreground">No content</em>}
      </p>

      {/* Platforms */}
      {post.platforms?.length > 0 && (
        <PlatformBadges platforms={post.platforms} />
      )}

      {/* Previous rejection note */}
      {post.approval_note && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-xs mb-0.5">Previous rejection note</p>
            <p>{post.approval_note}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {canModerate && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onApprove(post.id)}
            disabled={isApproving || isRejecting}
          >
            {isApproving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={() => onReject(post.id)}
            disabled={isApproving || isRejecting}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const workspace = useAuthStore((s) => s.workspace);

  const [rejectTargetId, setRejectTargetId] = React.useState<string | null>(null);

  // Fetch pending_review posts
  const { data, isLoading, error } = useQuery({
    queryKey: ["posts", "pending_review"],
    queryFn: () => postsApi.list({ status: PostStatus.PENDING_REVIEW, pageSize: 100 }),
  });

  // Fetch workspace members to determine current user's role
  const { data: membersData } = useQuery({
    queryKey: ["workspace-members"],
    queryFn: () => workspaceApi.listMembers(),
    enabled: !!workspace?.id,
  });

  const currentMember = membersData?.data?.find(
    (m: { user_id: string; role: string }) => m.user_id === user?.id
  );
  const canModerate =
    currentMember?.role === "admin" ||
    currentMember?.role === "owner" ||
    user?.id === workspace?.ownerId;

  // Build author name map from member list
  const memberNameMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    if (membersData?.data) {
      for (const m of membersData.data as Array<{ user_id: string; name: string }>) {
        map[m.user_id] = m.name;
      }
    }
    return map;
  }, [membersData]);

  const posts: Array<Post & { author_name?: string }> =
    (data?.data ?? []).map((p: Post) => ({
      ...p,
      author_name: memberNameMap[(p as any).author_id] ?? undefined,
    }));

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => postsApi.approve(id),
    onSuccess: () => {
      toast.success("Post approved");
      queryClient.invalidateQueries({ queryKey: ["posts", "pending_review"] });
    },
    onError: () => toast.error("Failed to approve post"),
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      postsApi.reject(id, note),
    onSuccess: () => {
      toast.success("Post rejected");
      setRejectTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["posts", "pending_review"] });
    },
    onError: () => toast.error("Failed to reject post"),
  });

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <ClipboardCheck className="h-6 w-6 text-amber-600" />
        <div>
          <h1 className="text-xl font-semibold">Review Queue</h1>
          <p className="text-sm text-muted-foreground">
            {canModerate
              ? "Approve or reject posts submitted by your team."
              : "Posts you've submitted for review."}
          </p>
        </div>
        {posts.length > 0 && (
          <Badge className="ml-auto bg-amber-500/10 text-amber-700 border-amber-500/30">
            {posts.length} pending
          </Badge>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load review queue. Please refresh.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
          <h2 className="text-lg font-medium mb-1">All clear!</h2>
          <p className="text-sm text-muted-foreground">
            No posts are waiting for review right now.
          </p>
        </div>
      )}

      {/* Post list */}
      {!isLoading && !error && posts.length > 0 && (
        <div className="grid gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canModerate={canModerate}
              onApprove={(id) => approveMutation.mutate(id)}
              onReject={(id) => setRejectTargetId(id)}
              isApproving={
                approveMutation.isPending &&
                approveMutation.variables === post.id
              }
              isRejecting={
                rejectMutation.isPending &&
                rejectMutation.variables?.id === post.id
              }
            />
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <RejectDialog
        open={!!rejectTargetId}
        onOpenChange={(v) => !v && setRejectTargetId(null)}
        onReject={(note) => {
          if (rejectTargetId) {
            rejectMutation.mutate({ id: rejectTargetId, note });
          }
        }}
        isLoading={rejectMutation.isPending}
      />
    </div>
  );
}
