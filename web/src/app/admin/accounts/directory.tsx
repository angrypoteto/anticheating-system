"use client";

import { useMemo, useState } from "react";
import { EnrollmentToggle, StatusToggle } from "../forms";
import { DeleteAccount } from "../delete-account";

export type ClassOption = { id: string; label: string };
export type Person = {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  role: string;
  status: string;
  classIds: string[];
};

const control =
  "h-9.5 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-teal-600 focus:ring-3 focus:ring-teal-600/12";

/**
 * Role is a chip row, not a dropdown.
 *
 * There are four choices and they never grow, so a select hid four options
 * behind a click for nothing. The count on each one is the point: it says what
 * the filter will cost you *before* you press it, which is the difference
 * between narrowing a list and guessing at it.
 */
const ROLES = [
  { id: "ALL", label: "All" },
  { id: "STUDENT", label: "Students" },
  { id: "INSTRUCTOR", label: "Instructors" },
  { id: "ADMIN", label: "Admins" },
] as const;

/** What a role is called to a person, rather than what the column is called. */
const ROLE_WORD: Record<string, string> = {
  ADMIN: "Administrator",
  INSTRUCTOR: "Instructor",
  STUDENT: "Student",
};

/**
 * The account list, filtered in the browser. Every account is already on the
 * page, so searching is instant and needs no round trip; if this ever grows
 * past a few hundred people it should move to a query instead.
 */
export function Directory({
  people,
  classes,
  adminId,
  useClasses,
  createForm,
}: {
  people: Person[];
  classes: ClassOption[];
  adminId: string | undefined;
  /** Classes are switched off system-wide, so do not offer them here either. */
  useClasses: boolean;
  /** Opens from the toolbar. Passed in because it is a server-rendered form. */
  createForm?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [classId, setClassId] = useState("ALL");

  const classLabel = useMemo(
    () => new Map(classes.map((c) => [c.id, c.label])),
    [classes],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byClass = useClasses ? classId : "ALL";
    return people.filter((p) => {
      if (role !== "ALL" && p.role !== role) return false;
      if (status !== "ALL" && p.status !== status) return false;
      if (byClass === "NONE" && p.classIds.length) return false;
      if (byClass !== "ALL" && byClass !== "NONE" && !p.classIds.includes(byClass)) {
        return false;
      }
      if (!needle) return true;
      return [p.full_name, p.username, p.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle));
    });
  }, [people, q, role, status, classId, useClasses]);

  // Counted before the role filter is applied — a chip that only counted the
  // rows already showing would read 0 for every role but the chosen one.
  const roleCounts = useMemo(() => {
    const m = new Map<string, number>([["ALL", 0]]);
    const needle = q.trim().toLowerCase();
    const byClass = useClasses ? classId : "ALL";
    for (const person of people) {
      if (status !== "ALL" && person.status !== status) continue;
      if (byClass === "NONE" && person.classIds.length) continue;
      if (byClass !== "ALL" && byClass !== "NONE" && !person.classIds.includes(byClass)) continue;
      if (
        needle &&
        ![person.full_name, person.username, person.email]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(needle))
      ) {
        continue;
      }
      m.set("ALL", (m.get("ALL") ?? 0) + 1);
      m.set(person.role, (m.get(person.role) ?? 0) + 1);
    }
    return m;
  }, [people, q, status, classId, useClasses]);

  const filtering =
    q.trim() !== "" ||
    role !== "ALL" ||
    status !== "ALL" ||
    (useClasses && classId !== "ALL");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5.5 py-4">
        <div className="min-w-65 flex-1">
          <label htmlFor="account-search" className="sr-only">
            Search by name, username or email
          </label>
          <input
            id="account-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, username or email…"
            className={`w-full ${control}`}
          />
        </div>

        <div role="group" aria-label="Role" className="flex flex-wrap items-center gap-1">
          {ROLES.map((r) => {
            const on = role === r.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => setRole(r.id)}
                className={`flex h-8.5 items-center gap-1.75 rounded-lg px-3.25 text-[13px] ${
                  on
                    ? "bg-teal-700 font-medium text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {r.label}
                <span className={`tabular-nums ${on ? "opacity-75" : "opacity-60"}`}>
                  {roleCounts.get(r.id) ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {useClasses ? (
          <div>
            <label htmlFor="filter-class" className="sr-only">
              Class
            </label>
            <select
              id="filter-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className={control}
            >
              <option value="ALL">All classes</option>
              <option value="NONE">No class yet</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="filter-status" className="sr-only">
            Status
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={control}
          >
            <option value="ALL">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>

        {filtering ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setRole("ALL");
              setStatus("ALL");
              setClassId("ALL");
            }}
            className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 hover:text-gray-900"
          >
            Clear
          </button>
        ) : null}

        {createForm ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-teal-700 px-3.75 text-[13.5px] font-medium text-white transition hover:bg-teal-800"
          >
            {adding ? (
              "Cancel"
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 5.5v13M5.5 12h13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Add an account
              </>
            )}
          </button>
        ) : null}
      </div>

      {adding && createForm ? (
        <div className="border-b border-gray-100 px-5.5 py-5">
          <p className="text-sm font-medium text-gray-900">Add an account</p>
          <p className="mt-1 mb-4 max-w-[64ch] text-[13px] text-gray-500">
            Confirmed immediately — share the temporary password directly with
            the person.
          </p>
          {createForm}
        </div>
      ) : null}

      <p aria-live="polite" className="px-5.5 pt-3.5 text-[13px] text-gray-500">
        {shown.length} of {people.length} {people.length === 1 ? "account" : "accounts"}
      </p>

      {shown.length === 0 ? (
        <p className="p-5.5 text-sm text-gray-500">
          Nobody matches that. Try a different search, or clear the filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 text-[12.5px] font-medium text-gray-400">
              <tr>
                <th className="w-[32%] px-5.5 py-3 font-medium">Person</th>
                <th className="px-5.5 py-3 font-medium">Role</th>
                {useClasses ? <th className="px-5.5 py-3 font-medium">Classes</th> : null}
                <th className="px-5.5 py-3 font-medium">Status</th>
                <th className="px-5.5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 align-middle last:border-0"
                >
                  <td className="px-5.5 py-3.5">
                    <span className="block font-medium text-gray-900">
                      {p.full_name || p.email}
                    </span>
                    {p.full_name ? (
                      <span className="mt-0.5 block text-[12.5px] text-gray-500">
                        {p.username ? `@${p.username}` : p.email}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5.5 py-3.5">
                    {/* A role is what somebody IS; a status is what their account is
                        doing. Different shapes, so a glance never confuses them. */}
                    <span
                      className={`inline-flex h-5.5 items-center rounded-lg border px-2 text-[12.5px] font-medium ${
                        p.role === "ADMIN"
                          ? "border-gray-900 bg-gray-900 text-white"
                          : p.role === "INSTRUCTOR"
                            ? "border-gray-200 bg-gray-100 text-gray-900"
                            : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      {ROLE_WORD[p.role] ?? p.role.toLowerCase()}
                    </span>
                  </td>
{useClasses ? (
                  <td className="px-5.5 py-3.5">
                    {p.role !== "STUDENT" ? (
                      <span className="text-gray-400 dark:text-gray-600">—</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-gray-600 dark:text-gray-400">
                          {p.classIds.length
                            ? p.classIds
                                .map((id) => classLabel.get(id) ?? "unknown class")
                                .join(", ")
                            : "No class yet"}
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {classes.length ? (
                            classes.map((c) => (
                              <EnrollmentToggle
                                key={c.id}
                                studentId={p.id}
                                sectionId={c.id}
                                enrolled={p.classIds.includes(c.id)}
                                label={c.label}
                              />
                            ))
                          ) : (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Create a class first.
                            </span>
                          )}
                        </div>
                      </details>
                    )}
                  </td>
                  ) : null}
                  <td className="px-5.5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[13px] ${
                        p.status === "ACTIVE" ? "text-green-700" : "text-gray-500"
                      }`}
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                      {p.status === "ACTIVE" ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5.5 py-3.5 text-right">
                    {p.id === adminId ? (
                      <span className="text-xs text-gray-500">you</span>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-3.5">
                        <StatusToggle userId={p.id} status={p.status} />
                        <DeleteAccount userId={p.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
