import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./form";
import { AuthDivider, GoogleButton } from "@/components/google-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Arriving from an exam link: sign in, then carry on to the paper.
  const { next, error } = await searchParams;

  return (
    <AuthShell
      title="Sign in"
      subtitle={
        next
          ? "Sign in to open the exam you were sent."
          : "Instructors and administrators are set up by an admin."
      }
      footer={
        <>
          Are you a student with a class code?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="font-medium text-indigo-700 underline underline-offset-4 dark:text-indigo-400"
          >
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-200/70 bg-rose-50 px-3.5 py-2.5 text-sm leading-relaxed text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {error === "disabled"
              ? "That account is not active. If you have just registered, your address may be outside the addresses this school accepts — ask your teacher."
              : error === "missing_code"
                ? "Google did not complete the sign-in. Please try again."
                : error}
          </p>
        ) : null}

        <GoogleButton next={next} label="Sign in with Google" />
        <AuthDivider>or use your email</AuthDivider>
        <LoginForm next={next} />
      </div>
    </AuthShell>
  );
}
