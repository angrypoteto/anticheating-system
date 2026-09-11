/**
 * Where to send somebody after signing in — if it is safe to.
 *
 * Sign-in, sign-up, the welcome step and the Google callback all carry a
 * `next` so a student who opened an exam link lands back on it. Taken as
 * given, that is an open redirect: a link to our own login page that ends on
 * somebody else's site, which is exactly what a phishing message wants.
 *
 * The rule was "one leading slash, not two", which stops `//evil.example` and
 * lets `/\evil.example` through — and browsers read a backslash there as a
 * slash, so that one left the site too. Now only a plain path on this site is
 * kept: a single leading slash, never followed by another slash or a
 * backslash, and no backslashes, whitespace or control characters anywhere.
 */
const UNSAFE = /[\\\s\u0000-\u001f\u007f]/;

export function safeNext(raw: unknown, fallback = "/"): string {
  const s = typeof raw === "string" ? raw : "";
  if (!s.startsWith("/") || s.startsWith("//")) return fallback;
  if (UNSAFE.test(s)) return fallback;
  return s;
}
