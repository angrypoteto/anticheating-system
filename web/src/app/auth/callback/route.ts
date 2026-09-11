import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

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
  const next = safeNext(raw);

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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Someone who pressed "Sign up with Google" on an account that already
  // exists is told so, rather than quietly signed in. Google will not say
  // whether an account is new — signing in and signing up are one round trip —
  // so this asks how old the account is instead. Only one made in the last few
  // minutes is this registration; anything older was already here.
  //
  // Erring is cheap either way: an account misread as new lands on the welcome
  // step it would have reached anyway, and one misread as old is told to sign
  // in, where the same button signs them straight in.
  const born = Date.parse(data.user?.created_at ?? "");
  const isNew = Number.isFinite(born) && Date.now() - born < 5 * 60_000;

  if (searchParams.get("intent") === "signup" && !isNew) {
    // Not signed in: they asked to register, and they did not.
    await supabase.auth.signOut();
    const back = new URL(`${origin}/login`);
    back.searchParams.set("error", "already_registered");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
