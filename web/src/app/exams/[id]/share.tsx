"use client";

import { useState } from "react";

/**
 * The finished-form moment: one link to hand to students.
 *
 * Copying is offered but never required — the link is always visible as text
 * and selectable, because the clipboard API is blocked in plenty of contexts
 * and a link you cannot read is useless.
 */
export function ShareLink({
  url,
  live,
  linkOnly,
}: {
  url: string;
  live: boolean;
  /** Classes are off, so this link is the only way anyone gets in. */
  linkOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (insecure context, permissions). The link is on
      // screen either way, so say what to do instead of failing silently.
      setCopied(false);
      alert("Copying was blocked. Select the link and copy it manually.");
    }
  }

  return (
    <section
      className={`rounded-xl border p-5 ${
        live
          ? "border-green-200 bg-green-50/60"
          : "border-gray-200 bg-white"
      }`}
    >
      <h2 className="text-[15px] font-semibold text-gray-900">
        {live ? "Send this to your students" : "The link for students"}
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {live
          ? linkOnly
            ? "This link is the only way in: a student who opens it and signs in can sit this exam, and nobody else sees it at all."
            : "Anyone who opens this link and signs in can sit this exam — they do not need to be in the class."
          : "It starts working once you publish. Until then, students who open it are told the exam is not open yet."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {copied ? "Link copied to the clipboard." : ""}
      </p>
    </section>
  );
}
