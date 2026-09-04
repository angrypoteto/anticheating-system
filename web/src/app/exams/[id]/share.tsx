"use client";

import { useState } from "react";

/**
 * The finished-form moment: one link to hand to students.
 *
 * Copying is offered but never required — the link is always visible as text
 * and selectable, because the clipboard API is blocked in plenty of contexts
 * and a link you cannot read is useless.
 */
export function ShareLink({ url, live }: { url: string; live: boolean }) {
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
      className={`rounded-lg border p-6 ${
        live
          ? "border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/50"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
      }`}
    >
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
        {live ? "Send this to your students" : "Link to this exam"}
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {live
          ? "Anyone who opens this link and signs in can sit this exam — they do not need to be in the class."
          : "This link works as soon as you publish. Until then it tells students the exam is not open yet."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
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
