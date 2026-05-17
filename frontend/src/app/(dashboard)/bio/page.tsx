"use client";

/**
 * Link-in-bio management page.
 *
 * Lets the editor (a) create/update the workspace's bio page, (b) add/edit/
 * delete links on it, (c) see the public URL with a copy button. One page
 * per workspace — backend enforces via the unique index on workspace_id.
 *
 * Public viewer route lives at /bio/[slug]; admin moderation lives on the
 * platform-admin side.
 */

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  Plus,
  Trash2,
  Save,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bioApi } from "@/lib/api";
import type { BioPage, BioLink } from "@/types";

type Theme = "default" | "dark" | "minimal";

export default function BioPageManager() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["bio-page"],
    queryFn: () => bioApi.getMine(),
    retry: (count, err: unknown) => {
      // 404 with code NO_PAGE is the "no page yet" state — don't retry.
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("NO_PAGE")) return false;
      return count < 1;
    },
  });

  const page: BioPage | undefined = data?.data;
  const noPageYet = (error instanceof Error && error.message.includes("NO_PAGE")) || (!isLoading && !page);

  if (isLoading) {
    return (
      <div className="p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const publicURL =
    typeof window !== "undefined" && page
      ? `${window.location.origin}/bio/${page.slug}`
      : page
      ? `/bio/${page.slug}`
      : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Link2 className="h-6 w-6 text-violet-600" />
            Link in Bio
          </h1>
          <p className="text-sm text-muted-foreground">
            One public page that aggregates everything you want to point your audience to.
          </p>
        </div>
        {page && (
          <Button asChild variant="outline" size="sm">
            <a href={publicURL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View public
            </a>
          </Button>
        )}
      </div>

      {page?.is_disabled && (
        <Card className="border-red-300 bg-red-50 p-4 dark:border-red-700/50 dark:bg-red-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-400" />
            <div className="text-sm">
              <p className="font-medium text-red-700 dark:text-red-400">Page disabled by platform admin</p>
              {page.disabled_reason && (
                <p className="mt-1 text-red-700/80 dark:text-red-400/80">{page.disabled_reason}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Page settings */}
      <PageSettings
        existing={page}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["bio-page"] })}
        noPageYet={noPageYet}
      />

      {page && (
        <>
          <PublicURLBar url={publicURL} />
          <LinksList
            page={page}
            onChanged={() => queryClient.invalidateQueries({ queryKey: ["bio-page"] })}
          />
        </>
      )}
    </div>
  );
}

// ── Page settings ─────────────────────────────────────────────────────────────

function PageSettings({
  existing,
  onSaved,
  noPageYet,
}: {
  existing: BioPage | undefined;
  onSaved: () => void;
  noPageYet: boolean;
}) {
  const [slug, setSlug] = React.useState(existing?.slug ?? "");
  const [title, setTitle] = React.useState(existing?.title ?? "");
  const [description, setDescription] = React.useState(existing?.description ?? "");
  const [avatarURL, setAvatarURL] = React.useState(existing?.avatar_url ?? "");
  const [theme, setTheme] = React.useState<Theme>((existing?.theme ?? "default") as Theme);

  // When the loaded page changes, reset the form (e.g., after invalidate).
  React.useEffect(() => {
    if (existing) {
      setSlug(existing.slug);
      setTitle(existing.title);
      setDescription(existing.description ?? "");
      setAvatarURL(existing.avatar_url ?? "");
      setTheme(existing.theme as Theme);
    }
  }, [existing?.id, existing?.slug, existing?.title, existing?.description, existing?.avatar_url, existing?.theme]);

  const mut = useMutation({
    mutationFn: (input: { slug: string; title: string; description?: string; avatar_url?: string; theme?: Theme }) =>
      bioApi.upsert(input),
    onSuccess: () => {
      toast.success(existing ? "Saved" : "Bio page created");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const canSave = slug.trim() !== "" && title.trim() !== "" && !mut.isPending;

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-base font-semibold">{noPageYet ? "Create your bio page" : "Page settings"}</h2>

      <div>
        <Label htmlFor="slug">Slug</Label>
        <div className="mt-1 flex items-center">
          <span className="rounded-l-md border border-r-0 border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            /bio/
          </span>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="your-brand"
            className="rounded-l-none"
            maxLength={30}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          3–30 chars, lowercase letters, numbers, and dashes only.
        </p>
      </div>

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Your brand or name" maxLength={120} className="mt-1" />
      </div>

      <div>
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short bio. Keep it punchy."
          maxLength={500}
          rows={2}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="avatar">Avatar URL</Label>
        <Input
          id="avatar"
          value={avatarURL}
          onChange={(e) => setAvatarURL(e.target.value)}
          placeholder="https://example.com/avatar.png"
          maxLength={2048}
          className="mt-1"
        />
      </div>

      <div>
        <Label>Theme</Label>
        <div className="mt-1 flex gap-2">
          {(["default", "dark", "minimal"] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                theme === t ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/20" : "border-border"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          onClick={() =>
            mut.mutate({
              slug: slug.trim(),
              title: title.trim(),
              description: description.trim() || undefined,
              avatar_url: avatarURL.trim() || undefined,
              theme,
            })
          }
          disabled={!canSave}
        >
          {mut.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          {existing ? "Save" : "Create page"}
        </Button>
      </div>
    </Card>
  );
}

// ── Public URL bar ────────────────────────────────────────────────────────────

function PublicURLBar({ url }: { url: string }) {
  return (
    <Card className="flex items-center gap-2 p-3">
      <span className="text-xs text-muted-foreground">Public URL:</span>
      <code className="flex-1 truncate text-xs">{url}</code>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 text-xs"
        onClick={() => {
          navigator.clipboard.writeText(url);
          toast.success("Copied");
        }}
      >
        <Copy className="h-3 w-3" />
        Copy
      </Button>
    </Card>
  );
}

// ── Links list ────────────────────────────────────────────────────────────────

function LinksList({ page, onChanged }: { page: BioPage; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const links = page.links ?? [];

  const addMut = useMutation({
    mutationFn: (input: { title: string; url: string; icon?: string }) => bioApi.addLink(input),
    onSuccess: () => {
      toast.success("Link added");
      onChanged();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Add failed";
      if (msg.includes("LINK_LIMIT_REACHED")) {
        toast.error("Link limit reached — remove one first");
      } else {
        toast.error(msg);
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BioLink> }) => bioApi.updateLink(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bio-page"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => bioApi.deleteLink(id),
    onSuccess: () => {
      toast.success("Link removed");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const [newTitle, setNewTitle] = React.useState("");
  const [newURL, setNewURL] = React.useState("");
  const [newIcon, setNewIcon] = React.useState("");

  function handleAdd() {
    if (!newTitle.trim() || !newURL.trim()) return;
    addMut.mutate({ title: newTitle.trim(), url: newURL.trim(), icon: newIcon.trim() || undefined });
    setNewTitle("");
    setNewURL("");
    setNewIcon("");
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-base font-semibold">Links ({links.length})</h2>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No links yet. Add your first one below.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li
              key={l.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${l.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {l.icon && <span className="text-base">{l.icon}</span>}
                  <p className="truncate text-sm font-medium">{l.title}</p>
                  {!l.is_active && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">{l.url}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {l.click_count.toLocaleString()} {l.click_count === 1 ? "click" : "clicks"}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => updateMut.mutate({ id: l.id, data: { is_active: !l.is_active } })}
                disabled={updateMut.isPending}
                aria-label={l.is_active ? "Hide link" : "Show link"}
              >
                {l.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => deleteMut.mutate(l.id)}
                disabled={deleteMut.isPending}
                aria-label="Delete link"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new */}
      <div className="space-y-2 border-t pt-4">
        <p className="text-xs font-medium text-muted-foreground">Add a link</p>
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Link title"
            className="flex-1"
            maxLength={200}
          />
          <Input
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="🔗"
            className="w-20"
            maxLength={4}
          />
        </div>
        <div className="flex gap-2">
          <Input value={newURL} onChange={(e) => setNewURL(e.target.value)} placeholder="https://" className="flex-1" maxLength={2048} />
          <Button onClick={handleAdd} disabled={addMut.isPending || !newTitle.trim() || !newURL.trim()}>
            {addMut.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
