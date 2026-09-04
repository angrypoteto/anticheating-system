import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./form";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      subtitle="Instructors and administrators are set up by an admin."
      footer={
        <>
          Are you a student with a class code?{" "}
          <Link
            href="/signup"
            className="font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
