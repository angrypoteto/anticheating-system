import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth-shell";

export const dynamic = "force-dynamic";

/**
 * The short link a teacher hands out — /e/<token>.
 *
 * Opening it is what grants a student access to that one exam, so the link
 * works for anyone it is sent to, not only people already in the class. The
 * grant is recorded per exam, never per class, so a link never quietly hands
 * over the rest of a teacher's papers.
 *
 * Signed out, we bounce through the login page and come straight back here,
 * because the grant has to attach to a person.
 */
export default async function ExamLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const here = `/e/${encodeURIComponent(token)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const { data: examId, error } = await supabase.rpc("open_exam_link", { token });

  if (error || !examId) {
    const notOpen = /not open/i.test(error?.message ?? "");
    return (
      <AuthShell
        title={notOpen ? "This exam isn't open" : "That link didn't work"}
        subtitle={
          notOpen
            ? "Your teacher hasn't published it yet, or it has been closed. The link will start working once they publish it."
            : "Check that you copied the whole link. If it still fails, ask your teacher for a new one."
        }
        footer={
          <Link
            href="/"
            className="font-medium text-indigo-700 underline underline-offset-4 dark:text-indigo-400"
          >
            Go to your dashboard
          </Link>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signed in as {user.email}.
        </p>
      </AuthShell>
    );
  }

  redirect(`/exam/${examId}`);
}
