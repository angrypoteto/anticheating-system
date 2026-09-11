import Link from "next/link";
import { ShieldMark } from "@/components/auth-shell";

/**
 * The bar across the top of the screens a student sees around an exam — the
 * one that says it has not opened yet, and the one that says how it went.
 *
 * Just the mark, and it goes home. The account (who is signed in, and signing
 * out) lives on the dashboard a click away; repeating it here put a second
 * way out on the one screen a student should read to the end.
 */
export function StudentBar() {
  return (
    <div className="flex h-15 items-center border-b border-gray-200 bg-white px-6 sm:px-10">
      <Link
        href="/"
        className="flex items-center gap-2.25 text-[15.5px] font-bold tracking-tight text-gray-900"
      >
        <ShieldMark className="h-5 w-5" ground="light" />
        Proctorly
      </Link>
    </div>
  );
}
