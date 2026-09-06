"use client";

import { ConsoleNav, type NavGroup } from "@/components/console-nav";

/**
 * The teacher's console: the same rail as the admin one, minus the group that
 * is not theirs. There is no System heading here at all — not greyed out, not
 * present — because a destination a role may not use is a decision it should
 * not have to make. Classes disappear the same way when they are switched off.
 */
const GROUPS = (useClasses: boolean): NavGroup[] => [
  {
    label: "Teaching",
    links: [
      { href: "/teacher", label: "Overview", exact: true },
      { href: "/teacher/exams", label: "Exams & quizzes", exact: true },
      { href: "/teacher/exams/new", label: "Generate exams" },
    ],
  },
  {
    label: "People",
    links: [
      { href: "/teacher/students", label: "Students & risk" },
      ...(useClasses ? [{ href: "/teacher/classes", label: "My classes" }] : []),
    ],
  },
  {
    label: "Account",
    links: [{ href: "/teacher/profile", label: "My profile" }],
  },
];

export function TeacherNav({
  email,
  name,
  useClasses,
}: {
  email: string;
  name: string | null;
  useClasses: boolean;
}) {
  return <ConsoleNav groups={GROUPS(useClasses)} name={name} email={email} />;
}
