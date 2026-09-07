import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./form";
import { AuthDivider, GoogleButton } from "@/components/google-button";

export const metadata: Metadata = { title: "Sign in" };

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
            className="font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
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
            className={
              // Having an account already is not a fault, and red says it is.
              error === "already_registered"
                ? "rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200"
                : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            }
          >
            {error === "already_registered"
              ? "You already have an account with that Google address. Sign in below — the same button will do it."
              : error === "disabled"
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
