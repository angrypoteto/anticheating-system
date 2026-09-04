import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./form";
import { classesEnabled } from "@/lib/settings";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Already signed in? No reason to be here.
  const profile = await getCurrentUser();
  if (profile) redirect("/");

  const useClasses = await classesEnabled();

  return (
    <AuthShell
      title="Create your student account"
      subtitle={
        useClasses
          ? "You'll need the class code from your instructor."
          : "Sign up and your exams will appear as your teachers publish them."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm useClasses={useClasses} next={next} />
    </AuthShell>
  );
}
