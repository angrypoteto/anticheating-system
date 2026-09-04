import { headers } from "next/headers";

/**
 * The absolute base URL of this deployment, for links we hand to people.
 *
 * Taken from the request rather than an environment variable so it is right on
 * localhost, on a preview deployment and on the custom domain without anyone
 * remembering to set it. NEXT_PUBLIC_SITE_URL still wins when set, for the
 * cases where the public address differs from the host that served the request.
 */
export async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
