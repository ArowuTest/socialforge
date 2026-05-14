"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  MessageCircle,
  AtSign,
  Mail,
  CheckCheck,
  RefreshCw,
  Send,
  Loader2,
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Globe,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { inboxApi, aiApi } from "@/lib/api";
import { InboxMessage } from "@/types";

// ─── Platform icon helper ──────────────────────────────────────────────────────

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (platform.toLowerCase()) {
    case "instagram": return <Instagram className={cls} />;
    case "twitter": return <Twitter className={cls} />;
    case "facebook": return <Facebook className={cls} />;
    case "linkedin": return <Linkedin className={cls} />;
    default: return <Globe className={cls} />;
  }
}

// ─── Message type badge ────────────────────────────────────────────────────────

function MessageTypeBadge({ type }: { type: string }) {
  if (type === "comment") return <Badge variant="secondary" className="text-[10px] py-0"><MessageCircle className="h-2.5 w-2.5 mr-1" />Comment</Badge>;
  if (type === "mention") return <Badge variant="secondary" className="text-[10px] py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0"><AtSign className="h-2.5 w-2.5 mr-1" />Mention</Badge>;
  if (type === "dm") return <Badge variant="secondary" className="text-[10px] py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-0"><Mail className="h-2.5 w-2.5 mr-1" />DM</Badge>;
  return <Badge variant="outline" className="text-[10px] py-0">{type}</Badge>;
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// ─── InboxPage ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<"all" | "comment" | "mention" | "dm">("all");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [selectedMsg, setSelectedMsg] = React.useState<InboxMessage | null>(null);
  const [replyText, setReplyText] = React.useState("");

  // ── Fetch messages ─────────────────────────────────────────────────────────

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["inbox", "list", activeTab, unreadOnly],
    queryFn: () =>
      inboxApi.list({
        message_type: activeTab === "all" ? undefined : activeTab,
        unread: unreadOnly || undefined,
        limit: 50,
      }),
    refetchInterval: 60_000,
  });

  const messages = data?.data ?? [];
  const unreadCount = data?.unread_count ?? 0;
  const total = data?.pagination.total ?? 0;

  // ── Mark read ──────────────────────────────────────────────────────────────

  const markReadMutation = useMutation({
    mutationFn: (id: string) => inboxApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => inboxApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("All messages marked as read");
    },
  });

  // ── Reply ──────────────────────────────────────────────────────────────────

  const replyMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => inboxApi.reply(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("Reply sent!");
      setReplyText("");
      // Update selected message locally so the replied badge appears
      if (selectedMsg) {
        setSelectedMsg({ ...selectedMsg, replied_at: new Date().toISOString(), is_read: true });
      }
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Failed to send reply");
    },
  });

  function handleSelectMessage(msg: InboxMessage) {
    setSelectedMsg(msg);
    setReplyText("");
    // Auto-mark as read when opening
    if (!msg.is_read) {
      markReadMutation.mutate(msg.id);
    }
  }

  function handleSendReply() {
    if (!selectedMsg || !replyText.trim()) return;
    replyMutation.mutate({ id: selectedMsg.id, text: replyText.trim() });
  }

  // ── AI Reply Suggestions ───────────────────────────────────────────────────
  // Charges 1 credit to generate 3 on-brand reply options. The user picks one
  // (or edits) before sending — we never auto-send AI text.
  const [aiSuggestions, setAiSuggestions] = React.useState<
    Array<{ label: string; text: string }> | null
  >(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  async function handleGenerateAIReplies() {
    if (!selectedMsg) return;
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const res = await aiApi.generateReplySuggestions({
        message: selectedMsg.content,
        platform: selectedMsg.platform,
        messageType: selectedMsg.message_type as "comment" | "mention" | "dm",
        senderHandle: selectedMsg.sender_handle,
      });
      setAiSuggestions(res.data?.replies ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate replies";
      if (msg.toLowerCase().includes("insufficient")) {
        toast.error("Out of AI credits. Top up in Billing to keep using AI.");
      } else {
        toast.error(msg);
      }
    } finally {
      setAiLoading(false);
    }
  }

  // Reset AI suggestions whenever the user switches messages.
  React.useEffect(() => {
    setAiSuggestions(null);
  }, [selectedMsg?.id]);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left panel: message list ─────────────────────────────────────────── */}
      <div className="flex flex-col w-full md:w-[380px] border-r border-gray-200 dark:border-gray-800 flex-shrink-0">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-violet-600" />
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">Social Inbox</h1>
              {unreadCount > 0 && (
                <span className="text-[10px] font-semibold bg-violet-600 text-white rounded-full px-1.5 py-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full h-8">
              <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
              <TabsTrigger value="comment" className="flex-1 text-xs">Comments</TabsTrigger>
              <TabsTrigger value="mention" className="flex-1 text-xs">Mentions</TabsTrigger>
              <TabsTrigger value="dm" className="flex-1 text-xs">DMs</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Unread filter toggle */}
          <button
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={cn(
              "mt-2 w-full text-xs py-1.5 px-3 rounded-md border transition-colors font-medium",
              unreadOnly
                ? "bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-900/20 dark:border-violet-600 dark:text-violet-300"
                : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
          >
            {unreadOnly ? "Showing unread only" : "Show unread only"}
          </button>
        </div>

        {/* Message list */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-6">
              <Inbox className="h-10 w-10 text-gray-200 dark:text-gray-700 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No messages</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {unreadOnly ? "No unread messages" : "Comments and mentions will appear here after the next sync"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                    selectedMsg?.id === msg.id && "bg-violet-50 dark:bg-violet-900/10",
                    !msg.is_read && "border-l-2 border-violet-500"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar / platform icon */}
                    <div className="flex-shrink-0 relative">
                      <div className="h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-500 dark:text-gray-400">
                        {msg.sender_name ? msg.sender_name[0].toUpperCase() : "?"}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white dark:bg-gray-900 p-0.5">
                        <PlatformIcon platform={msg.platform} className="h-3 w-3 text-gray-500" />
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={cn(
                          "text-sm truncate",
                          !msg.is_read ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-700 dark:text-gray-300"
                        )}>
                          {msg.sender_name || msg.sender_handle || "Unknown"}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {relativeTime(msg.platform_created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {msg.content}
                      </p>

                      <div className="flex items-center gap-1.5 mt-1">
                        <MessageTypeBadge type={msg.message_type} />
                        {msg.replied_at && (
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Replied</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer count */}
        {total > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 text-center">{total} message{total !== 1 ? "s" : ""}</p>
          </div>
        )}
      </div>

      {/* ── Right panel: message detail + reply ──────────────────────────────── */}
      <div className="flex-1 flex flex-col hidden md:flex">
        {!selectedMsg ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Inbox className="h-16 w-16 text-gray-200 dark:text-gray-700 mb-4" />
            <h2 className="text-lg font-semibold text-gray-400 dark:text-gray-500 mb-1">
              Select a message
            </h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
              Comments, mentions and DMs from your connected accounts will appear here.
              The inbox syncs automatically every 30 minutes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Message header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-base font-semibold text-gray-500 dark:text-gray-400 relative">
                  {selectedMsg.sender_name ? selectedMsg.sender_name[0].toUpperCase() : "?"}
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white dark:bg-gray-900 p-0.5">
                    <PlatformIcon platform={selectedMsg.platform} className="h-3.5 w-3.5 text-gray-500" />
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedMsg.sender_name || selectedMsg.sender_handle || "Unknown"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedMsg.sender_handle} · {relativeTime(selectedMsg.platform_created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MessageTypeBadge type={selectedMsg.message_type} />
                <button
                  onClick={() => setSelectedMsg(null)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Message body */}
            <ScrollArea className="flex-1 px-6 py-4">
              {/* Parent post context */}
              {selectedMsg.post_excerpt && (
                <div className="mb-4 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">On post</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 italic line-clamp-2">
                    "{selectedMsg.post_excerpt}"
                  </p>
                </div>
              )}

              {/* Message content */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {selectedMsg.content}
                </p>
              </div>

              {/* Replied indicator */}
              {selectedMsg.replied_at && (
                <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Replied {relativeTime(selectedMsg.replied_at)}</span>
                </div>
              )}
            </ScrollArea>

            {/* Reply box */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800">
              {selectedMsg.message_type === "dm" ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                  Direct message replies are not yet supported via API.
                </p>
              ) : (
                <div className="space-y-2">
                  {/* AI suggestions — show above the textarea so users can pick one to load */}
                  {aiSuggestions && aiSuggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-400 font-semibold flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" /> AI suggestions — click to use
                      </p>
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setReplyText(s.text);
                            setAiSuggestions(null);
                          }}
                          className="w-full text-left p-2 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors group"
                        >
                          <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-700 dark:text-violet-300 mb-0.5">
                            {s.label}
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-200 leading-snug">
                            {s.text}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to ${selectedMsg.sender_handle || selectedMsg.sender_name}…`}
                    className="resize-none text-sm min-h-[80px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleSendReply();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateAIReplies}
                      disabled={aiLoading}
                      className="h-7 px-3 text-xs border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                      title="Generate 3 on-brand reply options (1 AI credit)"
                    >
                      {aiLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1.5" />
                      )}
                      AI Reply
                    </Button>
                    <div className="flex items-center gap-2 ml-auto">
                      <p className="text-[10px] text-gray-400 hidden sm:block">⌘ + Enter to send</p>
                      <Button
                        size="sm"
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || replyMutation.isPending}
                        className="bg-violet-600 hover:bg-violet-700 text-white h-7 px-3 text-xs"
                      >
                        {replyMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                        ) : (
                          <Send className="h-3 w-3 mr-1.5" />
                        )}
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
