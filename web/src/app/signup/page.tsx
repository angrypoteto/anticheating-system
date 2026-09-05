import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./form";
import { classesEnabled, classSelfJoinAllowed } from "@/lib/settings";
import { AuthDivider, GoogleButton } from "@/components/google-button";

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
  // A class code is only asked for when classes exist *and* students are the
  // ones who join them. Otherwise they register now and an admin enrols them.
  const askForCode = classesOn && selfJoin;

  return (
    <AuthShell
      title="Create your student account"
      subtitle={
        askForCode
          ? "You'll need the class code from your instructor."
          : "Sign up and your exams will appear once your teacher adds you."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-indigo-700 underline underline-offset-4 dark:text-indigo-400"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <GoogleButton next={next} label="Sign up with Google" />
        {askForCode ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You will be asked for your class code once you are in.
          </p>
        ) : null}
        <AuthDivider>or use your email</AuthDivider>
        <SignupForm useClasses={askForCode} next={next} />
      </div>
    </AuthShell>
  );
}
