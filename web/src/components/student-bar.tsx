import { ShieldMark } from "@/components/auth-shell";

/**
 * The navy bar across the top of every screen a student sees outside the exam.
 *
 * It was written twice — once on the dashboard, once nowhere else, so the
 * screen at the end of an exam had no chrome at all and read as though the
 * student had been dropped out of the product at the worst possible moment.
 */
export function StudentBar({ email, name }: { email: string; name?: string | null }) {
  const initials =
    (name ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0]!.toUpperCase())
      .join("") || (email?.[0] ?? "?").toUpperCase();

  return (
    <div className="flex h-15 items-center justify-between bg-teal-800 px-6 text-white sm:px-10">
      <div className="flex items-center gap-2.5">
        <ShieldMark className="h-5.25 w-5.25" />
        <span className="font-semibold tracking-tight">Proctorly</span>
      </div>
      <div className="flex items-center gap-3.5 text-[13px] text-teal-100">
        <span className="hidden truncate sm:inline">{email}</span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-[13px] text-teal-100 underline underline-offset-4 transition hover:text-white"
          >
            Sign out
          </button>
        </form>
        <span
          aria-hidden
          className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white"
        >
          {initials}
        </span>
      </div>
    </div>
  );
}
