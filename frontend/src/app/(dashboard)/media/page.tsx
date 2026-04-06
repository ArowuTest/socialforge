"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Upload,
  Grid3X3,
  List,
  Image,
  Video,
  FileImage,
  X,
  Copy,
  Download,
  Trash2,
  Tag,
  Plus,
  ExternalLink,
} from "lucide-react";

type ViewMode = "grid" | "list";
type MediaType = "all" | "images" | "videos" | "gifs";

interface MediaItem {
  id: number;
  name: string;
  type: "image" | "video" | "gif";
  size: string;
  dimensions: string;
  usedIn: number;
  uploaded: string;
  color: string;
  aspectRatio: "square" | "landscape" | "portrait";
}

const mockMedia: MediaItem[] = [
  { id: 1, name: "hero-banner.jpg", type: "image", size: "2.4 MB", dimensions: "1920×1080", usedIn: 5, uploaded: "2 days ago", color: "from-violet-400 to-purple-600", aspectRatio: "landscape" },
  { id: 2, name: "product-shot-1.png", type: "image", size: "1.1 MB", dimensions: "800×800", usedIn: 12, uploaded: "3 days ago", color: "from-blue-400 to-cyan-500", aspectRatio: "square" },
  { id: 3, name: "team-photo.jpg", type: "image", size: "3.8 MB", dimensions: "2400×1600", usedIn: 2, uploaded: "1 week ago", color: "from-emerald-400 to-teal-500", aspectRatio: "landscape" },
  { id: 4, name: "promo-video.mp4", type: "video", size: "45.2 MB", dimensions: "1920×1080", usedIn: 3, uploaded: "1 week ago", color: "from-orange-400 to-red-500", aspectRatio: "landscape" },
  { id: 5, name: "logo-white.png", type: "image", size: "256 KB", dimensions: "512×512", usedIn: 28, uploaded: "2 weeks ago", color: "from-gray-700 to-gray-900", aspectRatio: "square" },
  { id: 6, name: "instagram-story-1.jpg", type: "image", size: "1.7 MB", dimensions: "1080×1920", usedIn: 7, uploaded: "3 days ago", color: "from-pink-400 to-rose-500", aspectRatio: "portrait" },
  { id: 7, name: "reel-highlight.mp4", type: "video", size: "22.1 MB", dimensions: "1080×1920", usedIn: 1, uploaded: "5 days ago", color: "from-amber-400 to-yellow-500", aspectRatio: "portrait" },
  { id: 8, name: "background-texture.png", type: "image", size: "890 KB", dimensions: "1600×900", usedIn: 4, uploaded: "2 weeks ago", color: "from-indigo-400 to-blue-600", aspectRatio: "landscape" },
  { id: 9, name: "animated-logo.gif", type: "gif", size: "1.5 MB", dimensions: "400×400", usedIn: 6, uploaded: "1 week ago", color: "from-fuchsia-400 to-violet-500", aspectRatio: "square" },
  { id: 10, name: "case-study-cover.jpg", type: "image", size: "2.1 MB", dimensions: "1200×628", usedIn: 2, uploaded: "4 days ago", color: "from-teal-400 to-green-500", aspectRatio: "landscape" },
  { id: 11, name: "headshot-ceo.jpg", type: "image", size: "1.8 MB", dimensions: "1000×1000", usedIn: 9, uploaded: "3 weeks ago", color: "from-rose-300 to-pink-400", aspectRatio: "square" },
  { id: 12, name: "event-banner.png", type: "image", size: "3.2 MB", dimensions: "2000×1000", usedIn: 1, uploaded: "6 days ago", color: "from-sky-400 to-blue-500", aspectRatio: "landscape" },
  { id: 13, name: "product-explainer.mp4", type: "video", size: "78.4 MB", dimensions: "1920×1080", usedIn: 4, uploaded: "1 week ago", color: "from-orange-300 to-amber-400", aspectRatio: "landscape" },
  { id: 14, name: "social-proof-1.jpg", type: "image", size: "980 KB", dimensions: "800×600", usedIn: 3, uploaded: "5 days ago", color: "from-lime-400 to-green-500", aspectRatio: "landscape" },
  { id: 15, name: "brand-colors.png", type: "image", size: "450 KB", dimensions: "1200×800", usedIn: 0, uploaded: "1 month ago", color: "from-violet-300 to-indigo-400", aspectRatio: "landscape" },
  { id: 16, name: "loading-animation.gif", type: "gif", size: "340 KB", dimensions: "200×200", usedIn: 8, uploaded: "2 weeks ago", color: "from-cyan-400 to-blue-500", aspectRatio: "square" },
  { id: 17, name: "testimonial-card.png", type: "image", size: "1.3 MB", dimensions: "1080×1080", usedIn: 5, uploaded: "1 week ago", color: "from-emerald-300 to-teal-400", aspectRatio: "square" },
  { id: 18, name: "podcast-cover.jpg", type: "image", size: "2.0 MB", dimensions: "3000×3000", usedIn: 2, uploaded: "10 days ago", color: "from-purple-400 to-violet-600", aspectRatio: "square" },
  { id: 19, name: "short-clip-teaser.mp4", type: "video", size: "15.6 MB", dimensions: "1080×1920", usedIn: 7, uploaded: "2 days ago", color: "from-red-400 to-rose-500", aspectRatio: "portrait" },
  { id: 20, name: "infographic-2024.png", type: "image", size: "4.5 MB", dimensions: "800×2000", usedIn: 11, uploaded: "2 weeks ago", color: "from-blue-400 to-violet-500", aspectRatio: "portrait" },
  { id: 21, name: "office-bts.jpg", type: "image", size: "2.7 MB", dimensions: "1600×1067", usedIn: 1, uploaded: "3 weeks ago", color: "from-amber-300 to-orange-400", aspectRatio: "landscape" },
  { id: 22, name: "feature-preview.gif", type: "gif", size: "2.8 MB", dimensions: "800×500", usedIn: 3, uploaded: "4 days ago", color: "from-green-400 to-emerald-500", aspectRatio: "landscape" },
  { id: 23, name: "newsletter-header.jpg", type: "image", size: "1.1 MB", dimensions: "600×200", usedIn: 6, uploaded: "1 week ago", color: "from-slate-400 to-gray-500", aspectRatio: "landscape" },
  { id: 24, name: "thumbnail-template.png", type: "image", size: "890 KB", dimensions: "1280×720", usedIn: 14, uploaded: "5 days ago", color: "from-violet-500 to-purple-600", aspectRatio: "landscape" },
];

const typeFilters: { id: MediaType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "gifs", label: "GIFs" },
];

function MediaTypeIcon({ type }: { type: MediaItem["type"] }) {
  if (type === "video") return <Video className="h-5 w-5 text-orange-400" />;
  if (type === "gif") return <FileImage className="h-5 w-5 text-fuchsia-400" />;
  return <Image className="h-5 w-5 text-blue-400" />;
}

export default function MediaPage() {
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
  const [typeFilter, setTypeFilter] = React.useState<MediaType>("all");
  const [sortBy, setSortBy] = React.useState("newest");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [showUpload, setShowUpload] = React.useState(false);
  const [sidebarItem, setSidebarItem] = React.useState<MediaItem | null>(null);
  const [newTag, setNewTag] = React.useState("");
  const [tags, setTags] = React.useState<string[]>(["brand", "marketing", "social"]);

  const filtered = mockMedia.filter((item) => {
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "images" && item.type === "image") ||
      (typeFilter === "videos" && item.type === "video") ||
      (typeFilter === "gifs" && item.type === "gif");
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const usedGB = 2.4;
  const totalGB = 10;
  const usedPct = (usedGB / totalGB) * 100;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Type filter */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {typeFilters.map((f) => (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  typeFilter === f.id
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
            <option value="name">Name A–Z</option>
          </select>

          {/* View toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "grid"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Upload button */}
          <Button
            onClick={() => setShowUpload(!showUpload)}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            size="sm"
          >
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>

        {/* Upload dropzone */}
        {showUpload && (
          <div className="border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-xl p-8 bg-violet-50 dark:bg-violet-900/10">
            <div className="text-center mb-4">
              <Upload className="h-10 w-10 text-violet-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Drag & drop files here
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                or click to browse — JPG, PNG, GIF, MP4, MOV (max 500MB)
              </p>
              <Button size="sm" variant="outline" className="mt-3 text-xs border-violet-300 text-violet-600">
                Browse Files
              </Button>
            </div>
            {/* Mock upload progress bars */}
            <div className="space-y-2 max-w-md mx-auto">
              {[
                { name: "hero-image.jpg", progress: 100 },
                { name: "product-video.mp4", progress: 67 },
              ].map((f) => (
                <div key={f.name} className="bg-white dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.name}</span>
                    <span className="text-xs text-gray-500">{f.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", f.progress === 100 ? "bg-green-500" : "bg-violet-500")}
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Media content */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            {filtered.length} items
            {selectedIds.size > 0 && (
              <span className="ml-2 text-violet-600 font-medium">{selectedIds.size} selected</span>
            )}
          </p>

          {viewMode === "grid" ? (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSidebarItem(item)}
                  className={cn(
                    "break-inside-avoid group relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all",
                    selectedIds.has(item.id)
                      ? "border-violet-500"
                      : "border-transparent hover:border-violet-200 dark:hover:border-violet-800"
                  )}
                >
                  {/* Thumbnail */}
                  <div
                    className={cn(
                      "bg-gradient-to-br w-full",
                      item.color,
                      item.aspectRatio === "landscape" ? "aspect-video" : item.aspectRatio === "portrait" ? "aspect-[9/16]" : "aspect-square"
                    )}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <MediaTypeIcon type={item.type} />
                    </div>
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col p-2">
                    <div className="flex items-start justify-between">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                        className="h-5 w-5 rounded border-2 border-white flex items-center justify-center bg-white/20 hover:bg-violet-500 transition-colors"
                      >
                        {selectedIds.has(item.id) && <span className="text-white text-xs">✓</span>}
                      </button>
                    </div>
                    <div className="mt-auto">
                      <p className="text-white text-xs font-medium truncate">{item.name}</p>
                      <p className="text-white/70 text-xs">{item.size}</p>
                      <div className="flex gap-1 mt-1.5">
                        {[ExternalLink, Copy, Download, Trash2].map((Icon, i) => (
                          <button
                            key={i}
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 w-6 rounded bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                          >
                            <Icon className="h-3 w-3 text-white" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-12"></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Size</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Dimensions</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Used in</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Uploaded</th>
                    <th className="px-4 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={() => setSidebarItem(item)}
                      className={cn(
                        "border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors",
                        idx === filtered.length - 1 && "border-b-0"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className={cn("h-9 w-9 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0", item.color)}>
                          <MediaTypeIcon type={item.type} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{item.name}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="secondary" className="text-xs capitalize">{item.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell">{item.size}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell">{item.dimensions}</td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-xs text-gray-500">{item.usedIn} posts</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden xl:table-cell">{item.uploaded}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {[Copy, Download, Trash2].map((Icon, i) => (
                            <button
                              key={i}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right sidebar — item detail */}
        {sidebarItem && (
          <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">File Details</h3>
              <button
                onClick={() => setSidebarItem(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Preview */}
            <div className={cn("w-full rounded-xl bg-gradient-to-br flex items-center justify-center aspect-video", sidebarItem.color)}>
              <MediaTypeIcon type={sidebarItem.type} />
            </div>

            {/* Details */}
            <div className="space-y-2">
              {[
                { label: "Name", value: sidebarItem.name },
                { label: "Type", value: sidebarItem.type },
                { label: "Size", value: sidebarItem.size },
                { label: "Dimensions", value: sidebarItem.dimensions },
                { label: "Uploaded", value: sidebarItem.uploaded },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 capitalize">{value}</span>
                </div>
              ))}
            </div>

            {/* Used in */}
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Used in {sidebarItem.usedIn} posts</p>
              {sidebarItem.usedIn > 0 && (
                <div className="space-y-1">
                  {Array.from({ length: Math.min(sidebarItem.usedIn, 3) }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 p-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="h-6 w-6 rounded bg-gradient-to-br from-violet-400 to-purple-500 flex-shrink-0" />
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate">Post #{i + 1} · {i === 0 ? "2 days ago" : i === 1 ? "5 days ago" : "1 week ago"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                <Tag className="h-3 w-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-full text-xs">
                    {tag}
                    <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-500 transition-colors">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Add tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                  onClick={handleAddTag}
                  className="p-1 rounded bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-1.5 justify-center text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                Use in Compose
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1.5 justify-center text-xs">
                <Copy className="h-3.5 w-3.5" />
                Copy URL
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1.5 justify-center text-xs text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Storage bar */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
            {usedGB} GB of {totalGB} GB used
          </span>
          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">{Math.round(usedPct)}%</span>
          <Button size="sm" variant="outline" className="text-xs flex-shrink-0 h-7">
            Upgrade Storage
          </Button>
        </div>
      </div>
    </div>
  );
}
