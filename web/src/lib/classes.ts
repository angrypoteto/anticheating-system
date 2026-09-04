/**
 * A class is one subject taught to one section — "System Administration" for
 * "BSIT 4C" — and carries its own join code. Rows created before subjects
 * existed have only the section name, so the label degrades to that.
 */
export type ClassRow = { subject?: string | null; name: string };

export function classLabel(c: ClassRow | null | undefined): string {
  if (!c) return "—";
  return c.subject ? `${c.subject} — ${c.name}` : c.name;
}

/** Subject first, then section, so a teacher's classes group by what they teach. */
export function byClassLabel(a: ClassRow, b: ClassRow) {
  return classLabel(a).localeCompare(classLabel(b));
}
