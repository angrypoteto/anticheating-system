"use client";

import { useState } from "react";

/**
 * Creating people, creating classes and handing out codes are separate jobs, so
 * they get separate tabs rather than one long scroll.
 */
export function Tabs({
  tabs,
}: {
  tabs: { id: string; label: string; count?: number; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Accounts and classes"
        className="flex gap-1 border-b border-gray-200 dark:border-gray-800"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => setActive(t.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
                on
                  ? "border-teal-600 font-medium text-teal-800 dark:border-teal-400 dark:text-teal-300"
                  : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {t.label}
              {t.count != null ? (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{t.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          hidden={t.id !== active}
          className="pt-6"
        >
          {t.id === active ? t.content : null}
        </div>
      ))}
    </div>
  );
}
