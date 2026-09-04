/**
 * Wall-clock date parts, with no Date arithmetic anywhere near them.
 *
 * The exam window is Philippine time. Turning "Sep 5, 8:00 AM" into a Date on
 * the client and back would apply the browser's own zone twice — once on the
 * way in and once on the way out — so these helpers move plain numbers around
 * and let the server apply +08:00 exactly once.
 */
export type Parts = { y: number; m: number; d: number; hh: number; mm: number };

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

export function parseParts(value: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const p = { y: +m[1], m: +m[2] - 1, d: +m[3], hh: +m[4], mm: +m[5] };
  if (p.m < 0 || p.m > 11 || p.hh > 23 || p.mm > 59) return null;
  if (p.d < 1 || p.d > daysInMonth(p.y, p.m)) return null;
  return p;
}

export const serialiseParts = (p: Parts) =>
  `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;

export function labelParts(p: Parts) {
  const h12 = p.hh % 12 === 0 ? 12 : p.hh % 12;
  return `${MONTHS[p.m].slice(0, 3)} ${p.d}, ${p.y} · ${h12}:${pad(p.mm)} ${p.hh < 12 ? "AM" : "PM"}`;
}

/** UTC arithmetic only, so the host's zone cannot shift a month boundary. */
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const firstDow = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).getUTCDay();

export function shiftMonth(view: { y: number; m: number }, by: number) {
  const m = view.m + by;
  return { y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
}

/** A day that does not exist in the target month snaps back to the last one. */
export function clampDay(p: Parts): Parts {
  return { ...p, d: Math.min(p.d, daysInMonth(p.y, p.m)) };
}

export function setHour12(p: Parts, h12: number, pm: boolean): Parts {
  return { ...p, hh: (h12 % 12) + (pm ? 12 : 0) };
}

/** Now, as Philippine wall-clock parts. */
export function nowInManila(now = new Date()): Parts {
  const [date, time] = now
    .toLocaleString("sv-SE", { timeZone: "Asia/Manila", hour12: false })
    .split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return { y, m: m - 1, d, hh, mm };
}

/** An ISO instant as the wall-clock parts a Philippine reader would see. */
export function isoToParts(iso: string | null): Parts | null {
  return iso ? nowInManila(new Date(iso)) : null;
}

export const isoToInput = (iso: string | null) => {
  const p = isoToParts(iso);
  return p ? serialiseParts(p) : "";
};
