"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mediaApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Trash2,
  Tag,
  Plus,
  ExternalLink,
  Loader2,
} from "lucide-react";

type ViewMode = "grid" | "list";
type MediaType = "all" | "images" | "videos" | "gifs";

interface MediaItem {
  key: string;
  name: string;
  type: "image" | "video" | "gif";
  size: string;
  sizeBytes: number;
  url: string;
  uploaded: string;
  color: string;
}

/** Derive a display-friendly type from a file name. */
function inferMediaType(name: string): "image" | "video" | "gif" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "gif") return "gif";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  return "image";
}

/** Format bytes to human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Pick a deterministic gradient color based on the file key. */
const GRADIENT_POOL = [
  "from-violet-400 to-purple-600",
  "from-blue-400 to-cyan-500",
  "from-emerald-400 to-teal-500",
  "from-orange-400 to-red-500",
  "from-pink-400 to-rose-500",
  "from-amber-400 to-yellow-500",
  "from-indigo-400 to-blue-600",
  "from-fuchsia-400 to-violet-500",
  "from-teal-400 to-green-500",
  "from-sky-400 to-blue-500",
];

function gradientForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return GRADIENT_POOL[Math.abs(hash) % GRADIENT_POOL.length];
}

/** Format a date string to relative time. */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

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
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
  const [typeFilter, setTypeFilter] = React.useState<MediaType>("all");
  const [sortBy, setSortBy] = React.useState("newest");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = React.useState(false);
  const [sidebarItem, setSidebarItem] = React.useState<MediaItem | null>(null);
  const [newTag, setNewTag] = React.useState("");
  const [tags, setTags] = React.useState<string[]>(["brand", "marketing", "social"]);
  const [uploadProgress, setUploadProgress] = React.useState<
    Array<{ name: string; progress: number }>
  >([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ── Queries & Mutations ──────────────────────────────────────────────────
  const { data: mediaData, isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: () => mediaApi.list(),
  });

  const media: MediaItem[] = (mediaData?.data ?? []).map((m) => ({
    key: m.key,
    name: m.key.split("/").pop() ?? m.key,
    type: inferMediaType(m.key),
    size: formatBytes(m.size),
    sizeBytes: m.size,
    url: m.url,
    uploaded: relativeTime(m.createdAt),
    color: gradientForKey(m.key),
  }));

  const deleteMutation = useMutation({
    mutationFn: (key: string) => mediaApi.delete(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setSidebarItem(null);
    },
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const entries = Array.from(files);
    setUploadProgress(entries.map((f) => ({ name: f.name, progress: 0 })));

    for (let i = 0; i < entries.length; i++) {
      const file = entries[i];
      try {
        const presignRes = await mediaApi.presign({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        });
        const { upload_url } = presignRes.data;

        await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        setUploadProgress((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, progress: 100 } : p))
        );
      } catch {
        setUploadProgress((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, progress: -1 } : p))
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: ["media"] });
  };

  // ── Filtering & sorting ──────────────────────────────────────────────────
  const filtered = media.filter((item) => {
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "images" && item.type === "image") ||
      (typeFilter === "videos" && item.type === "video") ||
      (typeFilter === "gifs" && item.type === "gif");
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "largest") return b.sizeBytes - a.sizeBytes;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    // newest / oldest — use uploaded string as proxy (API returns createdAt)
    return 0; // already sorted by API default (newest)
  });

  const toggleSelect = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const totalBytes = media.reduce((sum, m) => sum + m.sizeBytes, 0);
  const usedGB = totalBytes / (1024 * 1024 * 1024);
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.gif"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <div className="text-center mb-4">
              <Upload className="h-10 w-10 text-violet-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Drag & drop files here
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                or click to browse — JPG, PNG, GIF, MP4, MOV (max 500MB)
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 text-xs border-violet-300 text-violet-600"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Files
              </Button>
            </div>
            {uploadProgress.length > 0 && (
              <div className="space-y-2 max-w-md mx-auto">
                {uploadProgress.map((f) => (
                  <div key={f.name} className="bg-white dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.name}</span>
                      <span className="text-xs text-gray-500">
                        {f.progress === -1 ? "Failed" : `${f.progress}%`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          f.progress === 100 ? "bg-green-500" : f.progress === -1 ? "bg-red-500" : "bg-violet-500"
                        )}
                        style={{ width: `${Math.max(f.progress, 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Media content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-xl" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Image className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No media files found</p>
              <p className="text-xs text-gray-400 mt-1">Upload some files to get started.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                {sorted.length} items
                {selectedIds.size > 0 && (
                  <span className="ml-2 text-violet-600 font-medium">{selectedIds.size} selected</span>
                )}
              </p>

              {viewMode === "grid" ? (
                <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
                  {sorted.map((item) => (
                    <div
                      key={item.key}
                      onClick={() => setSidebarItem(item)}
                      className={cn(
                        "break-inside-avoid group relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all",
                        selectedIds.has(item.key)
                          ? "border-violet-500"
                          : "border-transparent hover:border-violet-200 dark:hover:border-violet-800"
                      )}
                    >
                      {/* Thumbnail */}
                      {item.type === "image" ? (
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-full object-cover aspect-video"
                          loading="lazy"
                        />
                      ) : (
                        <div className={cn("bg-gradient-to-br w-full aspect-video", item.color)}>
                          <div className="w-full h-full flex items-center justify-center">
                            <MediaTypeIcon type={item.type} />
                          </div>
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col p-2">
                        <div className="flex items-start justify-between">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSelect(item.key); }}
                            className="h-5 w-5 rounded border-2 border-white flex items-center justify-center bg-white/20 hover:bg-violet-500 transition-colors"
                          >
                            {selectedIds.has(item.key) && <span className="text-white text-xs">✓</span>}
                          </button>
                        </div>
                        <div className="mt-auto">
                          <p className="text-white text-xs font-medium truncate">{item.name}</p>
                          <p className="text-white/70 text-xs">{item.size}</p>
                          <div className="flex gap-1 mt-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.url); }}
                              className="h-6 w-6 rounded bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                            >
                              <Copy className="h-3 w-3 text-white" />
                            </button>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="h-6 w-6 rounded bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                            >
                              <ExternalLink className="h-3 w-3 text-white" />
                            </a>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(item.key); }}
                              className="h-6 w-6 rounded bg-white/20 hover:bg-red-500/60 flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="h-3 w-3 text-white" />
                            </button>
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
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Uploaded</th>
                        <th className="px-4 py-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((item, idx) => (
                        <tr
                          key={item.key}
                          onClick={() => setSidebarItem(item)}
                          className={cn(
                            "border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors",
                            idx === sorted.length - 1 && "border-b-0"
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
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden xl:table-cell">{item.uploaded}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.url); }}
                                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(item.key); }}
                                className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
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
            {sidebarItem.type === "image" ? (
              <img
                src={sidebarItem.url}
                alt={sidebarItem.name}
                className="w-full rounded-xl object-cover aspect-video"
              />
            ) : (
              <div className={cn("w-full rounded-xl bg-gradient-to-br flex items-center justify-center aspect-video", sidebarItem.color)}>
                <MediaTypeIcon type={sidebarItem.type} />
              </div>
            )}

            {/* Details */}
            <div className="space-y-2">
              {[
                { label: "Name", value: sidebarItem.name },
                { label: "Type", value: sidebarItem.type },
                { label: "Size", value: sidebarItem.size },
                { label: "Uploaded", value: sidebarItem.uploaded },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 capitalize">{value}</span>
                </div>
              ))}
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
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 justify-center text-xs"
                onClick={() => navigator.clipboard.writeText(sidebarItem.url)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy URL
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 justify-center text-xs text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
                onClick={() => deleteMutation.mutate(sidebarItem.key)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
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
            {usedGB.toFixed(2)} GB of {totalGB} GB used
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
