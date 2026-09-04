"use client";

/** Export and print controls for the student report. */
export function ReportActions() {
  return (
    <div className="flex gap-2 print:hidden">
      <a
        href="/admin/students/export"
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        Export CSV
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
      >
        Print
      </button>
    </div>
  );
}
