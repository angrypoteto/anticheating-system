"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * Two things about it are deliberate.
 *
 * It is navy, not a white panel with a tinted active row. A console is the
 * furniture around the work; giving it its own dark ground means the page it
 * frames reads as the page, and the active item can be a filled block rather
 * than a coloured word — position and fill are found faster than hue, from
 * across a desk and by somebody who cannot separate the hues at all.
 *
 * And it is grouped. Nine flat destinations is past the point where a list is
 * read rather than scanned, so they arrive in threes under a heading: the eye
 * picks a group, then a link. Groups a role has no business in are not shown
 * greyed — they are not shown, because a destination you may not use is a
 * decision you should not have to make.
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

  return (
    // Pinned on desktop so it stays put while the page scrolls; it scrolls
    // internally only if the nav itself outgrows the viewport.
    <aside className="flex w-full shrink-0 flex-col bg-navy-800 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:self-start lg:overflow-y-auto">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <ShieldMark className="h-7 w-7" />
        <span className="text-base font-semibold tracking-tight">Proctorly</span>
      </div>

      {role ? (
        <span className="mx-5 mb-3 inline-flex self-start rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.06em] text-navy-100 uppercase">
          {role}
        </span>
      ) : null}

      <nav className="flex flex-1 flex-col pb-4">
        {groups.map((group) => (
          <div key={group.label} className="px-3 pt-3">
            <div className="px-3 pb-2 text-[11px] font-medium tracking-[0.08em] text-navy-300 uppercase">
              {group.label}
            </div>
            {group.links.map((l) => {
              const active =
                (l.exact ? pathname === l.href : pathname.startsWith(l.href)) ||
                (l.also ?? []).some((p) => pathname.startsWith(p));
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[38px] items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition ${
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

      <div className="mt-auto border-t border-white/10 px-5 py-4">
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
