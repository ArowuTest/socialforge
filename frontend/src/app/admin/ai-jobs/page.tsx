"use client";

import * as React from "react";
import {
  Search, Filter, Eye, Sparkles, TrendingUp,
  CheckCircle2, XCircle, Clock, Loader2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";

type JobStatus = "completed" | "failed" | "processing" | "pending";

interface AdminAiJob {
  id: string;
  job_type: string;
  status: JobStatus;
  model_used: string;
  credits_used: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  user_email: string;
  user_name: string;
}

const jobTypeBadge: Record<string, string> = {
  generate_text: "bg-violet-900/50 text-violet-300 border-violet-800/60",
  generate_image: "bg-blue-900/50 text-blue-300 border-blue-800/60",
  generate_video: "bg-amber-900/50 text-amber-300 border-amber-800/60",
  repurpose_content: "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
};

const jobTypeLabel: Record<string, string> = {
  generate_text: "Generate Text",
  generate_image: "Generate Image",
  generate_video: "Generate Video",
  repurpose_content: "Repurpose",
};

const statusBadge: Record<JobStatus, string> = {
  completed: "bg-emerald-900/50 text-emerald-300 border-emerald-800/60",
  failed: "bg-red-900/50 text-red-300 border-red-800/60",
  processing: "bg-blue-900/50 text-blue-300 border-blue-800/60",
  pending: "bg-slate-800 text-slate-400 border-slate-700",
};

function getDuration(job: AdminAiJob): string {
  if (!job.started_at || !job.completed_at) return "—";
  const ms = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getInitials(name: string, email: string): string {
  if (name) return name.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function JobSkeleton() {
  return (
    <div className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 px-5 py-3 items-center border-b border-slate-800/60 animate-pulse">
      {[120, 100, 70, 130, 50, 60, 90, 60].map((w, i) => (
        <div key={i} className="h-4 bg-slate-800 rounded" style={{ width: `${w}px` }} />
      ))}
    </div>
  );
}

export default function AiJobsPage() {
  const [jobs, setJobs] = React.useState<AdminAiJob[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [stats, setStats] = React.useState<{
    ai_jobs_today: number;
    ai_credits_today: number;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");

  const PAGE_SIZE = 20;

  React.useEffect(() => {
    adminApi.getStats().then((s) => setStats(s)).catch(() => null);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
    if (statusFilter !== "all") params.status = statusFilter;
    if (typeFilter !== "all") params.job_type = typeFilter;

    adminApi.listAiJobs(params as Parameters<typeof adminApi.listAiJobs>[0])
      .then((res) => {
        if (!cancelled) {
          const rawJobs = (res as unknown as { jobs: AdminAiJob[]; total: number }).jobs ?? [];
          setJobs(rawJobs);
          setTotal((res as unknown as { total: number }).total ?? 0);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load AI jobs");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [page, statusFilter, typeFilter]);

  const filtered = search
    ? jobs.filter((j) =>
        j.user_email.toLowerCase().includes(search.toLowerCase()) ||
        j.id.includes(search) ||
        (j.user_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : jobs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">AI Jobs</h2>
        <p className="text-slate-400 text-sm mt-1">Monitor all AI generation jobs across users.</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Today", value: stats?.ai_jobs_today?.toLocaleString() ?? "—", icon: Sparkles, color: "text-violet-400" },
          { label: "Credits Consumed Today", value: stats?.ai_credits_today?.toLocaleString() ?? "—", icon: TrendingUp, color: "text-amber-400" },
          { label: "Total (All Time)", value: total.toLocaleString(), icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Showing", value: `Page ${page} / ${totalPages || 1}`, icon: Clock, color: "text-blue-400" },
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
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-600"
          >
            <option value="all">All Types</option>
            <option value="generate_text">Generate Text</option>
            <option value="generate_image">Generate Image</option>
            <option value="generate_video">Generate Video</option>
            <option value="repurpose_content">Repurpose</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 px-5 py-3 border-b border-slate-800">
          {["User", "Job Type", "Status", "Model", "Credits", "Duration", "Created At", ""].map((h) => (
            <span key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {loading
          ? Array.from({ length: 8 }).map((_, i) => <JobSkeleton key={i} />)
          : filtered.length === 0
          ? <div className="py-12 text-center text-slate-500 text-sm">No jobs match your filters.</div>
          : filtered.map((job) => (
              <div
                key={job.id}
                className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 px-5 py-3 items-center border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-violet-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(job.user_name, job.user_email)}
                  </div>
                  <span className="text-sm text-slate-300 truncate">{job.user_email}</span>
                </div>
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border w-fit", jobTypeBadge[job.job_type] ?? "bg-slate-800 text-slate-300 border-slate-700")}>
                  {jobTypeLabel[job.job_type] ?? job.job_type}
                </span>
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit",
                  statusBadge[job.status] ?? "bg-slate-800 text-slate-400 border-slate-700",
                  job.status === "processing" && "animate-pulse"
                )}>
                  {job.status}
                </span>
                <span className="text-xs text-slate-400 font-mono truncate">{job.model_used || "—"}</span>
                <span className="text-sm text-slate-300">{job.credits_used > 0 ? job.credits_used : "—"}</span>
                <span className="text-sm text-slate-400">{getDuration(job)}</span>
                <span className="text-xs text-slate-500">
                  {new Date(job.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
                  <Eye className="h-3 w-3" />
                  View
                </button>
              </div>
            ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} jobs
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-slate-400 px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
