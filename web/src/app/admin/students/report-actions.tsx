"use client";

/** Export and print controls for the student report. */
export function ReportActions() {
  return (
    <div className="flex gap-2 print:hidden">
      <a
        href="/admin/students/export"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        Export CSV
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-[38px] items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700"
      >
        Print
      </button>
    </div>
  );
}
