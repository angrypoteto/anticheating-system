import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./form";
import { classesEnabled, classSelfJoinAllowed } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { classLabel } from "@/lib/classes";
import { AuthDivider, GoogleButton } from "@/components/google-button";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Already signed in? No reason to be here.
  const profile = await getCurrentUser();
  if (profile) redirect("/");

  const [classesOn, selfJoin] = await Promise.all([
    classesEnabled(),
    classSelfJoinAllowed(),
  ]);
  // A section is only asked for when classes exist *and* students are the ones
  // who join them. Otherwise they register now and an admin enrols them.
  const askForSection = classesOn && selfJoin;

  // Nobody is signed in yet, so the list cannot come from selectable_sections()
  // — that answers about a caller. Read it directly, and only when it is going
  // to be offered, so a school that assigns classes itself publishes nothing.
  const { data: rows } = askForSection
    ? await createAdminClient()
        .from("sections")
        .select("id, subject, name, users!sections_instructor_id_fkey(full_name)")
        .order("subject")
        .order("name")
    : { data: [] };

  type Row = {
    id: string;
    subject: string | null;
    name: string;
    users: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  const sections = ((rows ?? []) as Row[]).map((s) => {
    const teacher = Array.isArray(s.users) ? s.users[0] : s.users;
    return { id: s.id, label: classLabel(s), instructor: teacher?.full_name ?? null };
  });

  return (
    <AuthShell
      title="Create your student account"
      subtitle={
        sections.length
          ? "Pick your section as you go, and its exams will be waiting."
          : "Sign up and your exams will appear once your teacher adds you."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-teal-700 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 dark:text-teal-400"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <GoogleButton next={next} label="Sign up with Google" intent="signup" />
        {sections.length ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            You will be asked for your section once you are in.
          </p>
        ) : null}
        <AuthDivider>or use your email</AuthDivider>
        <SignupForm sections={sections} next={next} />
      </div>
    </AuthShell>
  );
}
