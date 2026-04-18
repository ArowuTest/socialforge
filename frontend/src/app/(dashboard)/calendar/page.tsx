"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  getDay,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  LayoutGrid,
  Plus,
  X,
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  Video,
  MessageCircle,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getPlatformColor, getPlatformDisplayName, truncateText } from "@/lib/utils";
import { postsApi } from "@/lib/api";
import { Platform, Post, PostStatus } from "@/types";

const platformFilterOptions = [
  { label: "All", value: "all" },
  { label: "Instagram", value: Platform.INSTAGRAM },
  { label: "TikTok", value: Platform.TIKTOK },
  { label: "YouTube", value: Platform.YOUTUBE },
  { label: "LinkedIn", value: Platform.LINKEDIN },
  { label: "Twitter", value: Platform.TWITTER },
  { label: "Facebook", value: Platform.FACEBOOK },
];

const platformColors: Record<string, string> = {
  [Platform.INSTAGRAM]: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  [Platform.TIKTOK]: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  [Platform.YOUTUBE]: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  [Platform.LINKEDIN]: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  [Platform.TWITTER]: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  [Platform.FACEBOOK]: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const platformDotColors: Record<string, string> = {
  [Platform.INSTAGRAM]: "bg-pink-500",
  [Platform.TIKTOK]: "bg-gray-700",
  [Platform.YOUTUBE]: "bg-red-500",
  [Platform.LINKEDIN]: "bg-blue-700",
  [Platform.TWITTER]: "bg-sky-500",
  [Platform.FACEBOOK]: "bg-blue-600",
  [Platform.PINTEREST]: "bg-red-600",
  [Platform.THREADS]: "bg-gray-900",
};

type ViewMode = "month" | "week" | "list";

function PostPill({ post }: { post: Post }) {
  const firstPlatform = post.platforms[0] as Platform | undefined;
  const dotColor = firstPlatform ? platformDotColors[firstPlatform] ?? "bg-violet-500" : "bg-violet-500";
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 truncate cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", dotColor)} />
      <span className="truncate">{truncateText(post.caption, 28)}</span>
    </div>
  );
}

function DayPanel({ date, posts, onClose }: { date: Date; posts: Post[]; onClose: () => void }) {
  return (
    <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">
            {format(date, "MMMM d")}
          </p>
          <p className="text-xs text-muted-foreground">{posts.length} posts</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No posts scheduled
          </p>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-violet-200 dark:hover:border-violet-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                {post.platforms.map((platform) => (
                  <span
                    key={platform}
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full font-medium",
                      platformColors[platform] ?? "bg-gray-100 text-gray-600"
                    )}
                  >
                    {getPlatformDisplayName(platform)}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                {post.caption}
              </p>
              {post.scheduledAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(post.scheduledAt), "h:mm a")}
                </p>
              )}
              <div className="mt-1.5">
                <StatusBadge status={post.status} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PostStatus }) {
  const config = {
    [PostStatus.SCHEDULED]: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    [PostStatus.PUBLISHED]: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    [PostStatus.DRAFT]: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    [PostStatus.FAILED]: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    [PostStatus.PROCESSING]: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  };
  const labels = {
    [PostStatus.SCHEDULED]: "Scheduled",
    [PostStatus.PUBLISHED]: "Published",
    [PostStatus.DRAFT]: "Draft",
    [PostStatus.FAILED]: "Failed",
    [PostStatus.PROCESSING]: "Processing",
  };
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", config[status])}>
      {labels[status]}
    </span>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-900 p-2 min-h-[100px]">
          <Skeleton className="h-5 w-5 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [viewMode, setViewMode] = React.useState<ViewMode>("month");
  const [selectedPlatforms, setSelectedPlatforms] = React.useState<string[]>(["all"]);
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

  const monthKey = format(currentDate, "yyyy-MM");

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ["calendar", monthKey],
    queryFn: () => postsApi.getCalendar(monthKey),
  });

  const calendarEntries = calendarData?.data ?? [];

  const getPostsForDate = (date: Date): Post[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const entry = calendarEntries.find((e: { date: string }) => e.date === dateStr);
    if (!entry) return [];
    let posts: Post[] = entry.posts;
    if (!selectedPlatforms.includes("all")) {
      posts = posts.filter((p: Post) =>
        p.platforms.some((platform) => selectedPlatforms.includes(platform))
      );
    }
    return posts;
  };

  const togglePlatform = (value: string) => {
    if (value === "all") {
      setSelectedPlatforms(["all"]);
      return;
    }
    const next = selectedPlatforms.filter((p) => p !== "all");
    if (next.includes(value)) {
      const filtered = next.filter((p) => p !== value);
      setSelectedPlatforms(filtered.length === 0 ? ["all"] : filtered);
    } else {
      setSelectedPlatforms([...next, value]);
    }
  };

  // Build month grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const selectedDayPosts = selectedDate ? getPostsForDate(selectedDate) : [];

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          {/* Month nav */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[160px] text-center">
              {format(currentDate, "MMMM yyyy")}
            </h2>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              className="ml-1 text-xs h-7"
            >
              Today
            </Button>
          </div>

          {/* View mode */}
          <div className="flex items-center gap-1 ml-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(["month", "week", "list"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-all capitalize",
                  viewMode === mode
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Platform filters */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {platformFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => togglePlatform(opt.value)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                selectedPlatforms.includes(opt.value)
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Calendar grid */}
        {isLoading ? (
          <CalendarSkeleton />
        ) : viewMode === "month" ? (
          <div className="flex-1 overflow-auto">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {days.map((day) => {
                const posts = getPostsForDate(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const showPosts = posts.slice(0, 3);
                const overflow = posts.length - 3;

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(isSameDay(day, selectedDate ?? new Date(0)) && selectedDate ? null : day)}
                    className={cn(
                      "bg-white dark:bg-gray-900 p-2 min-h-[90px] md:min-h-[110px] cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50",
                      !isCurrentMonth && "opacity-40",
                      isSelected && "ring-2 ring-inset ring-violet-400 bg-violet-50/50 dark:bg-violet-900/10"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full",
                          isToday(day)
                            ? "bg-violet-600 text-white font-bold"
                            : "text-gray-700 dark:text-gray-300"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      {showPosts.map((post) => (
                        <PostPill key={post.id} post={post} />
                      ))}
                      {overflow > 0 && (
                        <p className="text-xs text-muted-foreground px-1.5">
                          +{overflow} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === "week" ? (
          <div className="flex-1 overflow-auto">
            <div className="text-sm text-muted-foreground text-center py-8">
              Week view coming soon
            </div>
          </div>
        ) : (
          // List view
          <div className="flex-1 overflow-auto space-y-2">
            {calendarEntries.length === 0 ? (
              <div className="text-center py-16">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No posts scheduled</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start by scheduling your first post
                </p>
              </div>
            ) : (
              calendarEntries.flatMap((entry: { date: string; posts: Post[] }) =>
                entry.posts.map((post: Post) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-violet-200 dark:hover:border-violet-800 transition-colors"
                  >
                    <div className="text-xs text-muted-foreground w-16 flex-shrink-0 pt-0.5">
                      {format(new Date(entry.date), "MMM d")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {post.platforms.map((platform) => (
                          <span
                            key={platform}
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded-full font-medium",
                              platformColors[platform] ?? "bg-gray-100 text-gray-600"
                            )}
                          >
                            {getPlatformDisplayName(platform as Platform)}
                          </span>
                        ))}
                        <StatusBadge status={post.status} />
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                        {post.caption}
                      </p>
                    </div>
                    {post.scheduledAt && (
                      <div className="text-xs text-muted-foreground flex-shrink-0">
                        {format(new Date(post.scheduledAt), "h:mm a")}
                      </div>
                    )}
                  </div>
                ))
              )
            )}
          </div>
        )}
      </div>

      {/* Day panel slide-in */}
      {selectedDate && (
        <DayPanel
          date={selectedDate}
          posts={selectedDayPosts}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* FAB */}
      <button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-20"
        onClick={() => router.push("/compose")}
        title="Schedule new post"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
