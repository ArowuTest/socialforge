"use client";

/**
 * Public bio page. Renders the link list for /bio/[slug] — no auth required.
 *
 * Click tracking: each link is wrapped so clicking it (a) fires the
 * track-click endpoint async, (b) follows the URL. We don't wait for the
 * tracking response — opening in the same tab is what users expect.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { bioApi } from "@/lib/api";
import type { BioPagePublic, BioLink } from "@/types";

export default function PublicBioPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-bio", slug],
    queryFn: () => bioApi.getPublic(slug),
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="mx-auto max-w-md px-6 py-16">
          <div className="h-24 w-24 mx-auto animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 mx-auto h-6 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    notFound();
  }

  const page: BioPagePublic = data.data;

  const theme = page.theme;
  const containerCls =
    theme === "dark"
      ? "min-h-screen bg-slate-950 text-white"
      : theme === "minimal"
      ? "min-h-screen bg-white text-slate-900"
      : "min-h-screen bg-gradient-to-b from-violet-50 via-white to-indigo-50 text-slate-900";

  return (
    <div className={containerCls}>
      <div className="mx-auto max-w-md px-6 py-12">
        {page.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.avatar_url}
            alt=""
            className="mx-auto h-24 w-24 rounded-full border-4 border-white object-cover shadow-lg dark:border-slate-900"
          />
        )}
        <h1 className="mt-4 text-center text-2xl font-bold">{page.title}</h1>
        {page.description && (
          <p className={`mt-2 text-center text-sm ${theme === "dark" ? "text-slate-300" : "text-slate-600"}`}>
            {page.description}
          </p>
        )}

        <ul className="mt-8 space-y-3">
          {page.links.map((link) => (
            <LinkButton key={link.id} link={link} slug={page.slug} theme={theme} />
          ))}
        </ul>

        <p className="mt-12 text-center text-xs text-slate-400">
          Powered by ChiselPost
        </p>
      </div>
    </div>
  );
}

function LinkButton({
  link,
  slug,
  theme,
}: {
  link: BioLink;
  slug: string;
  theme: BioPagePublic["theme"];
}) {
  function handleClick(e: React.MouseEvent) {
    // Fire-and-forget tracking call — don't await; we want the navigation
    // to feel instant. Errors are silently swallowed because click-tracking
    // failure shouldn't break the user's flow.
    e.preventDefault();
    void bioApi.trackClick(slug, link.id).catch(() => {});
    // Navigate after a tick so the tracking POST is in-flight.
    setTimeout(() => {
      window.location.href = link.url;
    }, 50);
  }

  const buttonCls =
    theme === "dark"
      ? "block w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-center text-base font-medium text-white shadow-md transition hover:bg-slate-800 hover:scale-[1.01]"
      : theme === "minimal"
      ? "block w-full rounded-md border border-slate-300 bg-white px-5 py-4 text-center text-base font-medium text-slate-900 transition hover:bg-slate-50"
      : "block w-full rounded-xl border border-slate-200 bg-white px-5 py-4 text-center text-base font-medium text-slate-900 shadow-md transition hover:bg-slate-50 hover:scale-[1.01]";

  return (
    <li>
      <a href={link.url} onClick={handleClick} className={buttonCls}>
        {link.icon && <span className="mr-2">{link.icon}</span>}
        {link.title}
      </a>
    </li>
  );
}
