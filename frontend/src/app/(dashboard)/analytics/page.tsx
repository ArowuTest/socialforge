"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  BarChart,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Area,
  Bar,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  Heart,
  Trophy,
  FileText,
  ArrowUpDown,
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  Video,
  Image,
  Film,
  AlignLeft,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { analyticsApi } from "@/lib/api";
import { Platform } from "@/types";
import { cn, formatNumber, formatRelativeTime, getPlatformDisplayName, truncateText } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ──────────────────────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "90d";

type SortKey = "impressions" | "engagement";

interface TopPost {
  id: string;
  thumbnail?: string;
  excerpt: string;
  platform: Platform;
  publishedAt: string;
  impressions: number;
  engagement: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DATE_RANGES: { label: string; value: DateRange; days: number }[] = [
  { label: "7D", value: "7d", days: 7 },
  { label: "30D", value: "30d", days: 30 },
  { label: "90D", value: "90d", days: 90 },
];

const PLATFORM_COLORS: Record<string, string> = {
  [Platform.INSTAGRAM]: "#E1306C",
  [Platform.TIKTOK]: "#010101",
  [Platform.LINKEDIN]: "#0A66C2",
  [Platform.TWITTER]: "#1DA1F2",
  [Platform.YOUTUBE]: "#FF0000",
  [Platform.FACEBOOK]: "#1877F2",
};

const CONTENT_TYPE_COLORS = ["#7C3AED", "#0EA5E9", "#F59E0B", "#10B981"];

const MOCK_POSTS_PER_DAY = (days: number) =>
  Array.from({ length: days }, (_, i) => ({
    date: format(subDays(new Date(), days - 1 - i), "MMM d"),
    count: Math.floor(Math.random() * 8) + 1,
  }));

const MOCK_ENGAGEMENT_BY_PLATFORM = [
  { platform: "Instagram", engagement: 4200 },
  { platform: "TikTok", engagement: 8900 },
  { platform: "LinkedIn", engagement: 1800 },
  { platform: "Twitter", engagement: 3100 },
  { platform: "YouTube", engagement: 2400 },
  { platform: "Facebook", engagement: 960 },
];

const MOCK_CONTENT_TYPES = [
  { name: "Image", value: 42 },
  { name: "Video", value: 27 },
  { name: "Carousel", value: 19 },
  { name: "Text Only", value: 12 },
];

const MOCK_TOP_POSTS: TopPost[] = Array.from({ length: 8 }, (_, i) => ({
  id: `post-${i}`,
  excerpt: [
    "Behind the scenes of our product launch 🚀 Check out what went into making this happen…",
    "5 tips to grow your audience on Instagram in 2024 — Thread",
    "Big announcement coming soon! Stay tuned for something exciting…",
    "Our team at the annual conference — amazing energy this year!",
    "New feature drop: AI-powered scheduling is now live for all users",
    "Throwback to when we first launched. Look how far we've come!",
    "Customer spotlight: How @brand grew 40% in 3 months using SocialForge",
    "Weekly roundup: top performing content and what we learned",
  ][i],
  platform: [Platform.INSTAGRAM, Platform.TIKTOK, Platform.LINKEDIN, Platform.TWITTER, Platform.YOUTUBE, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.LINKEDIN][i],
  publishedAt: subDays(new Date(), i * 3 + 1).toISOString(),
  impressions: Math.floor(Math.random() * 90_000) + 10_000,
  engagement: Math.round((Math.random() * 6 + 1) * 10) / 10,
}));

// ── Small helpers ──────────────────────────────────────────────────────────

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const icons: Partial<Record<Platform, React.ElementType>> = {
    [Platform.INSTAGRAM]: Instagram,
    [Platform.TIKTOK]: Video,
    [Platform.YOUTUBE]: Youtube,
    [Platform.LINKEDIN]: Linkedin,
    [Platform.TWITTER]: Twitter,
    [Platform.FACEBOOK]: Facebook,
  };
  const Icon = icons[platform] ?? FileText;
  return <Icon className={cn("h-4 w-4", className)} />;
}

function TrendBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full",
        positive
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      )}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {value}%
    </span>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  trend?: number;
  icon: React.ElementType;
  iconColor?: string;
  loading?: boolean;
}

function KpiCard({ label, value, trend, icon: Icon, iconColor = "text-violet-600", loading }: KpiCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-4 w-28 mb-3" />
          <Skeleton className="h-8 w-20 mb-2" />
          <Skeleton className="h-4 w-16" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <div className={cn("p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20", iconColor.replace("text-", "bg-").replace("-600", "-50"))}>
            <Icon className={cn("h-4 w-4", iconColor)} />
          </div>
        </div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-1.5">
          {value}
        </p>
        {trend !== undefined && <TrendBadge value={trend} />}
      </CardContent>
    </Card>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm">
      {label && <p className="font-medium text-gray-900 dark:text-white mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-gray-600 dark:text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-medium text-gray-900 dark:text-white">{formatNumber(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyAnalytics() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <TrendingUp className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        No analytics data yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Analytics data will appear after your first published post. Start scheduling content to see your performance.
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = React.useState<DateRange>("30d");
  const [sortKey, setSortKey] = React.useState<SortKey>("impressions");
  const [sortAsc, setSortAsc] = React.useState(false);

  const rangeConfig = DATE_RANGES.find((r) => r.value === dateRange)!;
  const endDate = format(new Date(), "yyyy-MM-dd");
  const startDate = format(subDays(new Date(), rangeConfig.days), "yyyy-MM-dd");

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ["analytics-overview", dateRange],
    queryFn: () => analyticsApi.getOverview({ startDate, endDate }),
  });

  const { data: topPostsData, isLoading: topPostsLoading } = useQuery({
    queryKey: ["analytics-top-posts", dateRange],
    queryFn: () => analyticsApi.getTopPosts({ startDate, endDate, limit: 10 }),
  });

  // Use real data if available, otherwise fall back to mock data
  const postsPerDay =
    overviewData?.data?.postsPerDay?.length
      ? overviewData.data.postsPerDay.map((d) => ({ date: format(new Date(d.date), "MMM d"), count: d.count }))
      : MOCK_POSTS_PER_DAY(rangeConfig.days);

  const engagementByPlatform =
    overviewData?.data?.engagementByPlatform?.length
      ? overviewData.data.engagementByPlatform
      : MOCK_ENGAGEMENT_BY_PLATFORM;

  const topPosts: TopPost[] =
    topPostsData?.data?.length
      ? topPostsData.data.map((p) => ({
          id: p.id,
          excerpt: p.caption,
          platform: p.platforms?.[0]?.platform ?? Platform.INSTAGRAM,
          publishedAt: p.publishedAt ?? p.scheduledAt ?? p.createdAt,
          impressions: p.platforms?.[0]?.metrics?.impressions ?? 0,
          engagement: 0,
        }))
      : MOCK_TOP_POSTS;

  const sortedPosts = [...topPosts].sort((a, b) => {
    const diff = sortKey === "impressions" ? a.impressions - b.impressions : a.engagement - b.engagement;
    return sortAsc ? diff : -diff;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const hasData = !overviewLoading && (overviewData?.data?.totalPosts ?? 0) > 0 || true; // always show with mock

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Analytics</h2>
          <p className="text-sm text-muted-foreground">Track your content performance across all platforms.</p>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg self-start sm:self-auto">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                dateRange === r.value
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Posts Published"
          value={overviewLoading ? "—" : formatNumber(overviewData?.data?.totalPosts ?? 124)}
          trend={12}
          icon={FileText}
          iconColor="text-violet-600"
          loading={overviewLoading}
        />
        <KpiCard
          label="Total Impressions"
          value={overviewLoading ? "—" : formatNumber(overviewData?.data?.totalReach ?? 245_800)}
          trend={8}
          icon={Eye}
          iconColor="text-sky-600"
          loading={overviewLoading}
        />
        <KpiCard
          label="Avg Engagement Rate"
          value={overviewLoading ? "—" : `${overviewData?.data?.totalEngagement ? ((overviewData.data.totalEngagement / (overviewData.data.totalReach || 1)) * 100).toFixed(1) : "4.2"}%`}
          trend={-2}
          icon={Heart}
          iconColor="text-pink-600"
          loading={overviewLoading}
        />
        <KpiCard
          label="Best Performing Platform"
          value={overviewLoading ? "—" : getPlatformDisplayName((overviewData?.data?.bestPlatform as Platform) ?? Platform.INSTAGRAM)}
          icon={Trophy}
          iconColor="text-amber-600"
          loading={overviewLoading}
        />
      </div>

      {/* Charts section */}
      <div className="space-y-4">
        {/* Posts over time — full width */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Posts Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={postsPerDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="postGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.ceil(postsPerDay.length / 7) - 1}
                    className="text-gray-500 dark:text-gray-400"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                    className="text-gray-500 dark:text-gray-400"
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Posts"
                    stroke="#7C3AED"
                    strokeWidth={2}
                    fill="url(#postGradient)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: "#7C3AED" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Two-column charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Engagement by Platform */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Engagement by Platform</CardTitle>
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart
                    data={engagementByPlatform}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="platform"
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      tickLine={false}
                      axisLine={false}
                      className="text-gray-500 dark:text-gray-400"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      tickLine={false}
                      axisLine={false}
                      className="text-gray-500 dark:text-gray-400"
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="engagement" name="Engagement" radius={[4, 4, 0, 0]}>
                      {engagementByPlatform.map((entry, index) => {
                        const platform = Object.values(Platform).find(
                          (p) => getPlatformDisplayName(p).toLowerCase() === entry.platform.toLowerCase()
                        );
                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={platform ? PLATFORM_COLORS[platform] ?? "#7C3AED" : "#7C3AED"}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Content Type Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Content Type Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="100%" height={224}>
                    <PieChart>
                      <Pie
                        data={MOCK_CONTENT_TYPES}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {MOCK_CONTENT_TYPES.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CONTENT_TYPE_COLORS[index]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, ""]}
                        content={<ChartTooltip />}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top Posts Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Top Posts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topPostsLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !hasData ? (
            <EmptyAnalytics />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-100 dark:border-gray-800">
                    <TableHead className="pl-5 w-[40%]">Post</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium text-xs hover:text-gray-900 dark:hover:text-white"
                        onClick={() => handleSort("impressions")}
                      >
                        Impressions
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 font-medium text-xs hover:text-gray-900 dark:hover:text-white"
                        onClick={() => handleSort("engagement")}
                      >
                        Engagement
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPosts.map((post) => (
                    <TableRow
                      key={post.id}
                      className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          {/* Thumbnail placeholder */}
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-100 to-purple-200 dark:from-violet-900/30 dark:to-purple-900/30 flex-shrink-0 flex items-center justify-center">
                            <Image className="h-4 w-4 text-violet-500" />
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 max-w-xs">
                            {truncateText(post.excerpt, 80)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: PLATFORM_COLORS[post.platform] ?? "#7C3AED" }}
                        >
                          <PlatformIcon platform={post.platform} className="h-3 w-3" />
                          {getPlatformDisplayName(post.platform)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(post.publishedAt)}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatNumber(post.impressions)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-xs font-medium",
                            post.engagement >= 4
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : post.engagement >= 2
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          )}
                        >
                          {post.engagement}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
