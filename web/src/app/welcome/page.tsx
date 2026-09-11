import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isIncomplete, whatIsMissing } from "@/lib/onboarding";
import { AuthShell } from "@/components/auth-shell";
import { classLabel } from "@/lib/classes";
import { WelcomeForm } from "./form";
import { safeNext } from "@/lib/safe-next";

/** What selectable_sections() returns, before it is given a label. */
type PickableRow = {
  id: string;
  subject: string | null;
  name: string;
  instructor: string | null;
};

/**
 * The last step of signing up, for accounts that arrived without one.
 *
 * Google gives us an email address and nothing else that we asked for, so an
 * account could reach an exam with no name and no class — and the teacher's
 * monitor showed gmail addresses instead of students. requireRole() sends
 * anyone still owing either of those here, and deliberately is not called *by*
 * this page: that is what would make it a loop.
 */
export const metadata: Metadata = { title: "Finish setting up" };

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
  const safe = safeNext(candidate);
  const next = safe.startsWith("/welcome") ? "/" : safe;

  const missing = await whatIsMissing(profile);
  if (!isIncomplete(missing)) redirect(next);

  const supabase = await createClient();

  // What an admin has entered, minus anything this student is already on.
  const { data: rows } = missing.className
    ? await supabase.rpc("selectable_sections")
    : { data: [] };
  const sections = ((rows ?? []) as PickableRow[]).map((s) => ({
    id: s.id,
    label: classLabel(s),
    instructor: s.instructor,
  }));

  // whatIsMissing() only asks for a section when there is one to pick, so this
  // is the narrow race where the last one was deleted in between. Say so rather
  // than redirecting: the gate would only send them straight back.
  const askSection = missing.className && sections.length > 0;
  const nothingToPick = missing.className && sections.length === 0;

  // Google sends a display name along with the account; it is the obvious
  // opening bid for "what is your name", so offer it rather than a blank box.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const suggestedName = (meta.full_name ?? meta.name ?? "").trim();

  const both = missing.name && askSection;

  return (
    <AuthShell
      title={both ? "Two things before you start" : "One thing before you start"}
      subtitle={
        both
          ? "Your teacher needs to know who you are and which section you are in."
          : missing.name
            ? "Your teacher needs to know whose paper is whose."
            : "Pick your section and its exams will appear."
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
              className="font-medium text-teal-700 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 dark:text-teal-400"
            >
              Not you?
            </button>
          </form>
        </>
      }
    >
      {nothingToPick && !missing.name ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Your school has not set up any sections yet. Ask your teacher to add
          you, and your exams will appear here once they have.
        </p>
      ) : (
        <WelcomeForm
          askName={missing.name}
          askSection={askSection}
          sections={sections}
          suggestedName={suggestedName}
          next={next}
        />
      )}
    </AuthShell>
  );
}
