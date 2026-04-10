import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisYear,
} from "date-fns";
import { Platform } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, pattern = "MMM d, yyyy"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisYear(d)) return format(d, "MMM d");
  return format(d, pattern);
}

export function formatFullDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MMMM d, yyyy 'at' h:mm a");
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toString();
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function getPlatformColor(platform: Platform): string {
  const colors: Record<Platform, string> = {
    [Platform.INSTAGRAM]: "#E1306C",
    [Platform.TIKTOK]: "#010101",
    [Platform.YOUTUBE]: "#FF0000",
    [Platform.LINKEDIN]: "#0A66C2",
    [Platform.TWITTER]: "#1DA1F2",
    [Platform.FACEBOOK]: "#1877F2",
    [Platform.PINTEREST]: "#E60023",
    [Platform.THREADS]: "#000000",
    [Platform.BLUESKY]: "#0085FF",
  };
  return colors[platform] ?? "#6B7280";
}

export function getPlatformBgClass(platform: Platform): string {
  const classes: Record<Platform, string> = {
    [Platform.INSTAGRAM]: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400",
    [Platform.TIKTOK]: "bg-black",
    [Platform.YOUTUBE]: "bg-red-600",
    [Platform.LINKEDIN]: "bg-blue-700",
    [Platform.TWITTER]: "bg-sky-500",
    [Platform.FACEBOOK]: "bg-blue-600",
    [Platform.PINTEREST]: "bg-red-600",
    [Platform.THREADS]: "bg-black",
    [Platform.BLUESKY]: "bg-blue-500",
  };
  return classes[platform] ?? "bg-gray-500";
}

export function getPlatformIconName(platform: Platform): string {
  const icons: Record<Platform, string> = {
    [Platform.INSTAGRAM]: "Instagram",
    [Platform.TIKTOK]: "Video",
    [Platform.YOUTUBE]: "Youtube",
    [Platform.LINKEDIN]: "Linkedin",
    [Platform.TWITTER]: "Twitter",
    [Platform.FACEBOOK]: "Facebook",
    [Platform.PINTEREST]: "Pin",
    [Platform.THREADS]: "MessageCircle",
    [Platform.BLUESKY]: "Globe",
  };
  return icons[platform] ?? "Globe";
}

export function getPlatformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    [Platform.INSTAGRAM]: "Instagram",
    [Platform.TIKTOK]: "TikTok",
    [Platform.YOUTUBE]: "YouTube",
    [Platform.LINKEDIN]: "LinkedIn",
    [Platform.TWITTER]: "Twitter / X",
    [Platform.FACEBOOK]: "Facebook",
    [Platform.PINTEREST]: "Pinterest",
    [Platform.THREADS]: "Threads",
    [Platform.BLUESKY]: "Bluesky",
  };
  return names[platform] ?? platform;
}

export function getCharacterLimit(platform: Platform): number {
  const limits: Record<Platform, number> = {
    [Platform.TWITTER]: 280,
    [Platform.INSTAGRAM]: 2200,
    [Platform.TIKTOK]: 2200,
    [Platform.YOUTUBE]: 5000,
    [Platform.LINKEDIN]: 3000,
    [Platform.FACEBOOK]: 63206,
    [Platform.PINTEREST]: 500,
    [Platform.THREADS]: 500,
    [Platform.BLUESKY]: 300,
  };
  return limits[platform] ?? 2200;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function generateGradient(seed: string): string {
  const gradients = [
    "from-purple-500 to-pink-500",
    "from-blue-500 to-cyan-500",
    "from-green-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-indigo-500 to-purple-500",
    "from-pink-500 to-rose-500",
  ];
  const index = seed.charCodeAt(0) % gradients.length;
  return gradients[index];
}
