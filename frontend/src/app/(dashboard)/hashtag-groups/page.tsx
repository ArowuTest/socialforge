"use client";

/**
 * Hashtag Groups manager — workspace-wide saved hashtag bundles.
 *
 * Editors create named groups ("Marketing", "Launch", "Education") containing
 * 1-30 hashtags. The Compose page surfaces these via a picker so authors can
 * insert a whole bundle in one click instead of retyping #brand-name on every
 * post.
 */

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hash, Plus, Trash2, Edit3, Loader2, Save, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hashtagGroupsApi } from "@/lib/api";
import type { HashtagGroup } from "@/types";

export default function HashtagGroupsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<HashtagGroup | "new" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["hashtag-groups"],
    queryFn: () => hashtagGroupsApi.list(),
  });
  const groups = data?.data ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => hashtagGroupsApi.delete(id),
    onSuccess: () => {
      toast.success("Group deleted");
      queryClient.invalidateQueries({ queryKey: ["hashtag-groups"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Hash className="h-6 w-6 text-violet-600" />
            Hashtag Groups
          </h1>
          <p className="text-sm text-muted-foreground">
            Save reusable hashtag bundles and drop them into any post in one click.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Group
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center">
          <Hash className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No groups yet. Create your first one to start saving time on posts.
          </p>
          <Button className="mt-4" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create your first group
          </Button>
        </Card>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{g.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {g.hashtags.length} hashtag{g.hashtags.length === 1 ? "" : "s"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.hashtags.map((h) => (
                        <span
                          key={h}
                          className="rounded-md bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(g)} aria-label="Edit">
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete "${g.name}"?`)) deleteMut.mutate(g.id);
                      }}
                      disabled={deleteMut.isPending}
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditGroupDialog
          group={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["hashtag-groups"] });
          }}
        />
      )}
    </div>
  );
}

function EditGroupDialog({
  group,
  onClose,
  onSaved,
}: {
  group: HashtagGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = group !== null;
  const [name, setName] = React.useState(group?.name ?? "");
  const [hashtagsRaw, setHashtagsRaw] = React.useState(group?.hashtags?.join(" ") ?? "");
  const [tagInput, setTagInput] = React.useState("");

  // Parse hashtagsRaw into an array — accept space/comma/newline separators.
  // Always uppercased # prefix; light client-side validation (server is the
  // source of truth).
  const parsedTags = React.useMemo(() => {
    return hashtagsRaw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
  }, [hashtagsRaw]);

  function commitTagInput() {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    setHashtagsRaw((prev) => (prev ? `${prev} ${trimmed}` : trimmed));
    setTagInput("");
  }

  function removeTag(tag: string) {
    setHashtagsRaw(parsedTags.filter((t) => t !== tag).join(" "));
  }

  const mut = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), hashtags: parsedTags };
      return isEdit && group
        ? hashtagGroupsApi.update(group.id, body)
        : hashtagGroupsApi.create(body);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Group updated" : "Group created");
      onSaved();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(
        msg.includes("NAME_TAKEN") ? "A group with that name already exists" :
        msg.includes("GROUP_LIMIT_REACHED") ? "Group limit reached" :
        msg
      );
    },
  });

  const canSave = name.trim() !== "" && parsedTags.length > 0 && !mut.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit hashtag group" : "New hashtag group"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing"
              maxLength={50}
              className="mt-1"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="tag-input">Hashtags</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitTagInput();
                  }
                }}
                placeholder="Type a hashtag and press Enter"
              />
              <Button type="button" onClick={commitTagInput} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste or type — separators (space, comma, newline) all work.
            </p>

            {parsedTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {parsedTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => removeTag(t)}
                    className="group inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-xs text-violet-700 transition hover:bg-red-50 hover:text-red-700 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                  >
                    {t}
                    <XIcon className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {parsedTags.length} hashtag{parsedTags.length === 1 ? "" : "s"} (click a tag to remove)
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSave}>
            {mut.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
