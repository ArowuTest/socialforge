"use client";

import * as React from "react";
import {
  Upload,
  Download,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { postsApi } from "@/lib/api";
import { Platform, PostType } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  content: string;
  platforms: string[];
  scheduled_at?: string;
  post_type: string;
  hashtags: string[];
  title: string;
  media_urls: string[];
  first_comment: string;
  link_url: string;
  // Validation
  errors: string[];
  rowIndex: number;
}

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_PLATFORMS = new Set<string>([
  "instagram", "tiktok", "youtube", "linkedin",
  "twitter", "facebook", "pinterest", "threads", "bluesky",
]);

const VALID_POST_TYPES = new Set<string>([
  "text", "reel", "story", "carousel", "video", "thread", "short", "pin",
]);

const TEMPLATE_CSV = `content,platforms,scheduled_at,post_type,hashtags,title,first_comment,link_url
"Exciting news! Our summer collection is live 🎉","instagram,facebook","2026-06-01T09:00:00+00:00","text","#summer,#fashion,#newcollection","Summer Launch","Shop now in bio! 🛍️",""
"Behind the scenes of our latest shoot 🎬","instagram,tiktok","2026-06-02T12:00:00+00:00","reel","#bts,#content","BTS Reel","","https://example.com/bts"
"5 tips to grow your audience in 2026","linkedin,twitter","","text","#marketing,#growthtips","LinkedIn Tips","","https://blog.example.com/growth-tips"
`;

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });

    const errors: string[] = [];
    const content = row["content"] ?? "";
    if (!content) errors.push("content is required");

    const rawPlatforms = (row["platforms"] ?? "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (rawPlatforms.length === 0) errors.push("platforms is required");
    const unknownPlatforms = rawPlatforms.filter((p) => !VALID_PLATFORMS.has(p));
    if (unknownPlatforms.length > 0) errors.push(`unknown platform(s): ${unknownPlatforms.join(", ")}`);

    const rawPostType = (row["post_type"] ?? "text").toLowerCase() || "text";
    if (!VALID_POST_TYPES.has(rawPostType)) errors.push(`unknown post_type: ${rawPostType}`);

    const scheduledAt = row["scheduled_at"] ?? "";
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime())) errors.push("scheduled_at is not a valid ISO 8601 date");
      else if (d <= new Date()) errors.push("scheduled_at must be in the future");
    }

    const hashtags = (row["hashtags"] ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    const mediaUrls = (row["media_urls"] ?? "").split(",").map((u) => u.trim()).filter(Boolean);

    rows.push({
      content,
      platforms: rawPlatforms,
      scheduled_at: scheduledAt || undefined,
      post_type: rawPostType,
      hashtags,
      title: row["title"] ?? "",
      media_urls: mediaUrls,
      first_comment: row["first_comment"] ?? "",
      link_url: row["link_url"] ?? "",
      errors,
      rowIndex: i,
    });
  }

  return rows;
}

/** Minimal CSV line parser — handles quoted fields containing commas. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "submit";

export function CSVImportModal({ open, onOpenChange, onSuccess }: CSVImportModalProps) {
  const [step, setStep] = React.useState<Step>("upload");
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [progress, setProgress] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("upload");
        setRows([]);
        setProgress(0);
      }, 300);
    }
  }, [open]);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error("No rows found in CSV. Make sure the file has a header row and at least one data row.");
        return;
      }
      setRows(parsed);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "socialforge-bulk-schedule-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);

  async function handleSubmit() {
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setStep("submit");
    setProgress(0);

    const BATCH = 50;
    const batches = Math.ceil(validRows.length / BATCH);
    let created = 0;

    try {
      for (let b = 0; b < batches; b++) {
        const batch = validRows.slice(b * BATCH, (b + 1) * BATCH).map((row) => ({
          caption: row.content,
          platforms: row.platforms as Platform[],
          postType: (row.post_type as PostType) || PostType.POST,
          ...(row.scheduled_at && { scheduledAt: row.scheduled_at }),
          ...(row.hashtags.length > 0 && { tags: row.hashtags }),
          ...(row.media_urls.length > 0 && { mediaUrls: row.media_urls }),
          ...(row.title && { title: row.title }),
          ...(row.first_comment && { firstComment: row.first_comment }),
          ...(row.link_url && { linkUrl: row.link_url }),
        }));

        await postsApi.bulkCreate(batch);
        created += batch.length;
        setProgress(Math.round((created / validRows.length) * 100));
      }

      toast.success(`${created} post${created !== 1 ? "s" : ""} scheduled successfully`);
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to import some posts. Please try again.");
      setStep("preview");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Schedule from CSV</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <span className={cn(step === "upload" ? "text-foreground font-medium" : "")}>
            1. Upload
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className={cn(step === "preview" || step === "submit" ? "text-foreground font-medium" : "")}>
            2. Preview
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className={cn(step === "submit" ? "text-foreground font-medium" : "")}>
            3. Import
          </span>
        </div>

        {/* ── Upload step ── */}
        {step === "upload" && (
          <div className="flex flex-col gap-4 flex-1">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium mb-1">Drag & drop your CSV file here</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
              <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-1">CSV Format</p>
                <p className="text-xs text-muted-foreground">
                  Required columns: <code className="font-mono bg-muted px-1 rounded">content</code>,{" "}
                  <code className="font-mono bg-muted px-1 rounded">platforms</code>.
                  Optional: <code className="font-mono bg-muted px-1 rounded">scheduled_at</code> (ISO 8601),{" "}
                  <code className="font-mono bg-muted px-1 rounded">post_type</code>,{" "}
                  <code className="font-mono bg-muted px-1 rounded">hashtags</code>,{" "}
                  <code className="font-mono bg-muted px-1 rounded">title</code>,{" "}
                  <code className="font-mono bg-muted px-1 rounded">media_urls</code>,{" "}
                  <code className="font-mono bg-muted px-1 rounded">first_comment</code>,{" "}
                  <code className="font-mono bg-muted px-1 rounded">link_url</code>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Template
              </Button>
            </div>
          </div>
        )}

        {/* ── Preview step ── */}
        {step === "preview" && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {rows.length} row{rows.length !== 1 ? "s" : ""} parsed
                </Badge>
                {errorRows.length > 0 && (
                  <Badge variant="destructive">
                    {errorRows.length} with errors
                  </Badge>
                )}
                <Badge className="bg-green-500/10 text-green-700 border-green-500/30">
                  {validRows.length} valid
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStep("upload"); setRows([]); }}
              >
                <X className="h-4 w-4 mr-1" />
                Replace file
              </Button>
            </div>

            {errorRows.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} with errors will be skipped.
                  Fix the CSV and re-upload to include them.
                </span>
              </div>
            )}

            <div className="overflow-auto flex-1 rounded-lg border text-sm">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Content</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Platforms</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Scheduled at</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={cn(
                        "border-t",
                        row.errors.length > 0
                          ? "bg-red-500/5 text-muted-foreground"
                          : "hover:bg-muted/30"
                      )}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{row.rowIndex}</td>
                      <td className="px-3 py-2 max-w-xs">
                        <p className="truncate">{row.content || <em className="text-red-500">missing</em>}</p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.platforms.map((p) => (
                            <span key={p} className="text-xs bg-muted px-1.5 py-0.5 rounded capitalize">
                              {p}
                            </span>
                          ))}
                          {row.platforms.length === 0 && (
                            <span className="text-xs text-red-500">missing</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {row.scheduled_at
                          ? new Date(row.scheduled_at).toLocaleString()
                          : <span className="italic">auto-assign</span>}
                      </td>
                      <td className="px-3 py-2 capitalize">{row.post_type}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <div title={row.errors.join("; ")}>
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          </div>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={validRows.length === 0}
                onClick={handleSubmit}
              >
                Import {validRows.length} post{validRows.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* ── Submit step ── */}
        {step === "submit" && (
          <div className="flex flex-col items-center justify-center flex-1 gap-6 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="w-full max-w-sm text-center">
              <p className="font-medium mb-3">
                Scheduling {validRows.length} post{validRows.length !== 1 ? "s" : ""}…
              </p>
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2">{progress}% complete</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
