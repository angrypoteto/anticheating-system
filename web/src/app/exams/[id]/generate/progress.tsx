"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * How far a generation has actually got.
 *
 * A large order is several model calls in sequence and a server action cannot
 * stream, so the action records each batch as it lands and this polls for it.
 * The alternative was a bar advancing on a timer: one that reaches 90% and sits
 * there teaches a teacher to distrust the next one, which is worse than the
 * button that just said "this can take a moment".
 *
 * Before the first batch reports — the file is still being read — there is
 * genuinely nothing to measure, so it says so rather than showing 0%.
 */
export function GenerationProgress({ runId }: { runId: string }) {
  const [done, setDone] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let live = true;

    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);

    const poll = async () => {
      const { data } = await supabase
        .from("generation_progress")
        .select("done, total")
        .eq("run_id", runId)
        .maybeSingle();
      if (!live || !data) return;
      setDone(data.done);
      setTotal(data.total);
    };

    poll();
    const every = setInterval(poll, 900);

    return () => {
      live = false;
      clearInterval(tick);
      clearInterval(every);
    };
  }, [runId]);

  const known = total != null && total > 0 && done != null;
  // The last batch is only finished once the drafts come back, so a full bar
  // while still waiting would be a lie. Hold just short of it.
  const pct = known ? Math.min(97, Math.round((done! / total!) * 100)) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {known
            ? total! > 1
              ? `Writing questions — request ${Math.min(done! + 1, total!)} of ${total!}`
              : "Writing questions"
            : "Reading your lesson file…"}
        </span>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {seconds}s
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        {pct == null ? (
          // Nothing to measure yet: a stripe that moves says "working" without
          // claiming a number it does not have.
          <div className="h-full w-1/3 animate-[progress-slide_1.4s_ease-in-out_infinite] rounded-full bg-indigo-600 dark:bg-indigo-500" />
        ) : (
          <div
            className="h-full rounded-full bg-indigo-600 transition-[width] duration-500 dark:bg-indigo-500"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {known && total! > 1
          ? "Large orders are split into several requests and merged. Leave this page open."
          : "Leave this page open — the model is writing from your material."}
      </p>

      <style>{`
        @keyframes progress-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
