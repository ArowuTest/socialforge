"use client";

import * as React from "react";
import {
  Megaphone, Send, Calendar, Mail, Bell, Users, Eye,
  CheckCircle2, Clock, XCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";

export default function BroadcastPage() {
  const [target, setTarget] = React.useState("all");
  const [msgType, setMsgType] = React.useState("both");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [showPreview, setShowPreview] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  const targetLabels: Record<string, string> = {
    all: "All Users",
    free: "Free Plan",
    paid: "Paid Users",
    starter: "Starter Plan",
    pro: "Pro Plan",
    agency: "Agency Plan",
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Please enter a message body");
      return;
    }
    setSending(true);
    try {
      const res = await adminApi.sendBroadcast({
        subject,
        body,
        target,
        msg_type: msgType,
      });
      const recipients = (res?.data as { recipients?: number })?.recipients ?? 0;
      toast.success(`Broadcast sent to ${recipients} users`);
      setSubject("");
      setBody("");
    } catch {
      toast.error("Failed to send broadcast");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Broadcast Messages</h2>
        <p className="text-slate-400 text-sm mt-1">Send announcements, feature updates, and notifications to your users.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Compose */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Compose Message</h3>
          </div>

          <div className="p-5 space-y-4">
            {/* Target audience */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Target Audience</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
                >
                  <option value="all">All Users</option>
                  <option value="free">Free Plan</option>
                  <option value="paid">Paid Users</option>
                  <option value="starter">Starter Plan</option>
                  <option value="pro">Pro Plan</option>
                  <option value="agency">Agency Plan</option>
                </select>
              </div>
            </div>

            {/* Message type */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Message Type</label>
              <div className="flex gap-2">
                {[
                  { value: "email", label: "Email", icon: Mail },
                  { value: "inapp", label: "In-App", icon: Bell },
                  { value: "both", label: "Both", icon: Megaphone },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMsgType(opt.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex-1 justify-center",
                      msgType === opt.value
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600"
                    )}
                  >
                    <opt.icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Subject Line</label>
              <input
                type="text"
                placeholder="e.g. New Feature: AI Video Generation is Live!"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Message Body</label>
              <textarea
                rows={5}
                placeholder="Write your message here. Markdown formatting is supported..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600 resize-none"
              />
            </div>

            {/* Preview toggle */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? "Hide Preview" : "Show Preview"}
            </button>

            {/* Preview pane */}
            {showPreview && (
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 space-y-2">
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Preview</div>
                <div className="text-xs text-slate-400">
                  <span className="font-medium text-slate-300">To:</span> {targetLabels[target]}
                </div>
                <div className="text-xs text-slate-400">
                  <span className="font-medium text-slate-300">Type:</span>{" "}
                  {msgType === "email" ? "Email" : msgType === "inapp" ? "In-App Notification" : "Email + In-App"}
                </div>
                {subject && (
                  <div className="text-sm font-semibold text-white pt-1 border-t border-slate-800">{subject}</div>
                )}
                {body && <p className="text-sm text-slate-300 whitespace-pre-wrap">{body}</p>}
                {!subject && !body && <p className="text-xs text-slate-600 italic">Start typing to see preview...</p>}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending..." : "Send Now"}
              </button>
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">How Broadcasts Work</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 text-violet-400 mt-0.5 flex-shrink-0" />
                <span><span className="text-white font-medium">Email</span> sends via your configured email provider (Resend).</span>
              </li>
              <li className="flex items-start gap-2">
                <Bell className="h-4 w-4 text-violet-400 mt-0.5 flex-shrink-0" />
                <span><span className="text-white font-medium">In-App</span> creates a notification in each user&apos;s notification center.</span>
              </li>
              <li className="flex items-start gap-2">
                <Megaphone className="h-4 w-4 text-violet-400 mt-0.5 flex-shrink-0" />
                <span><span className="text-white font-medium">Both</span> sends through both channels simultaneously.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
