import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google sends people back to.
 *
 * Supabase hands over a one-time code; exchanging it here is what writes the
 * session cookie, because the cookie has to be set by the server. Then the
 * person continues wherever they were going — an exam link, usually.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Only ever a path on this site, so the round trip cannot be used to bounce
  // somebody somewhere else.
  const raw = searchParams.get("next") ?? "/";
  const next = /^\/(?!\/)/.test(raw) ? raw : "/";

  // Google can decline instead of sending a code — the user cancelled, or the
  // provider is not configured yet. Say so rather than showing a blank page.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(providerError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
