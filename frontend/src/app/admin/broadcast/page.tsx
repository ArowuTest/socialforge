"use client";

import * as React from "react";
import {
  Megaphone, Send, Calendar, Mail, Bell, Users, Eye,
  CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BroadcastRecord {
  id: string;
  subject: string;
  target: string;
  sentTo: number;
  type: string;
  sentAt: string;
  openRate: string;
  status: "sent" | "scheduled" | "failed";
}

const history: BroadcastRecord[] = [
  { id: "bc_001", subject: "🚀 New Feature: AI Video Generation is Live!", target: "All Users", sentTo: 982, type: "Email + In-App", sentAt: "Apr 2, 2026 10:00 AM", openRate: "61.3%", status: "sent" },
  { id: "bc_002", subject: "Your Free Trial is Ending Soon", target: "Free Plan", sentTo: 314, type: "Email", sentAt: "Mar 28, 2026 9:00 AM", openRate: "72.1%", status: "sent" },
  { id: "bc_003", subject: "Exclusive: Upgrade to Agency & Save 20%", target: "Pro Plan", sentTo: 218, type: "Email + In-App", sentAt: "Mar 20, 2026 11:00 AM", openRate: "48.7%", status: "sent" },
  { id: "bc_004", subject: "Scheduled Maintenance: Apr 8, 2026 2-4 AM UTC", target: "All Users", sentTo: 0, type: "In-App", sentAt: "Apr 8, 2026 1:00 AM", openRate: "—", status: "scheduled" },
  { id: "bc_005", subject: "Platform Update: New LinkedIn Integration", target: "Paid Users", sentTo: 488, type: "Email", sentAt: "Mar 10, 2026 8:30 AM", openRate: "55.2%", status: "sent" },
];

const statusConfig = {
  sent: { label: "Sent", color: "bg-emerald-900/50 text-emerald-300 border-emerald-800/60", icon: CheckCircle2 },
  scheduled: { label: "Scheduled", color: "bg-blue-900/50 text-blue-300 border-blue-800/60", icon: Clock },
  failed: { label: "Failed", color: "bg-red-900/50 text-red-300 border-red-800/60", icon: XCircle },
};

export default function BroadcastPage() {
  const [target, setTarget] = React.useState("all");
  const [msgType, setMsgType] = React.useState("both");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [showPreview, setShowPreview] = React.useState(false);

  const targetLabels: Record<string, string> = {
    all: "All Users",
    free: "Free Plan",
    paid: "Paid Users",
    starter: "Starter Plan",
    pro: "Pro Plan",
    agency: "Agency Plan",
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
              <button className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
                <Send className="h-4 w-4" />
                Send Now
              </button>
              <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
                <Calendar className="h-4 w-4" />
                Schedule
              </button>
            </div>
          </div>
        </div>

        {/* Stats summary */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Sent", value: "5", color: "text-white" },
              { label: "Avg Open Rate", value: "59.5%", color: "text-emerald-400" },
              { label: "Total Recipients", value: "2,002", color: "text-violet-400" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Broadcast history */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white">Broadcast History</h3>
            </div>

            {/* Col headers */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2.5 border-b border-slate-800">
              {["Subject", "Target", "Sent To", "Open Rate", "Status"].map((h) => (
                <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
              ))}
            </div>

            {history.map((bc) => {
              const sc = statusConfig[bc.status];
              return (
                <div
                  key={bc.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-3 items-start border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{bc.subject}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{bc.sentAt}</p>
                  </div>
                  <span className="text-xs text-slate-400">{bc.target}</span>
                  <span className="text-sm text-white font-medium">
                    {bc.sentTo > 0 ? bc.sentTo.toLocaleString() : "—"}
                  </span>
                  <span className={cn("text-sm font-semibold", bc.openRate !== "—" ? "text-emerald-400" : "text-slate-500")}>
                    {bc.openRate}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit", sc.color)}>
                    <sc.icon className="h-3 w-3" />
                    {sc.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
