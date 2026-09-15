import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth-shell";
import { describeLinkedExam, examForLink } from "@/lib/exam-link";
import { siteUrl } from "@/lib/site-url";

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
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const exam = await examForLink(token);
  if (!exam) return { title: "Opening your exam" };

  const description = `${describeLinkedExam(exam)}. Sign in to Proctorly to take it.`;
  return {
    // Absolute, so the preview image resolves on whichever domain served the link.
    metadataBase: new URL(await siteUrl()),
    title: exam.title,
    description,
    openGraph: { title: exam.title, description, siteName: "Proctorly", type: "website" },
    twitter: { card: "summary_large_image", title: exam.title, description },
  };
}

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

  // Signed out: say what the link is before asking them to sign in. It used to
  // bounce straight to the login page, which is also what a chat app fetching
  // the link for its preview saw — so every shared paper previewed as a bare
  // domain. A link to nothing still goes straight to sign in.
  if (!user) {
    const exam = await examForLink(token);
    if (!exam) redirect(`/login?next=${encodeURIComponent(here)}`);
    const next = encodeURIComponent(here);
    return (
      <AuthShell
        title={exam.title}
        subtitle={`${describeLinkedExam(exam)}. Sign in to start.`}
        footer={
          <>
            New here?{" "}
            <Link
              href={`/signup?next=${next}`}
              className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900"
            >
              Create an account
            </Link>
          </>
        }
      >
        <Link
          href={`/login?next=${next}`}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Sign in to start
        </Link>
      </AuthShell>
    );
  }

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
            className="font-medium text-teal-700 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 dark:text-teal-400"
          >
            Go to your dashboard
          </Link>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Signed in as {user.email}.
        </p>
      </AuthShell>
    );
  }

  redirect(`/exam/${examId}`);
}
