"use client";

/** Export and print controls for the student report. */
export function ReportActions() {
  return (
    <div className="flex gap-2 print:hidden">
      <a
        href="/admin/students/export"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Export CSV
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
      >
        Print
      </button>
    </div>
  );
}
