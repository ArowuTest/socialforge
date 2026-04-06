"use client";

import * as React from "react";
import {
  Search, Filter, Eye, Sparkles, TrendingUp,
  CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type JobType = "generate_text" | "generate_image" | "generate_video" | "repurpose";
type JobStatus = "completed" | "failed" | "processing" | "pending";

interface AiJob {
  id: string;
  user: { email: string; initials: string };
  jobType: JobType;
  status: JobStatus;
  model: string;
  credits: number;
  duration: string;
  createdAt: string;
}

const jobs: AiJob[] = [
  { id: "job_001", user: { email: "sarah@acme.com", initials: "SA" }, jobType: "generate_text", status: "completed", model: "claude-3-5-sonnet", credits: 12, duration: "1.2s", createdAt: "Today 09:14" },
  { id: "job_002", user: { email: "james@startupxyz.io", initials: "JX" }, jobType: "generate_image", status: "completed", model: "fal/flux-pro", credits: 45, duration: "8.4s", createdAt: "Today 09:11" },
  { id: "job_003", user: { email: "priya@brandco.com", initials: "PB" }, jobType: "repurpose", status: "processing", model: "claude-3-5-sonnet", credits: 18, duration: "—", createdAt: "Today 09:09" },
  { id: "job_004", user: { email: "tom@creativeagency.net", initials: "TC" }, jobType: "generate_video", status: "failed", model: "runway-gen4", credits: 0, duration: "—", createdAt: "Today 09:05" },
  { id: "job_005", user: { email: "lisa@fashionbrand.co", initials: "LF" }, jobType: "generate_text", status: "completed", model: "gpt-4o", credits: 8, duration: "0.9s", createdAt: "Today 08:58" },
  { id: "job_006", user: { email: "sarah@acme.com", initials: "SA" }, jobType: "generate_image", status: "completed", model: "fal/flux-pro", credits: 45, duration: "9.1s", createdAt: "Today 08:47" },
  { id: "job_007", user: { email: "dev@techstartup.io", initials: "DT" }, jobType: "repurpose", status: "completed", model: "claude-3-5-sonnet", credits: 22, duration: "2.1s", createdAt: "Today 08:41" },
  { id: "job_008", user: { email: "marketing@megacorp.com", initials: "MM" }, jobType: "generate_video", status: "completed", model: "runway-gen4", credits: 120, duration: "45.3s", createdAt: "Today 08:33" },
  { id: "job_009", user: { email: "priya@brandco.com", initials: "PB" }, jobType: "generate_text", status: "failed", model: "gpt-4o", credits: 0, duration: "—", createdAt: "Today 08:22" },
  { id: "job_010", user: { email: "james@startupxyz.io", initials: "JX" }, jobType: "generate_image", status: "pending", model: "fal/flux-pro", credits: 0, duration: "—", createdAt: "Today 08:18" },
  { id: "job_011", user: { email: "lisa@fashionbrand.co", initials: "LF" }, jobType: "repurpose", status: "completed", model: "claude-3-5-sonnet", credits: 16, duration: "1.7s", createdAt: "Today 08:10" },
  { id: "job_012", user: { email: "tom@creativeagency.net", initials: "TC" }, jobType: "generate_text", status: "completed", model: "claude-3-5-sonnet", credits: 11, duration: "1.1s", createdAt: "Today 07:59" },
];

const creditData = [
  { day: "Mon", credits: 1820 },
  { day: "Tue", credits: 2340 },
  { day: "Wed", credits: 1980 },
  { day: "Thu", credits: 2650 },
  { day: "Fri", credits: 3100 },
  { day: "Sat", credits: 1450 },
  { day: "Sun", credits: 1480 },
];

const jobTypeBadge: Record<JobType, string> = {
  generate_text: "bg-violet-900/50 text-violet-300 border-violet-800/60",
  generate_image: "bg-blue-900/50 text-blue-300 border-blue-800/60",
  generate_video: "bg-amber-900/50 text-amber-300 border-amber-800/60",
  repurpose: "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
};

const jobTypeLabel: Record<JobType, string> = {
  generate_text: "Generate Text",
  generate_image: "Generate Image",
  generate_video: "Generate Video",
  repurpose: "Repurpose",
};

const statusBadge: Record<JobStatus, string> = {
  completed: "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  failed: "bg-red-900/50 text-red-300 border-red-800/60",
  processing: "bg-blue-900/50 text-blue-300 border-blue-800/60",
  pending: "bg-slate-800 text-slate-400 border-slate-700",
};

export default function AiJobsPage() {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");

  const filtered = jobs.filter((j) => {
    const matchSearch = j.user.email.toLowerCase().includes(search.toLowerCase()) || j.id.includes(search);
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    const matchType = typeFilter === "all" || j.jobType === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">AI Jobs</h2>
        <p className="text-slate-400 text-sm mt-1">Monitor all AI generation jobs across users.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "Total Today", value: "847", icon: Sparkles, color: "text-violet-400" },
          { label: "Completed", value: "812", icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Failed", value: "12", icon: XCircle, color: "text-red-400" },
          { label: "In Progress", value: "23", icon: Loader2, color: "text-blue-400" },
          { label: "Credits Consumed", value: "14,820", icon: TrendingUp, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={cn("h-4 w-4", s.color)} />
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Credit chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">AI Credit Consumption — Last 7 Days</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={creditData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#f1f5f9" }}
              cursor={{ fill: "#1e293b" }}
            />
            <Bar dataKey="credits" fill="#7c3aed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by user or job ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
          >
            <option value="all">All Types</option>
            <option value="generate_text">Generate Text</option>
            <option value="generate_image">Generate Image</option>
            <option value="generate_video">Generate Video</option>
            <option value="repurpose">Repurpose</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 px-5 py-3 border-b border-slate-800">
          {["User", "Job Type", "Status", "Model", "Credits", "Duration", "Created At", ""].map((h) => (
            <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
          ))}
        </div>
        {filtered.map((job) => (
          <div
            key={job.id}
            className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 px-5 py-3 items-center border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
          >
            {/* User */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 rounded-full bg-violet-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {job.user.initials}
              </div>
              <span className="text-sm text-slate-300 truncate">{job.user.email}</span>
            </div>
            {/* Job type */}
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border w-fit", jobTypeBadge[job.jobType])}>
              {jobTypeLabel[job.jobType]}
            </span>
            {/* Status */}
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit",
              statusBadge[job.status],
              job.status === "processing" && "animate-pulse"
            )}>
              {job.status}
            </span>
            {/* Model */}
            <span className="text-xs text-slate-400 font-mono truncate">{job.model}</span>
            {/* Credits */}
            <span className="text-sm text-slate-300">{job.credits > 0 ? job.credits : "—"}</span>
            {/* Duration */}
            <span className="text-sm text-slate-400">{job.duration}</span>
            {/* Created */}
            <span className="text-xs text-slate-500">{job.createdAt}</span>
            {/* Action */}
            <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
              <Eye className="h-3 w-3" />
              View Output
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-500 text-sm">No jobs match your filters.</div>
        )}
      </div>
    </div>
  );
}
