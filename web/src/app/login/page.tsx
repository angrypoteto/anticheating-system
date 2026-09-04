import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Arriving from an exam link: sign in, then carry on to the paper.
  const { next } = await searchParams;

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
      <LoginForm next={next} />
    </AuthShell>
  );
}
