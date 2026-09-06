import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isIncomplete, whatIsMissing } from "@/lib/onboarding";
import { AuthShell } from "@/components/auth-shell";
import { WelcomeForm } from "./form";

/**
 * The last step of signing up, for accounts that arrived without one.
 *
 * Google gives us an email address and nothing else that we asked for, so an
 * account could reach an exam with no name and no class — and the teacher's
 * monitor showed gmail addresses instead of students. requireRole() sends
 * anyone still owing either of those here, and deliberately is not called *by*
 * this page: that is what would make it a loop.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.status !== "ACTIVE") redirect("/login?error=disabled");

  const { next: rawNext } = await searchParams;
  // Only ever a path on this site, and never back to here.
  const candidate = rawNext ?? "/";
  const next =
    /^\/(?!\/)/.test(candidate) && !candidate.startsWith("/welcome") ? candidate : "/";

  const missing = await whatIsMissing(profile);
  if (!isIncomplete(missing)) redirect(next);

  // Google sends a display name along with the account; it is the obvious
  // opening bid for "what is your name", so offer it rather than a blank box.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const suggestedName = (meta.full_name ?? meta.name ?? "").trim();

  const both = missing.name && missing.className;

  return (
    <AuthShell
      title={both ? "Two things before you start" : "One thing before you start"}
      subtitle={
        both
          ? "Your teacher needs to know who you are and which class you are in."
          : missing.name
            ? "Your teacher needs to know whose paper is whose."
            : "Join your class and its exams will appear."
      }
      footer={
        <>
          Signed in as{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {profile.email}
          </span>
          .{" "}
          {/* Signing out is a POST, so this cannot be a link. */}
          <form action="/auth/signout" method="post" className="inline">
            <button
              type="submit"
              className="font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
            >
              Not you?
            </button>
          </form>
        </>
      }
    >
      <WelcomeForm
        askName={missing.name}
        askCode={missing.className}
        suggestedName={suggestedName}
        next={next}
      />
    </AuthShell>
  );
}
