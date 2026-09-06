import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isIncomplete, whatIsMissing } from "@/lib/onboarding";

export type Role = "STUDENT" | "INSTRUCTOR" | "ADMIN";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, role, status, full_name, username")
    .eq("id", user.id)
    .single();

  return profile;
}

export async function requireRole(...allowed: Role[]) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.status !== "ACTIVE") redirect("/login?error=disabled");
  if (!allowed.includes(profile.role as Role)) redirect("/");

  // Signing in with Google supplies an email address and nothing else, so an
  // account could reach an exam with no name and no class — and the teacher's
  // monitor then showed a column of gmail addresses. Every protected page comes
  // through here, so this is the one place that can insist.
  const missing = await whatIsMissing(profile);
  if (isIncomplete(missing)) {
    // A student following an exam link must land on the paper afterwards, not
    // on a dashboard. Server components cannot see their own URL, so the proxy
    // passes it along.
    const here = (await headers()).get("x-pathname") ?? "/";
    redirect(`/welcome?next=${encodeURIComponent(here)}`);
  }

  return profile;
}
