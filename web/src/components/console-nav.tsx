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
 * It is navy, not a white panel with a tinted active row. A console is the
 * furniture around the work; giving it its own dark ground means the page it
 * frames reads as the page, and the active item can be a filled block rather
 * than a coloured word — position and fill are found faster than hue, from
 * across a desk and by somebody who cannot separate the hues at all.
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
  /** "Administrator" — omitted for an instructor, whose console needs no badge. */
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

  return (
    // Pinned on desktop so it stays put while the page scrolls; it scrolls
    // internally only if the nav itself outgrows the viewport.
    <aside className="flex w-full shrink-0 flex-col bg-navy-800 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:self-start lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-4 lg:pt-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldMark className="h-7 w-7 shrink-0" />
          <span className="truncate text-base font-semibold tracking-tight">Proctorly</span>
          {/* Shut, the bar still has to say where you are, or the only way to
              find out is to open the thing you just closed. */}
          {here ? (
            <span className="truncate text-sm text-navy-300 lg:hidden">
              <span aria-hidden> · </span>
              {here}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setOpenAt(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="console-rail"
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-navy-100 transition hover:bg-white/10 hover:text-white lg:hidden"
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

      {role ? (
        <span className="mx-5 mb-3 hidden self-start rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.06em] text-navy-100 uppercase lg:inline-flex">
          {role}
        </span>
      ) : null}

      <nav
        id="console-rail"
        className={`flex-1 flex-col pb-4 lg:flex ${open ? "flex" : "hidden"}`}
      >
        {groups.map((group) => (
          <div key={group.label} className="px-3 pt-3">
            <div className="px-3 pb-2 text-[11px] font-medium tracking-[0.08em] text-navy-300 uppercase">
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
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition lg:min-h-[38px] ${
                    active
                      ? "bg-navy-600 font-medium text-white"
                      : "text-[#C6D5EA] hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {l.label}
                  {l.tag ? (
                    <span className="rounded-full bg-amber-400/15 px-1.5 py-px text-[11px] font-medium tabular-nums text-amber-200">
                      {l.tag}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        className={`mt-auto border-t border-white/10 px-5 py-4 lg:block ${
          open ? "block" : "hidden"
        }`}
      >
        <p className="truncate text-sm text-[#DCE7F5]" title={email}>
          {name || email}
        </p>
        {name ? <p className="truncate text-xs text-navy-300">{email}</p> : null}
        {/* Only Sign out. There used to be an "Exit to app" beside it, meant
            to take an admin back to the student-facing root — but / redirects
            an admin straight to /admin, so it returned you to the page you
            were already on. A link that goes nowhere teaches people not to
            trust the ones that do. */}
        <div className="mt-2 text-xs">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-navy-300 underline underline-offset-4 transition hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
