import type { NextConfig } from "next";

/**
 * Headers every page is served with.
 *
 * Nothing here restricts scripts or styles — a full Content Security Policy
 * needs per-request nonces threaded through the app and is its own piece of
 * work. These are the ones that cost nothing and close something real:
 *
 *   - No framing. An exam page inside somebody else's invisible frame is how a
 *     click on "Submit" or "Void" gets stolen (clickjacking). frame-ancestors
 *     is the modern rule, X-Frame-Options the one older browsers read.
 *   - Forms post only here, and <base> cannot be moved, so an injected tag
 *     cannot quietly redirect a sign-in form or every relative link.
 *   - Share links carry their token in the path. Cross-site, only the origin is
 *     sent as the referrer, so the token does not leak to wherever a page links.
 *   - The browser features the product never uses are switched off. Screen
 *     capture and fullscreen stay on for this site: the exam needs both.
 *   - HTTPS only, remembered for two years.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(self), fullscreen=(self)",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
