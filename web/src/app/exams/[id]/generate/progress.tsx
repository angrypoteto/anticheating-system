"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatClock, project } from "@/lib/ai/eta";
import { MAX_PARALLEL } from "@/lib/ai/batches";

/**
 * How far a generation has actually got.
 *
 * A large order is several model calls, sent together, and a server action
 * cannot stream — so the action records each one as it lands and this polls for
 * it.
 *
 * Within a request the bar does move on a clock, because a bar that only jumps
 * when a batch arrives spends twenty seconds looking frozen. What it will not
 * do is run ahead of the truth: a segment can creep to 95% of its own width but
 * only completes when the request actually lands, so the bar can never claim
 * work that has not happened — which is what makes a progress bar untrustworthy.
 *
 * Before the first batch reports — the file is still being read — there is
 * genuinely nothing to measure, so it says so rather than showing 0%.
 */
export function GenerationProgress({ runId }: { runId: string }) {
  const [done, setDone] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  // When the last request landed, on the same clock as `seconds`. The countdown
  // is driven by how long the *current* request has been out, so this is what
  // makes it fall by a second every second instead of only moving when a batch
  // arrives.
  const [landedAt, setLandedAt] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let live = true;

    // Read by the poll below, which must not close over a stale second.
    const clock = { seconds: 0 };
    const tick = setInterval(() => {
      clock.seconds += 1;
      setSeconds(clock.seconds);
    }, 1000);

    let seen: number | null = null;
    const poll = async () => {
      const { data } = await supabase
        .from("generation_progress")
        .select("done, total")
        .eq("run_id", runId)
        .maybeSingle();
      if (!live || !data) return;
      if (seen !== data.done) {
        seen = data.done;
        setLandedAt(clock.seconds);
      }
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

  // Both clocks come from the ticker rather than a clock read during render:
  // the ticker starts with this panel, so they agree, and rendering stays pure.
  const atOnce = known ? Math.min(total!, MAX_PARALLEL) : 1;
  const run = known
    ? project({
        done: done!,
        total: total!,
        elapsedMs: seconds * 1000,
        sinceLastMs: (seconds - landedAt) * 1000,
        concurrency: atOnce,
      })
    : null;

  const pct = run ? Math.round(run.fraction * 100) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/60"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {known
            ? total! > 1
              ? // They are in the air together, so "request 2 of 4" would be a
                // fiction — there is no current one.
                `Writing questions — ${total} requests at once`
              : "Writing questions"
            : "Reading your lesson file…"}
        </span>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {run == null
            ? `${seconds}s`
            : run.remainingMs < 5_000
              ? "almost done"
              : `${formatClock(run.remainingMs)} left`}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        {pct == null ? (
          // Nothing to measure yet: a stripe that moves says "working" without
          // claiming a number it does not have.
          <div className="h-full w-1/3 animate-[progress-slide_1.4s_ease-in-out_infinite] rounded-full bg-teal-600 dark:bg-teal-500" />
        ) : (
          <div
            // Linear over the full tick, so the bar glides between updates
            // rather than stepping once a second.
            className="h-full rounded-full bg-teal-600 transition-[width] duration-1000 ease-linear dark:bg-teal-500"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        )}
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {known && total! > 1
          ? "Large orders go out as several requests at once and are merged. Leave this page open."
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
