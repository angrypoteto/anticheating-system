"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ShieldMark } from "@/components/auth-shell";

export type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
  tag?: string;
  /**
   * Other paths this destination owns.
   *
   * Watching a sitting lives at /exams/<id>/monitor, outside the console's own
   * tree, so without this the rail went blank the moment a teacher opened the
   * thing the rail had just sent them to — and a rail with nothing lit reads as
   * "you have left", which they had not.
   */
  also?: string[];
};
export type NavGroup = { label: string; links: NavLink[] };

/**
 * The console rail, shared by the admin and instructor consoles.
 *
 * Three things about it are deliberate.
 *
 * It is quiet. A console is the furniture around the work, so the rail is white
 * with one hairline between it and the page, and the active item is a filled
 * block rather than a coloured word — position and fill are found faster than
 * hue, from across a desk and by somebody who cannot separate the hues at all.
 *
 * It is grouped. Nine flat destinations is past the point where a list is
 * read rather than scanned, so they arrive in threes under a heading: the eye
 * picks a group, then a link. Groups a role has no business in are not shown
 * greyed — they are not shown, because a destination you may not use is a
 * decision you should not have to make.
 *
 * And on a phone it is shut. The rail was full-width and fully expanded below
 * the large breakpoint, so every console page opened on eleven navy links and
 * the work began somewhere below the fold — the navigation was the page. Shut,
 * it is one bar that says where you are; open, it is the same rail.
 */
export function ConsoleNav({
  groups,
  role,
  name,
  email,
}: {
  groups: NavGroup[];
  /** "Administrator", "Instructor", "Student" — shown under the name. */
  role?: string;
  name?: string | null;
  email: string;
}) {
  const pathname = usePathname();
  /**
   * Which page the menu was opened on, rather than whether it is open.
   *
   * Navigating has to shut it — leaving it hanging over the page you just
   * asked for is the classic phone-menu bug. Storing the page instead of a
   * flag makes that fall out of the comparison: go somewhere and the stored
   * path no longer matches, so it is shut, with nothing to remember to do.
   */
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  const isActive = (l: NavLink) =>
    (l.exact ? pathname === l.href : pathname.startsWith(l.href)) ||
    (l.also ?? []).some((p) => pathname.startsWith(p));

  const here = groups.flatMap((g) => g.links).find(isActive)?.label;
  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    // Pinned on desktop so it stays put while the page scrolls; it scrolls
    // internally only if the nav itself outgrows the viewport.
    <aside className="relative z-10 flex w-full shrink-0 flex-col border-b border-gray-200 bg-white text-gray-900 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3 px-6 py-3.5 lg:pt-5.5 lg:pb-2">
        <div className="flex min-w-0 items-center gap-2.25">
          <ShieldMark className="h-5 w-5 shrink-0" ground="light" />
          <span className="truncate text-[15.5px] font-bold tracking-tight">Proctorly</span>
          {/* Shut, the bar still has to say where you are, or the only way to
              find out is to open the thing you just closed. */}
          {here ? (
            <span className="truncate border-l border-gray-200 pl-2.5 text-sm text-gray-500 lg:hidden">
              {here}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setOpenAt(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="console-rail"
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
        >
          <span className="sr-only">{open ? "Close the menu" : "Open the menu"}</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            {open ? (
              <path
                d="m6.5 6.5 11 11m0-11-11 11"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      <nav
        id="console-rail"
        className={`flex-1 flex-col gap-5.5 px-3.5 pt-4 pb-4 lg:flex lg:pt-6 ${open ? "flex" : "hidden"}`}
      >
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1.5 text-[12.5px] font-medium text-gray-400">
              {group.label}
            </div>
            {group.links.map((l) => {
              const active = isActive(l);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  // 44px on a phone: the floor for something a thumb has to hit.
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-[7px] px-2.5 text-sm lg:min-h-[34px] ${
                    active
                      ? "bg-gray-100 font-semibold text-gray-900"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {l.label}
                  {l.tag ? (
                    <span className="text-xs font-semibold tabular-nums text-amber-800">
                      {l.tag}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <details
        className={`group relative mt-auto border-t border-gray-100 lg:block ${
          open ? "block" : "hidden"
        }`}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-6 py-3.5 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-900"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-gray-900" title={email}>
              {name || email}
            </p>
            {/* The role used to be a badge at the top of the rail; it reads
                better as the second line of who is signed in. */}
            <p className="truncate text-[12.5px] text-gray-400">{role ?? (name ? email : "")}</p>
          </div>
          <svg
            className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        {/* Only Sign out. There used to be an "Exit to app" beside it, meant
            to take an admin back to the student-facing root — but / redirects
            an admin straight to /admin, so it returned you to the page you
            were already on. A link that goes nowhere teaches people not to
            trust the ones that do. */}
        <div className="absolute right-3 bottom-full left-3 z-20 mb-2 text-[13px]">
          <div className="rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_24px_-12px_rgba(14,17,22,0.25)]">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </details>
    </aside>
  );
}
