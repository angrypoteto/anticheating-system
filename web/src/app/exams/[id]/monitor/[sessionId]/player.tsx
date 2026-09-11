"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { locateMoment } from "@/lib/screen-recorder";
import { voidFlag, type MonitorState } from "../actions";

export type ReviewSegment = {
  url: string;
  recordingId: string;
  /** Epoch ms on the database's clock, the same clock as the flags. */
  startMs: number;
  durationMs: number;
};

export type ReviewFlag = {
  id: string;
  what: string;
  atMs: number;
  /** Formatted on the server, so the page renders the same on both sides. */
  clock: string;
  strike: number;
  voided: boolean;
  question: string | null;
  /** What was seen, when a flag carries more than its type. */
  detail: string | null;
  /** False for evidence that never counts toward the limit (an extension). */
  warning: boolean;
};

/** Start a little before the flag: what led up to it is the evidence. */
const LEAD_MS = 5000;
const SPEEDS = [1, 2, 4];

/** "mm:ss", or "h:mm:ss" past the hour. */
function duration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Manila wall-clock time, done by hand. Intl output differs between the
 * server's ICU and the browser's, and this is rendered on both.
 */
function manila(ms: number) {
  const d = new Date(ms + 8 * 3600_000);
  const h24 = d.getUTCHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h24 < 12 ? "AM" : "PM"}`;
}

/**
 * A sitting's recording, played back as one video with its flags on it.
 *
 * The video arrives as thirty-second pieces, each a file of its own. They are
 * played one after another, and the timeline underneath is the sitting's, not
 * the piece's: a flag is placed where it happened, and pressing it loads the
 * piece that moment is in and seeks inside it.
 *
 * One browser quirk is handled here rather than worked around upstream.
 * MediaRecorder writes WebM without a duration, and Chrome will not seek inside
 * a file whose length it does not know. Asking for a point far past the end
 * makes it read to the end and learn the length, after which seeking works.
 */
export function RecordingReview({
  examId,
  segments,
  flags,
}: {
  examId: string;
  segments: ReviewSegment[];
  flags: ReviewFlag[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [nowMs, setNowMs] = useState(segments[0].startMs);
  // The flag last jumped to, so the list and the buttons can say which it is.
  const [focused, setFocused] = useState<string | null>(null);
  // Where to go once the piece now loading can be seeked, in seconds into it.
  const pendingSeek = useRef<number | null>(null);
  const wantPlay = useRef(false);
  const fixing = useRef(false);

  const first = segments[0].startMs;
  const last = segments[segments.length - 1];
  const end = last.startMs + last.durationMs;
  const span = Math.max(1, end - first);
  const pct = (ms: number) => `${((Math.min(Math.max(ms, first), end) - first) / span) * 100}%`;

  const segment = segments[index];

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, index]);

  /** Seek inside the loaded piece, teaching the browser its length first if need be. */
  function seekInside(video: HTMLVideoElement, seconds: number) {
    if (seconds < 0.25 || Number.isFinite(video.duration)) {
      video.currentTime = seconds;
      if (wantPlay.current) void video.play();
      return;
    }
    fixing.current = true;
    const learned = () => {
      if (!Number.isFinite(video.duration)) return;
      video.removeEventListener("durationchange", learned);
      fixing.current = false;
      video.currentTime = Math.min(seconds, video.duration);
      if (wantPlay.current) void video.play();
    };
    video.addEventListener("durationchange", learned);
    video.currentTime = 1e101;
  }

  /** Go to a moment in the sitting, loading whichever piece holds it. */
  function jumpTo(ms: number, play: boolean) {
    const { index: i, seconds } = locateMoment(segments, ms);
    const target = segments[i];

    wantPlay.current = play;
    setNowMs(target.startMs + seconds * 1000);
    const video = videoRef.current;
    if (i === index && video && video.readyState >= 1) {
      video.pause();
      seekInside(video, seconds);
    } else {
      pendingSeek.current = seconds;
      setIndex(i);
    }
  }

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      wantPlay.current = true;
      void video.play();
    } else {
      wantPlay.current = false;
      video.pause();
    }
  };

  const onTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    jumpTo(first + ratio * span, playing);
  };

  const shownFlags = flags.filter((f) => f.atMs >= first - LEAD_MS && f.atMs <= end);
  const inOrder = [...shownFlags].sort((a, b) => a.atMs - b.atMs);

  const watchFlag = (f: ReviewFlag) => {
    setFocused(f.id);
    jumpTo(f.atMs - LEAD_MS, true);
  };

  // Previous and Next are read from the playhead, so they work however you got
  // here — a flag, the timeline, or just watching. A jump lands five seconds
  // before its flag, so "next" is the first flag whose lead-in is still ahead,
  // and "previous" skips the one whose lead-in you are already in. Flags that
  // happened in the same moment are one stop, not several.
  const nextFlag = inOrder.find((f) => f.atMs - LEAD_MS > nowMs + 250);
  const prevFlag = [...inOrder].reverse().find((f) => f.atMs - LEAD_MS < nowMs - 1000);

  // The flag happening on screen right now, named over the video for a few
  // seconds so the moment it was caught cannot be missed.
  const happening = inOrder.find((f) => nowMs >= f.atMs - 300 && nowMs <= f.atMs + 3000);

  const stepButton =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[13px] font-medium text-gray-700 hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="relative bg-gray-950">
          {happening ? (
            <div
              role="status"
              className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-1.5 text-[13px] font-semibold text-gray-950 shadow-lg"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M10.6 3.9 2.9 17.4A1.6 1.6 0 0 0 4.3 19.8h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M12 8.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="17" r="1.15" fill="currentColor" />
              </svg>
              <span className="first-letter:uppercase">
                {happening.what}
                {happening.warning ? `, warning ${happening.strike}` : ""}
              </span>
            </div>
          ) : null}
          <video
            ref={videoRef}
            key={segment.url}
            src={segment.url}
            preload="auto"
            playsInline
            muted
            className="aspect-video w-full"
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              video.playbackRate = speed;
              const seconds = pendingSeek.current ?? 0;
              pendingSeek.current = null;
              seekInside(video, seconds);
            }}
            onTimeUpdate={(e) => {
              if (fixing.current) return;
              const t = Math.min(e.currentTarget.currentTime * 1000, segment.durationMs);
              setNowMs(segment.startMs + t);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              if (fixing.current) return;
              if (index < segments.length - 1) {
                wantPlay.current = true;
                pendingSeek.current = 0;
                setIndex(index + 1);
              } else {
                wantPlay.current = false;
                setPlaying(false);
              }
            }}
          />
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-700"
              >
                {playing ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                  </svg>
                )}
              </button>
              <span className="text-sm font-medium tabular-nums text-gray-900">
                {duration(nowMs - first)}
                <span className="font-normal text-gray-400"> / {duration(span)}</span>
              </span>
              <span className="text-[13px] tabular-nums text-gray-500">{manila(nowMs)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => prevFlag && watchFlag(prevFlag)}
                disabled={!prevFlag}
                className={stepButton}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="m14.5 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Previous flag
              </button>
              <button
                type="button"
                onClick={() => nextFlag && watchFlag(nextFlag)}
                disabled={!nextFlag}
                className={stepButton}
              >
                Next flag
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="m9.5 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                className="h-8 rounded-lg border border-gray-200 px-2.5 text-[13px] font-semibold tabular-nums text-gray-700 hover:border-gray-400"
                aria-label={`Playback speed ${speed} times`}
              >
                {speed}×
              </button>
            </div>
          </div>

          {/* The sitting, not the piece: recorded stretches in grey, flags where
              they happened, the playhead in ink. */}
          <div
            role="presentation"
            onClick={onTimelineClick}
            className="relative h-9 cursor-pointer overflow-hidden rounded-lg bg-gray-100"
          >
            {segments.map((s) => (
              <span
                key={s.url}
                aria-hidden
                className="absolute inset-y-0 bg-gray-300"
                style={{ left: pct(s.startMs), width: `${(s.durationMs / span) * 100}%` }}
              />
            ))}
            {shownFlags.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  watchFlag(f);
                }}
                title={`${f.what}, ${f.clock}`}
                aria-label={`Watch ${f.what} at ${f.clock}`}
                className="group absolute inset-y-0 w-4 -translate-x-1/2"
                style={{ left: pct(f.atMs) }}
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full group-hover:w-[5px] ${
                    focused === f.id ? "w-[5px]" : "w-[3px]"
                  } ${f.voided ? "bg-gray-400" : "bg-amber-500"}`}
                />
              </button>
            ))}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-gray-900"
              style={{ left: pct(nowMs) }}
            />
          </div>

          {inOrder.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[12.5px] font-medium text-gray-500">Jump to a flag</span>
              {inOrder.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => watchFlag(f)}
                  title={`${f.what}, ${f.clock}`}
                  aria-label={`Watch ${f.what} at ${duration(f.atMs - first)} into the recording`}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold tabular-nums ${
                    focused === f.id
                      ? "border-gray-900 bg-gray-900 text-white"
                      : f.voided
                        ? "border-gray-200 bg-white text-gray-400"
                        : "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500"
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                  </svg>
                  {duration(f.atMs - first)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-x-4.5 gap-y-1 text-[12.5px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-gray-300" />
              Recorded
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-[3px] rounded-full bg-amber-500" />
              Flag
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-[3px] rounded-full bg-gray-400" />
              Voided
            </span>
            <span>Grey gaps are stretches with no recording.</span>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-gray-900">Flags</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            Watch each one from five seconds before it happened, then void it if it
            was not cheating.
          </p>
        </div>
        {flags.length ? (
          <ul>
            {flags.map((f) => (
              <FlagItem
                key={f.id}
                examId={examId}
                flag={f}
                at={duration(f.atMs - first)}
                focused={focused === f.id}
                recorded={f.atMs >= first - LEAD_MS && f.atMs <= end}
                onWatch={() => watchFlag(f)}
              />
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-gray-500">No flags on this sitting.</p>
        )}
      </section>
    </div>
  );
}

function FlagItem({
  examId,
  flag,
  at,
  focused,
  recorded,
  onWatch,
}: {
  examId: string;
  flag: ReviewFlag;
  /** Where in the recording it happened, as the player's clock reads. */
  at: string;
  focused: boolean;
  recorded: boolean;
  onWatch: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<MonitorState, FormData>(voidFlag, {});
  const voided = flag.voided || Boolean(state.success);

  // The server has the new truth; ask for it rather than keep a local copy.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <li
      className={`border-b border-gray-100 px-5 py-3.5 last:border-b-0 ${
        focused ? "bg-gray-50 shadow-[inset_3px_0_0_0_#0E1116]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-sm font-medium first-letter:uppercase ${
              voided ? "text-gray-400 line-through" : "text-gray-900"
            }`}
          >
            {flag.what}
          </p>
          <p className="mt-0.5 text-[12.5px] tabular-nums text-gray-500">
            {flag.warning ? `Warning ${flag.strike}` : "Not counted as a warning"}, {flag.clock}
            {voided ? ", voided" : ""}
          </p>
          {flag.detail ? (
            <p className="mt-0.5 text-[12.5px] break-all text-gray-500">{flag.detail}</p>
          ) : null}
          {flag.question ? (
            <p className="mt-0.5 truncate text-[12.5px] text-gray-400">{flag.question}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          {recorded ? (
            <button
              type="button"
              onClick={onWatch}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 text-[13px] font-medium whitespace-nowrap text-white tabular-nums hover:bg-gray-700"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
              </svg>
              Watch at {at}
            </button>
          ) : (
            <span className="text-[12.5px] text-gray-400">Not recorded</span>
          )}
          {voided ? null : (
            <form action={action}>
              <input type="hidden" name="flagId" value={flag.id} />
              <input type="hidden" name="examId" value={examId} />
              <button
                type="submit"
                disabled={pending}
                className="text-[13px] text-gray-500 underline decoration-gray-300 underline-offset-[3px] hover:text-gray-900 hover:decoration-gray-900 disabled:opacity-50"
              >
                {pending ? "Voiding…" : "Void"}
              </button>
            </form>
          )}
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="mt-1.5 text-[12.5px] text-red-700">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
