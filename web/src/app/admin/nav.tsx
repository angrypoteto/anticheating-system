"use client";

import { ConsoleNav, type NavGroup } from "@/components/console-nav";

/**
 * Nine destinations, in three groups.
 *
 * Flat, they were a list to read; grouped, they are a place to look. The
 * headings say what a group is *for* — teaching, people, the machinery — so an
 * admin who wants the provider keys goes to System without reading the other
 * eight.
 */
const GROUPS = (useClasses: boolean): NavGroup[] => [
  {
    label: "Teaching",
    links: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/exams", label: "Exams & quizzes", exact: true },
      { href: "/admin/exams/new", label: "Generate exams" },
    ],
  },
  {
    label: "People",
    links: [
      { href: "/admin/students", label: "Students & risk" },
      { href: "/admin/accounts", label: useClasses ? "Accounts & classes" : "Accounts" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/admin/health", label: "Health" },
      { href: "/admin/keys", label: "AI provider keys" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
  {
    label: "Account",
    links: [{ href: "/admin/profile", label: "My profile" }],
  },
];

export function AdminNav({ email, useClasses }: { email: string; useClasses: boolean }) {
  return (
    <ConsoleNav
      groups={GROUPS(useClasses)}
      role="Administrator"
      email={email}
      exitHref="/"
    />
  );
}
