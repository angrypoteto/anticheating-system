import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./form";
import { classesEnabled, selfSignupAllowed } from "@/lib/settings";
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

  const [useClasses, selfSignup] = await Promise.all([
    classesEnabled(),
    selfSignupAllowed(),
  ]);

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
      {selfSignup ? (
        <div className="space-y-4">
          <GoogleButton next={next} label="Sign up with Google" />
          {useClasses ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You will be asked for your class code once you are in.
            </p>
          ) : null}
          <AuthDivider>or use your email</AuthDivider>
          <SignupForm useClasses={useClasses} next={next} />
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Registration is closed. Ask your teacher or an administrator to create
          your account.
        </p>
      )}
    </AuthShell>
  );
}
