"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldMark } from "@/components/auth-shell";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  "/teacher": "M3 10.5 10 3l7 7.5M5 9.5V17h10V9.5",
  "/teacher/exams/new": "M10 4v12M4 10h12",
  "/teacher/exams": "M4 5h12v11H4zM7 8.5h6M7 11.5h6M7 14.5h4",
  "/teacher/students": "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5",
  "/teacher/classes": "M3 7l7-4 7 4v2H3zM5 9v8h10V9M9 12h2",
  "/teacher/profile": "M10 10a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 10 10Zm-6.5 7c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5",
};

/**
 * The teacher's console, the same shape as the admin one but scoped to what a
 * teacher owns. Classes disappear from it when they are switched off, exactly
 * as they do everywhere else.
 */
const LINKS = (useClasses: boolean) =>
  [
    { href: "/teacher", label: "Overview", exact: true },
    { href: "/teacher/exams/new", label: "Generate exams" },
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
  const initial = ((name ?? email)?.[0] ?? "T").toUpperCase();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-[264px] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <ShieldMark className="h-8 w-8" />
        <span className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Proctorly
        </span>
        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Teacher
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Teach
        </p>
        {LINKS(useClasses).map((l) => {
          const active =
            "exact" in l && l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] transition ${
                active
                  ? "bg-indigo-600 font-semibold text-white shadow-[0_4px_12px_-4px_rgb(79_70_229/0.6)]"
                  : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              <span
                className={
                  active
                    ? "text-white"
                    : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                }
              >
                <Icon d={ICONS[l.href] ?? ICONS["/teacher"]} />
              </span>
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60 dark:bg-slate-800/60 dark:ring-slate-700/60">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[13px] font-semibold text-white">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100" title={email}>
              {name || email}
            </p>
            {name ? (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{email}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-2 px-1 text-xs">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
