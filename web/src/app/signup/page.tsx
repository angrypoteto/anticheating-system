import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./form";

export default async function SignupPage() {
  // Already signed in? No reason to be here.
  const profile = await getCurrentUser();
  if (profile) redirect("/");

  return (
    <AuthShell
      title="Create your student account"
      subtitle="You'll need the class code from your instructor."
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
      <SignupForm />
    </AuthShell>
  );
}
