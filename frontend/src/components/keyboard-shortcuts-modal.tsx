"use client";

/**
 * KeyboardShortcutsModal — global "press ? to see shortcuts" affordance.
 *
 * Mounted once in the dashboard layout. Listens for a global "?" keypress
 * (when no input/textarea is focused) and toggles a small modal listing the
 * shortcuts the app supports today. Power users discover them; novices are
 * undisturbed.
 */

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "?",            label: "Open this shortcuts help" },
  { keys: "G then D",     label: "Go to Dashboard" },
  { keys: "G then C",     label: "Go to Calendar" },
  { keys: "G then N",     label: "New Post (Compose)" },
  { keys: "G then I",     label: "Go to Inbox" },
  { keys: "G then A",     label: "Go to Analytics" },
  { keys: "⌘/Ctrl + Enter", label: "Send (in chat / comment / Copilot composer)" },
  { keys: "Esc",          label: "Close any open modal or panel" },
];

export function KeyboardShortcutsModal() {
  const [open, setOpen] = React.useState(false);
  const lastKey = React.useRef<{ key: string; t: number } | null>(null);

  React.useEffect(() => {
    function isFormElement(el: EventTarget | null): boolean {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      // Don't fire inside form elements so users can type "?" in posts.
      if (isFormElement(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // "?" toggles this modal
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // "Esc" closes (handled by Radix Dialog; safety net)
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }

      // G-prefix chord navigations. Track if the last key within 1.2s was "g",
      // then map the second key.
      const now = Date.now();
      if (e.key.toLowerCase() === "g") {
        lastKey.current = { key: "g", t: now };
        return;
      }
      if (lastKey.current?.key === "g" && now - lastKey.current.t < 1200) {
        lastKey.current = null;
        const k = e.key.toLowerCase();
        const route =
          k === "d" ? "/dashboard" :
          k === "c" ? "/calendar" :
          k === "n" ? "/compose" :
          k === "i" ? "/inbox" :
          k === "a" ? "/analytics" :
          null;
        if (route) {
          e.preventDefault();
          window.location.href = route;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-violet-600" />
            Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">?</kbd> anywhere to reopen this.
        </p>
      </DialogContent>
    </Dialog>
  );
}
