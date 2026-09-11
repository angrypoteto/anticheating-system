import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recording a student's screen for the length of a sitting.
 *
 * Three decisions shape all of it.
 *
 * It records in pieces. MediaRecorder is restarted every thirty seconds and each
 * piece is uploaded as soon as it closes, so a laptop that dies mid-paper loses
 * the half-minute it was in rather than the whole hour, and nothing large ever
 * has to survive in the browser's memory. Each piece is a complete file with its
 * own header, which is what lets the review page seek straight into the one a
 * flag falls in.
 *
 * It is anchored to the database's clock. A flag's time is the database's
 * now(); a student's laptop can be minutes out. So the recording is opened with
 * begin_screen_recording(), which stamps the start server-side, and every piece
 * is placed by its offset from that stamp on the browser's monotonic clock
 * (performance.now), which a wrong system clock cannot move. The anchor is taken
 * at the midpoint of that round trip, so the error is half the latency.
 *
 * It is cheap on purpose. An exam screen is mostly still text, so five frames a
 * second at a capped bitrate is plenty to read, and it keeps an hour's sitting
 * in the tens of megabytes rather than the hundreds.
 */

export const RECORDING_BUCKET = "screen-recordings";

const SEGMENT_MS = 30_000;
const FRAME_RATE = 5;
const BITS_PER_SECOND = 250_000;
const UPLOAD_ATTEMPTS = 4;

export type ShareProblem = "unsupported" | "denied" | "not-whole-screen" | "failed";

/** What a student is told when sharing does not work, in their terms. */
export function describeShareProblem(problem: ShareProblem): string {
  switch (problem) {
    case "unsupported":
      return "This browser cannot share your screen. Open the exam on a computer in Chrome, Edge or Firefox.";
    case "denied":
      return "Screen sharing was cancelled. The exam records your screen, so it cannot start without it.";
    case "not-whole-screen":
      return "Share your entire screen, not a single window or tab. Choose the screen option when your browser asks.";
    case "failed":
      return "Your screen could not be recorded. Check your connection and try again.";
  }
}

export function screenRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

/** The first format this browser can record, most compact first. */
function pickMimeType(): string | null {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

const baseType = (mime: string) => (mime.startsWith("video/mp4") ? "video/mp4" : "video/webm");
const extensionOf = (mime: string) => (mime.startsWith("video/mp4") ? "mp4" : "webm");

/**
 * A piece's place in the sitting lives in its name, so the review page can lay
 * the timeline out from one directory listing:
 *
 *   <recording id>_<sequence>_<offset ms from the recording's start>_<duration ms>.<ext>
 */
export function segmentName(
  recordingId: string,
  seq: number,
  offsetMs: number,
  durationMs: number,
  ext: string,
) {
  return `${recordingId}_${String(seq).padStart(5, "0")}_${offsetMs}_${durationMs}.${ext}`;
}

export type SegmentInfo = {
  recordingId: string;
  seq: number;
  offsetMs: number;
  durationMs: number;
};

export function parseSegmentName(name: string): SegmentInfo | null {
  const m = /^([0-9a-f-]{36})_(\d+)_(-?\d+)_(\d+)\.(webm|mp4)$/.exec(name);
  if (!m) return null;
  return {
    recordingId: m[1],
    seq: Number(m[2]),
    offsetMs: Number(m[3]),
    durationMs: Number(m[4]),
  };
}

/**
 * Which piece holds a moment of the sitting, and how far into it.
 *
 * A moment inside a piece is found in it. A moment in a gap — between two
 * recordings, or while nothing was uploaded — goes to the start of the next
 * piece, which is the first thing there is to see after it. Before the first
 * piece is its start; past the last is that piece's end.
 */
export function locateMoment(
  segments: { startMs: number; durationMs: number }[],
  ms: number,
): { index: number; seconds: number } {
  let index = segments.findIndex((s) => ms >= s.startMs && ms < s.startMs + s.durationMs);
  if (index === -1) index = segments.findIndex((s) => s.startMs > ms);
  if (index === -1) index = segments.length - 1;
  const s = segments[index];
  const into = Math.min(Math.max(ms - s.startMs, 0), s.durationMs);
  return { index, seconds: into / 1000 };
}

type RecorderOptions = {
  supabase: SupabaseClient;
  sessionId: string;
  /** The student ended the share from the browser's own controls. */
  onEnded: () => void;
  /** A piece could not be uploaded after every retry. */
  onUploadFailed?: () => void;
  /**
   * A teacher trying the paper in demo mode: ask for the screen exactly as a
   * student would be asked, but record nothing and upload nothing.
   */
  rehearsal?: boolean;
};

export class ScreenRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private pieceDone: Promise<void> = Promise.resolve();
  private uploads: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private recordingId: string | null = null;
  private mime = "video/webm";
  private anchor = 0;
  private seq = 0;
  private stopping = false;
  private readonly opts: RecorderOptions;

  // A plain field rather than a parameter property, so Node can load this file
  // as-is for the QA script (it strips types but will not rewrite code).
  constructor(opts: RecorderOptions) {
    this.opts = opts;
  }

  get sharing() {
    return Boolean(this.stream?.active);
  }

  /**
   * Ask for the screen and start recording it. Only ever from a click: the
   * browser will not show its picker otherwise.
   */
  async start(): Promise<{ ok: true } | { ok: false; problem: ShareProblem }> {
    if (!screenRecordingSupported()) return { ok: false, problem: "unsupported" };
    const mime = pickMimeType();
    if (!mime) return { ok: false, problem: "unsupported" };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          frameRate: { ideal: FRAME_RATE, max: FRAME_RATE },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: false,
        // Chromium hints, ignored elsewhere: offer whole screens, and do not let
        // the share be switched to something else once it has begun.
        monitorTypeSurfaces: "include",
        surfaceSwitching: "exclude",
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      return { ok: false, problem: name === "NotAllowedError" ? "denied" : "failed" };
    }

    const track = stream.getVideoTracks()[0];
    // A window or a tab would record the exam and nothing around it, which is
    // exactly the part nobody needs to see. Where the browser says what was
    // picked, anything but a whole screen is refused.
    const surface = track?.getSettings().displaySurface;
    if (!track || (surface && surface !== "monitor")) {
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, problem: "not-whole-screen" };
    }

    if (this.opts.rehearsal) {
      this.stream = stream;
      this.stopping = false;
      track.addEventListener("ended", () => {
        if (this.stopping) return;
        this.stream = null;
        this.opts.onEnded();
      });
      return { ok: true };
    }

    const sent = performance.now();
    const { data, error } = await this.opts.supabase.rpc("begin_screen_recording", {
      p_session_id: this.opts.sessionId,
      p_mime_type: mime,
    });
    const received = performance.now();
    const row = (Array.isArray(data) ? data[0] : data) as { id: string } | null;
    if (error || !row?.id) {
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, problem: "failed" };
    }

    this.stream = stream;
    this.mime = mime;
    this.recordingId = row.id;
    this.anchor = (sent + received) / 2;
    this.seq = 0;
    this.stopping = false;

    // "ended" fires only when the browser ends the track — the student pressing
    // its Stop sharing button — never for stop() below.
    track.addEventListener("ended", () => {
      if (this.stopping) return;
      void this.closePiece().then(() => {
        this.stream = null;
        this.opts.onEnded();
      });
    });

    this.startPiece();
    return { ok: true };
  }

  /**
   * Stop recording and wait for every piece to be uploaded. Called when the
   * paper is submitted; the caller decides how long it is prepared to wait.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    await this.closePiece();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.uploads;
  }

  private startPiece() {
    const stream = this.stream;
    if (!stream?.active || this.stopping) return;

    const rec = new MediaRecorder(stream, {
      mimeType: this.mime,
      videoBitsPerSecond: BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];
    const began = performance.now();
    const seq = this.seq++;

    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    this.pieceDone = new Promise<void>((resolve) => {
      rec.onstop = () => {
        const durationMs = Math.max(1, Math.round(performance.now() - began));
        if (chunks.length) {
          this.upload(
            seq,
            Math.round(began - this.anchor),
            durationMs,
            new Blob(chunks, { type: baseType(this.mime) }),
          );
        }
        resolve();
        if (this.recorder === rec) {
          this.recorder = null;
          this.startPiece();
        }
      };
    });

    this.recorder = rec;
    rec.start(1000);
    this.timer = setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, SEGMENT_MS);
  }

  /** End the piece being recorded, without starting another. */
  private async closePiece() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const rec = this.recorder;
    this.recorder = null;
    if (rec && rec.state !== "inactive") rec.stop();
    await this.pieceDone;
  }

  /** Uploads go one at a time, in order, each retried before it is given up on. */
  private upload(seq: number, offsetMs: number, durationMs: number, blob: Blob) {
    const recordingId = this.recordingId;
    if (!recordingId) return;
    const path = `${this.opts.sessionId}/${segmentName(
      recordingId,
      seq,
      offsetMs,
      durationMs,
      extensionOf(this.mime),
    )}`;
    const contentType = baseType(this.mime);

    this.uploads = this.uploads.then(async () => {
      for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
        const { error } = await this.opts.supabase.storage
          .from(RECORDING_BUCKET)
          .upload(path, blob, { contentType, upsert: false });
        if (!error) return;
        if (attempt < UPLOAD_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
      this.opts.onUploadFailed?.();
    });
  }
}
