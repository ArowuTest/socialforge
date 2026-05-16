"use client";

/**
 * PostCommentsPanel — threaded discussion on a post.
 *
 * Used in the review queue (reviewer + editor discuss before approve/reject)
 * and inside the compose page when the editor reopens a rejected post.
 *
 * Anyone with workspace access can read & post. Authors can delete their own
 * comments.
 */

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { postsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { getInitials } from "@/lib/utils";

interface PostCommentsPanelProps {
  postId: string;
  /** When true the panel renders open by default; otherwise collapsed behind a toggle. */
  defaultOpen?: boolean;
  /** Hide the panel header (used when embedding inside a card that already has its own title). */
  hideHeader?: boolean;
}

export function PostCommentsPanel({
  postId,
  defaultOpen = false,
  hideHeader = false,
}: PostCommentsPanelProps) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(defaultOpen);
  const [draft, setDraft] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["post-comments", postId],
    queryFn: () => postsApi.listComments(postId),
    enabled: open,
  });
  const comments = data?.data ?? [];

  const addMutation = useMutation({
    mutationFn: (body: string) => postsApi.addComment(postId, body),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to add comment");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (cid: string) => postsApi.deleteComment(postId, cid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
      toast.success("Comment deleted");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to delete comment");
    },
  });

  function submit() {
    const body = draft.trim();
    if (!body || addMutation.isPending) return;
    addMutation.mutate(body);
  }

  // Count badge in the collapsed header — show only when there are comments.
  const count = comments.length;

  return (
    <div className="rounded-lg border bg-muted/30">
      {!hideHeader && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            {open ? "Comments" : count > 0 ? `Comments (${count})` : "Add a comment"}
          </span>
          <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
        </button>
      )}

      {(open || hideHeader) && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading comments…
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No comments yet. Start the discussion below.
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => {
                const isMine = c.author_id === me?.id;
                const name = c.author?.name ?? "Unknown";
                const ts = new Date(c.created_at).toLocaleString();
                return (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {getInitials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-medium text-foreground">
                          {name}
                          <span className="ml-2 font-normal text-muted-foreground">{ts}</span>
                        </p>
                        {isMine && (
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending}
                            className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                            aria-label="Delete comment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
                        {c.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Composer */}
          <div className="flex items-end gap-2 pt-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Add a comment… (⌘/Ctrl+Enter to send)"
              disabled={addMutation.isPending}
              className="min-h-[40px] resize-none bg-background text-sm"
              rows={2}
            />
            <Button
              onClick={submit}
              disabled={addMutation.isPending || !draft.trim()}
              size="icon"
              className="h-10 w-10 shrink-0"
              aria-label="Send comment"
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
