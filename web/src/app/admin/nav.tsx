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
  "/admin": "M3 10.5 10 3l7 7.5M5 9.5V17h10V9.5",
  "/admin/exams/new": "M10 4v12M4 10h12",
  "/admin/exams": "M4 5h12v11H4zM7 8.5h6M7 11.5h6M7 14.5h4",
  "/admin/students": "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5",
  "/admin/accounts": "M3 6h14M3 10h14M3 14h9M16 15l2 2 3-3",
  "/admin/health": "M3 12h4l2-5 4 10 2-5h2",
  "/admin/keys": "M12 3l7 7-2 2-7-7zM9 8 3 14l3 3 6-6M14 14l-5 5",
  "/admin/settings": "M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM5 15l.8 1.6L7.5 17l-1.7.8L5 19.5l-.8-1.7L2.5 17l1.7-.4z",
  "/admin/profile": "M10 10a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 10 10Zm-6.5 7c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5",
};

const GROUPS: { label: string; match: string[] }[] = [
  { label: "Manage", match: ["/admin", "/admin/exams", "/admin/students", "/admin/accounts"] },
  { label: "System", match: ["/admin/health", "/admin/keys", "/admin/settings", "/admin/profile"] },
];

const LINKS = (useClasses: boolean) => [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/exams/new", label: "Generate exams" },
  { href: "/admin/exams", label: "Exams & quizzes", exact: true },
  { href: "/admin/students", label: "Students & risk" },
  { href: "/admin/accounts", label: useClasses ? "Accounts & classes" : "Accounts" },
  { href: "/admin/health", label: "System health" },
  { href: "/admin/keys", label: "AI provider keys" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/profile", label: "My profile" },
];

export function AdminNav({ email, useClasses }: { email: string; useClasses: boolean }) {
  const pathname = usePathname();
  const links = LINKS(useClasses);
  const initial = (email?.[0] ?? "A").toUpperCase();

  const renderLink = (l: { href: string; label: string; exact?: boolean }) => {
    const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
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
        <span className={active ? "text-white" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"}>
          <Icon d={ICONS[l.href] ?? ICONS["/admin"]} />
        </span>
        {l.label}
      </Link>
    );
  };

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-[264px] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <ShieldMark className="h-8 w-8" />
        <span className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Proctorly
        </span>
        <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300">
          Admin
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-5 px-3 pb-4">
        {GROUPS.map((g) => {
          const items = links.filter((l) =>
            g.match.some((m) => (l.href === "/admin" ? l.href === m : l.href.startsWith(m))),
          );
          // "Generate exams" lives under Manage too even though its href is nested
          const extra =
            g.label === "Manage"
              ? links.filter((l) => l.href === "/admin/exams/new")
              : [];
          const shown = [...new Map([...items, ...extra].map((l) => [l.href, l])).values()];
          if (!shown.length) return null;
          return (
            <div key={g.label}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {g.label}
              </p>
              <div className="space-y-0.5">{shown.map(renderLink)}</div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60 dark:bg-slate-800/60 dark:ring-slate-700/60">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[13px] font-semibold text-white">
            {initial}
          </span>
          <p className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={email}>
            {email}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-4 px-1 text-xs">
          <Link
            href="/"
            className="font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Exit to app
          </Link>
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
