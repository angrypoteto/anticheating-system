import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed the `middleware` convention to `proxy` — same behaviour,
// different file and export name.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // A server component cannot see the URL it is rendering for, and the
  // onboarding gate has to send people back where they were going. Rebuilt
  // rather than captured, because refreshing the token rewrites the cookies.
  const forwarded = () => {
    const h = new Headers(request.headers);
    h.set("x-pathname", path + request.nextUrl.search);
    return h;
  };

  let response = NextResponse.next({ request: { headers: forwarded() } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request: { headers: forwarded() } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token; must run before any redirect decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // "/" serves the public landing page to visitors and the dashboard once signed
  // in, so it is reachable either way; the page itself decides what to render.
  const isPublic =
    path === "/" || path === "/login" || path === "/signup" || path.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Remember where they were going — a student following an exam link should
    // land on the paper after signing in, not on a dashboard.
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
