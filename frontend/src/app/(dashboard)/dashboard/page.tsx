"use client";

import * as React from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, Share2, Sparkles, BarChart3,
  PenSquare, Calendar, ArrowRight, Instagram, Youtube,
  Linkedin, Twitter, Facebook, Clock, CheckCircle2, FileText, Eye, Edit3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Mock data ─────────────────────────────────────────────────────────────────

const stats = [
  { label: "Posts Scheduled", value: "47", trend: "+12%", up: true, icon: Calendar, color: "violet" },
  { label: "Connected Accounts", value: "12", trend: "8 platforms", up: true, icon: Share2, color: "blue" },
  { label: "AI Credits Used", value: "840", sub: "/ 2,000", trend: "42% used", up: null, icon: Sparkles, color: "emerald" },
  { label: "Avg Engagement", value: "6.8%", trend: "+0.3%", up: true, icon: BarChart3, color: "amber" },
];

const recentPosts = [
  { id: "1", title: "Product launch announcement 🚀", platforms: ["instagram", "twitter", "linkedin"], status: "scheduled", scheduledAt: "Apr 7, 10:00 AM" },
  { id: "2", title: "Behind the scenes — office tour", platforms: ["youtube", "instagram"], status: "published", scheduledAt: "Apr 5, 2:00 PM" },
  { id: "3", title: "Weekly tips for social media growth", platforms: ["twitter", "linkedin", "facebook"], status: "published", scheduledAt: "Apr 4, 9:00 AM" },
  { id: "4", title: "New feature deep dive — AI Studio", platforms: ["youtube", "twitter"], status: "draft", scheduledAt: "—" },
  { id: "5", title: "Client success story: 300% growth", platforms: ["linkedin", "instagram"], status: "scheduled", scheduledAt: "Apr 9, 11:00 AM" },
];

const platformData = [
  { name: "Instagram", posts: 18, engagement: 7.2 },
  { name: "TikTok", posts: 12, engagement: 11.4 },
  { name: "YouTube", posts: 6, engagement: 5.8 },
  { name: "LinkedIn", posts: 14, engagement: 4.1 },
  { name: "Twitter", posts: 22, engagement: 3.7 },
  { name: "Facebook", posts: 9, engagement: 2.9 },
];

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const scheduleDots: Record<number, { color: string }[]> = {
  0: [{ color: "bg-violet-500" }, { color: "bg-blue-500" }],
  2: [{ color: "bg-violet-500" }],
  3: [{ color: "bg-emerald-500" }, { color: "bg-violet-500" }, { color: "bg-amber-500" }],
  5: [{ color: "bg-blue-500" }],
  6: [{ color: "bg-violet-500" }, { color: "bg-emerald-500" }],
};

const platformIcons: Record<string, React.ElementType> = {
  instagram: Instagram, youtube: Youtube, linkedin: Linkedin, twitter: Twitter, facebook: Facebook,
};

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const colorMap: Record<string, string> = {
  violet: "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
};

// ── Components ────────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: typeof stats[0] }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", colorMap[stat.color])}>
          <stat.icon className="h-5 w-5" />
        </div>
        {stat.up !== null && (
          <span className={cn("flex items-center gap-1 text-xs font-semibold", stat.up ? "text-emerald-600" : "text-red-500")}>
            {stat.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {stat.trend}
          </span>
        )}
        {stat.up === null && <span className="text-xs text-gray-500 dark:text-gray-400">{stat.trend}</span>}
      </div>
      <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
        {stat.value}
        {stat.sub && <span className="text-base font-normal text-gray-400 ml-1">{stat.sub}</span>}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
      {stat.label === "AI Credits Used" && (
        <div className="mt-3 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "42%" }} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Welcome header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Good morning 👋</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Here&apos;s what&apos;s happening with your social accounts today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => <StatCard key={s.label} stat={s} />)}
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: "Compose New Post", desc: "Create and schedule content for multiple platforms", href: "/compose", icon: PenSquare, color: "violet" },
            { title: "Connect Account", desc: "Link a new social media account to your workspace", href: "/accounts", icon: Share2, color: "blue" },
            { title: "Generate with AI", desc: "Use AI to create captions, images, and video scripts", href: "/ai", icon: Sparkles, color: "amber" },
          ].map((action) => (
            <Link key={action.title} href={action.href} className="group flex items-start gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0", colorMap[action.color])}>
                <action.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{action.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{action.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-violet-500 flex-shrink-0 mt-0.5 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom grid: recent posts + schedule + chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Posts */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Recent Posts</h3>
            <Link href="/calendar" className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {recentPosts.map((post) => {
              const sc = statusConfig[post.status] ?? statusConfig.draft;
              return (
                <div key={post.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{post.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex gap-1">
                        {post.platforms.map((p) => {
                          const Icon = platformIcons[p];
                          return Icon ? <Icon key={p} className="h-3 w-3 text-gray-400" /> : null;
                        })}
                      </div>
                      {post.scheduledAt !== "—" && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />{post.scheduledAt}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0", sc.className)}>{sc.label}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"><Eye className="h-3.5 w-3.5" /></button>
                    <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"><Edit3 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: schedule strip + platform chart */}
        <div className="space-y-4">
          {/* Weekly schedule */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">This Week</h3>
              <Link href="/calendar" className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">Calendar</Link>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => (
                <div key={day} className="text-center">
                  <p className="text-xs text-gray-400 mb-1.5">{day}</p>
                  <div className={cn("aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5", i === new Date().getDay() - 1 ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800" : "bg-gray-50 dark:bg-gray-800")}>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{i + 7}</span>
                    {scheduleDots[i] && (
                      <div className="flex gap-0.5">
                        {scheduleDots[i].slice(0, 3).map((dot, j) => (
                          <div key={j} className={cn("h-1 w-1 rounded-full", dot.color)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-violet-500" />Scheduled</span>
              <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-emerald-500" />Published</span>
            </div>
          </div>

          {/* Platform performance mini chart */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">Platform Engagement</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={platformData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} cursor={{ fill: "rgba(124,58,237,0.05)" }} />
                <Bar dataKey="engagement" fill="#7C3AED" radius={[4, 4, 0, 0]} name="Engagement %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
