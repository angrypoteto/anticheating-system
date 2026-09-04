"use client";

import { useMemo, useState } from "react";
import { EnrollmentToggle, StatusToggle } from "../forms";

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
  "rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400";

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
}: {
  people: Person[];
  classes: ClassOption[];
  adminId: string | undefined;
  /** Classes are switched off system-wide, so do not offer them here either. */
  useClasses: boolean;
}) {
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

  const filtering =
    q.trim() !== "" ||
    role !== "ALL" ||
    status !== "ALL" ||
    (useClasses && classId !== "ALL");

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 p-6 dark:border-gray-800">
        <div className="min-w-56 flex-1">
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

        <div>
          <label htmlFor="filter-role" className="sr-only">
            Role
          </label>
          <select
            id="filter-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={control}
          >
            <option value="ALL">All roles</option>
            <option value="STUDENT">Students</option>
            <option value="INSTRUCTOR">Teachers</option>
            <option value="ADMIN">Admins</option>
          </select>
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
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="px-6 pt-4 text-sm text-gray-500 dark:text-gray-400">
        {shown.length} of {people.length} {people.length === 1 ? "account" : "accounts"}
      </p>

      {shown.length === 0 ? (
        <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
          Nobody matches that. Try a different search, or clear the filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Person</th>
                <th className="px-6 py-3 font-medium">Role</th>
                {useClasses ? <th className="px-6 py-3 font-medium">Classes</th> : null}
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 align-top last:border-0 dark:border-gray-800"
                >
                  <td className="px-6 py-3">
                    <span className="text-gray-900 dark:text-gray-100">
                      {p.full_name || p.email}
                    </span>
                    {p.full_name ? (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        {p.username ? `@${p.username}` : p.email}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-6 py-3 text-gray-600 dark:text-gray-400">
                    {p.role.toLowerCase()}
                  </td>
{useClasses ? (
                  <td className="px-6 py-3">
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
                  <td className="px-6 py-3">
                    <span
                      className={
                        p.status === "ACTIVE"
                          ? "text-green-700 dark:text-green-400"
                          : "text-gray-400 dark:text-gray-500"
                      }
                    >
                      {p.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {p.id === adminId ? (
                      <span className="text-xs text-gray-400 dark:text-gray-600">you</span>
                    ) : (
                      <StatusToggle userId={p.id} status={p.status} />
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
