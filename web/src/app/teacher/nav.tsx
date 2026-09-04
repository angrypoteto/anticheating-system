"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldMark } from "@/components/auth-shell";

/**
 * The teacher's console, the same shape as the admin one but scoped to what a
 * teacher owns. Classes disappear from it when they are switched off, exactly
 * as they do everywhere else.
 */
const LINKS = (useClasses: boolean) =>
  [
    { href: "/teacher", label: "Overview", exact: true },
    { href: "/teacher/exams/new", label: "Generate exams & quizzes" },
    { href: "/teacher/exams", label: "Exams & quizzes", exact: true },
    { href: "/teacher/students", label: "Students & risk" },
    ...(useClasses ? [{ href: "/teacher/classes", label: "My classes" }] : []),
    { href: "/teacher/profile", label: "My profile" },
  ] as const;

export function TeacherNav({
  email,
  name,
  useClasses,
}: {
  email: string;
  name: string | null;
  useClasses: boolean;
}) {
  const pathname = usePathname();

  return (
    // Pinned on desktop so it stays put while the page scrolls; it scrolls
    // internally only if the nav itself outgrows the viewport.
    <aside className="flex w-full shrink-0 flex-col border-b border-gray-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2.5 px-6 py-5">
        <ShieldMark className="h-7 w-7" />
        <span className="font-semibold text-gray-900 dark:text-gray-50">Proctorly</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
        {LINKS(useClasses).map((l) => {
          const active =
            "exact" in l && l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
        <p className="truncate text-sm text-gray-700 dark:text-gray-300" title={email}>
          {name || email}
        </p>
        {name ? (
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{email}</p>
        ) : null}
        <div className="mt-2 flex items-center gap-3 text-xs">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
