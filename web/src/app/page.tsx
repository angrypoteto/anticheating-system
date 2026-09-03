import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const role = profile.role as string;

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
              Anti-Cheating Exam System
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Signed in as {profile.email} · {role.toLowerCase()}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="mt-8 rounded-lg border border-dashed border-gray-300 p-8 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            Phase 1 complete — accounts, roles, and row-level security are live.
          </p>
          {role === "ADMIN" ? (
            <p className="mt-2">
              Manage accounts and sections in the{" "}
              <Link
                href="/admin"
                className="font-medium text-gray-900 underline underline-offset-4 dark:text-gray-100"
              >
                admin console
              </Link>
              .
            </p>
          ) : (
            <p className="mt-2">
              Next up:{" "}
              {role === "INSTRUCTOR"
                ? "the exam builder (Phase 2)."
                : "your assigned exams will appear here once an instructor publishes one."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
