"use client";

/**
 * CopilotDrawer — floating chat sidebar.
 *
 * Mounted once in the dashboard layout. A floating "✨ Ask Copilot" button
 * (bottom-right) opens a right-aligned Sheet. The drawer holds the chat
 * history in component state plus localStorage (per-workspace), so closing
 * and reopening keeps the conversation alive.
 *
 * Backend: POST /workspaces/:wid/ai/copilot — costs ~2 credits per user turn.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, Trash2 } from "lucide-react";
import { aiApi } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth";

type ChatRole = "user" | "assistant";
interface ChatMessage {
  role: ChatRole;
  content: string;
  ts: number;
  toolsUsed?: string[];
}

const SUGGESTED_PROMPTS = [
  "Show me my top 5 posts this month",
  "Why might my last post have underperformed?",
  "Draft 3 captions in my brand voice about a product launch",
  "What's my engagement trend over the last 30 days?",
];

export function CopilotDrawer() {
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Per-workspace persisted history (last ~20 turns).
  const storageKey = useMemo(
    () => (workspaceId ? `copilot:history:${workspaceId}` : null),
    [workspaceId],
  );

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
      else setMessages([]);
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    } catch {
      /* quota errors are harmless here */
    }
  }, [messages, storageKey]);

  // Auto-scroll on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy || !workspaceId) return;
    setInput("");
    const next = [...messages, { role: "user" as ChatRole, content: text, ts: Date.now() }];
    setMessages(next);
    setBusy(true);
    try {
      // Only send the last 10 turns as history to stay within token budget.
      const history = next
        .slice(-11, -1) // exclude the just-added user message — backend appends it itself
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await aiApi.copilot({ message: text, history });
      const reply = res?.data?.reply ?? "(no response)";
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: reply, ts: Date.now(), toolsUsed: res?.data?.tools_used },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Copilot request failed";
      toast.error(msg.includes("INSUFFICIENT_CREDITS") ? "Out of AI credits" : msg);
      // Roll back the user message so they can retry without it being part of history.
      setMessages((cur) => cur.slice(0, -1));
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  function clearHistory() {
    setMessages([]);
    if (storageKey) localStorage.removeItem(storageKey);
  }

  return (
    <>
      {/* Floating launch button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI Copilot"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:scale-105 hover:shadow-xl"
      >
        <Sparkles className="h-4 w-4" />
        Ask Copilot
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-violet-600" />
                AI Copilot
              </SheetTitle>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  className="h-7 gap-1 text-xs text-muted-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hi! I know your workspace data. Ask me anything about your posts, performance, or get help drafting.
                </p>
                <div className="space-y-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      disabled={busy}
                      className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50 dark:hover:bg-violet-900/20"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-violet-600 text-white"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content}
                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                      <div className="mt-1 text-[10px] uppercase tracking-wide opacity-60">
                        Used: {Array.from(new Set(m.toolsUsed)).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border px-3 py-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask anything — I have access to your posts and analytics…"
                disabled={busy}
                className="min-h-[44px] resize-none text-sm"
                rows={2}
              />
              <Button
                onClick={() => send()}
                disabled={busy || !input.trim() || !workspaceId}
                size="icon"
                className="h-11 w-11 shrink-0"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              ~2 credits per question. Enter to send · Shift+Enter for new line
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
