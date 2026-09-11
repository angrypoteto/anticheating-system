import Link from "next/link";

export type Step = { label: string; note: string; done: boolean };

export type Slot = { label: string; says: string };

/**
 * What a console shows before anything has been made.
 *
 * The overview used to open on four zeroes, two empty charts and eight
 * destinations. Every figure was true and none of them was useful: nothing on
 * the page could be acted on until a class existed. Occam's razor — the screen
 * that can only say one thing should say one thing.
 *
 * The panels that cannot report anything yet say what they WILL hold rather
 * than showing a zero, on a dashed border, because "not yet" and "none" look
 * identical as a figure and mean opposite things.
 */
export function FirstRun({
  greeting,
  lede,
  action,
  steps,
  slots,
}: {
  greeting: string;
  lede: string;
  action: { href: string; label: string; title: string; detail: string };
  steps: Step[];
  slots: Slot[];
}) {
  return (
    <div>
      <header>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
          {greeting}
        </h1>
        <p className="mt-1.75 max-w-[62ch] text-sm text-gray-500">{lede}</p>
      </header>

      {/* One action, at the size of one action. */}
      <div className="mt-6.5 flex flex-wrap items-center justify-between gap-8 rounded-xl border-[1.5px] border-gray-900 bg-white px-8 py-7">
        <div className="min-w-0">
          <p className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
            {action.title}
          </p>
          <p className="mt-2.25 max-w-[56ch] text-[14.5px] leading-relaxed text-gray-700">
            {action.detail}
          </p>
        </div>
        <Link
          href={action.href}
          className="inline-flex h-[46px] shrink-0 items-center rounded-lg bg-gray-900 px-6 text-[15px] font-medium text-white hover:bg-gray-700"
        >
          {action.label}
        </Link>
      </div>

      {/* Goal-gradient: a bar that starts above empty is finished more often
          than one that starts at nothing, so the step already taken is shown. */}
      <ol className="mt-6.5 flex flex-col gap-2.5 sm:flex-row">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={`flex-1 rounded-xl border px-4.5 py-4 ${
              s.done ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"
            }`}
          >
            <p
              className={`flex items-center gap-2 text-[13px] font-medium ${
                s.done ? "text-green-700" : "text-gray-900"
              }`}
            >
              <span
                className={`flex h-4.75 w-4.75 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  s.done
                    ? "bg-green-700 text-white"
                    : "border-1.5 border-gray-200 text-gray-500"
                }`}
              >
                {s.done ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="m5 12.5 4.5 4.5L19 7.5"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              {s.label}
            </p>
            <p
              className={`mt-1.5 text-[12.5px] leading-relaxed ${
                s.done ? "text-green-800" : "text-gray-500"
              }`}
            >
              {s.note}
            </p>
          </li>
        ))}
      </ol>

      <h2 className="mt-8.5 mb-3 text-[15px] font-semibold text-gray-900">
        What will be here
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {slots.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-dashed border-gray-200 bg-white px-5.5 py-5"
          >
            <p className="text-[12.5px] font-medium text-gray-500">
              {s.label}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{s.says}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
