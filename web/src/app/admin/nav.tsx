"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldMark } from "@/components/auth-shell";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/exams", label: "Exam builder" },
  { href: "/admin/students", label: "Students & risk" },
  { href: "/admin/accounts", label: "Accounts & classes" },
  { href: "/admin/health", label: "System health" },
  { href: "/admin/keys", label: "AI provider keys" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/profile", label: "My profile" },
];

export function AdminNav({ email }: { email: string }) {
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
        {LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
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
        <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={email}>
          {email}
        </p>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <Link
            href="/"
            className="text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Exit to app
          </Link>
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
