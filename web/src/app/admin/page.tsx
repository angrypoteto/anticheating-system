import { createAdminClient } from "@/lib/supabase/admin";
import { loadEnrolment } from "@/lib/enrolment";
import { readAllRows } from "@/lib/read-all";
import { classesEnabled } from "@/lib/settings";
import { classLabel } from "@/lib/classes";
import { describeFlag, parseReason } from "@/lib/submission";
import {
  Card,
  CardLink,
  Empty,
  FactRow,
  FactValue,
  ListRow,
  PageHeader,
  Pill,
  PrimaryAction,
  Reachable,
  RowWhen,
  Stat,
} from "./ui";
import { FirstRun } from "./first-run";
import { LiveStatus } from "./live-status";
import { ClassProgressChart, ExamsByInstructorChart } from "./charts";

export const dynamic = "force-dynamic";

const since = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/** Manila time, since that is where the exams are actually sat. */
const shortDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-PH", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Manila",
      })
    : "—";

type ExamRow = {
  id: string;
  title: string;
  status: string;
  section_id: string | null;
  created_by_id: string | null;
  created_at: string;
  published_at: string | null;
  opens_at: string | null;
  closes_at: string | null;
  subjects: { name: string } | { name: string }[] | null;
  exam_sections: { section_id: string }[] | null;
};

type SessionRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  score: number | null;
  submitted_at: string | null;
  submitted_reason: string | null;
};

export default async function AdminOverview() {
  const admin = createAdminClient();
  const day = since(24);

  const [
    { data: settings },
    { data: users, error: usersError },
    { data: sections },
    { data: exams },
    sessions,
    { data: openFlags },
    { data: keys },
    { data: backups },
    storage,
    enrolment,
  ] = await Promise.all([
    admin
      .from("system_settings")
      .select("pass_threshold, institution_name, classes_enabled, allow_class_self_join")
      .eq("id", true)
      .maybeSingle(),
    admin.from("users").select("id, email, full_name, role, status"),
    admin.from("sections").select("id, name, subject"),
    admin
      .from("exams")
      .select(
        "id, title, status, section_id, created_by_id, created_at, published_at, opens_at, closes_at, subjects(name), exam_sections(section_id)",
      )
      .order("created_at", { ascending: false }),
    readAllRows<SessionRow>((f, to) =>
      admin
        .from("exam_sessions")
        .select("id, exam_id, student_id, status, score, submitted_at, submitted_reason")
        .range(f, to),
    ),
    admin.from("flags").select("id, session_id, type, occurred_at").is("resolution", null),
    admin
      .from("ai_provider_keys")
      .select("id, label, provider, key_hint, status, last_error")
      .order("created_at", { ascending: true }),
    admin
      .from("backup_runs")
      .select("started_at, status")
      .order("started_at", { ascending: false })
      .limit(1),
    // The only reachability check the server can honestly make for Storage.
    admin.storage.listBuckets(),
    loadEnrolment(admin),
  ]);

  const useClasses = await classesEnabled();
  const now = Date.now();

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const activeKeysAtSetup = (keys ?? []).filter((k) => k.status === "ACTIVE").length;
  const students = (users ?? []).filter((u) => u.role === "STUDENT");
  const allExams = (exams ?? []) as unknown as ExamRow[];
  const published = allExams.filter((e) => e.status === "PUBLISHED");

  /** Published is not open: an exam whose window has passed is neither. */
  const windowOf = (e: ExamRow): "open" | "closed" | "scheduled" | null => {
    if (e.status !== "PUBLISHED") return null;
    if (e.closes_at && new Date(e.closes_at).getTime() <= now) return "closed";
    if (e.opens_at && new Date(e.opens_at).getTime() > now) return "scheduled";
    return "open";
  };

  const openNow = published.filter((e) => windowOf(e) === "open").length;

  const graded = (sessions ?? []).filter((s) => typeof s.score === "number");
  const average = graded.length
    ? Math.round(graded.reduce((t, s) => t + (s.score ?? 0), 0) / graded.length)
    : null;

  const flaggedSittings = new Set((openFlags ?? []).map((f) => f.session_id)).size;

  // A school with no accounts and no exams has nothing to administer yet.
  if (!students.length && !allExams.length) {
    return (
      <FirstRun
        greeting={`Welcome to ${settings?.institution_name ?? "Proctorly"}`}
        lede="Nothing has been set up yet. Three things and your first class can sit a paper."
        action={{
          href: "/admin/accounts",
          label: "Add the first accounts",
          title: "Add people",
          detail:
            "Instructors set the papers and students sit them. Add an account here, or let students register themselves and put them into a class afterwards.",
        }}
        steps={[
          { label: "System ready", note: "Signed in as an administrator.", done: true },
          { label: "Add people", note: "Instructors first, then students.", done: false },
          {
            label: "Add a provider key",
            note: `${activeKeysAtSetup} stored — generation needs at least one.`,
            done: activeKeysAtSetup > 0,
          },
        ]}
        slots={[
          {
            label: "Sitting now",
            says: "Every student on a paper across the school, and the ones who have left the window.",
          },
          {
            label: "Open flags",
            says: "Departures nobody has dealt with yet, and which sitting each belongs to.",
          },
          {
            label: "System health",
            says: "Whether the database, storage and live updates are actually reachable right now.",
          },
          {
            label: "Recently given",
            says: "The papers instructors have published, newest first, with how many sat each one.",
          },
        ]}
      />
    );
  }

  // --- recently given -------------------------------------------------------
  const sittingsPerExam = new Map<string, number>();
  for (const s of sessions ?? []) {
    sittingsPerExam.set(s.exam_id, (sittingsPerExam.get(s.exam_id) ?? 0) + 1);
  }

  const sectionName = new Map((sections ?? []).map((s) => [s.id, classLabel(s)]));
  const personName = new Map((users ?? []).map((u) => [u.id, u.full_name || u.email]));

  const recentExams = [...published]
    .sort(
      (a, b) =>
        new Date(b.published_at ?? b.created_at).getTime() -
        new Date(a.published_at ?? a.created_at).getTime(),
    )
    .slice(0, 4)
    .map((e) => {
      const ids = new Set<string>((e.exam_sections ?? []).map((t) => t.section_id));
      if (e.section_id) ids.add(e.section_id);
      const embed = Array.isArray(e.subjects) ? e.subjects[0] : e.subjects;
      const sittings = sittingsPerExam.get(e.id) ?? 0;
      const parts = [
        embed?.name,
        useClasses
          ? [...ids].map((id) => sectionName.get(id) ?? "unknown class").join(", ")
          : null,
        e.created_by_id ? personName.get(e.created_by_id) : null,
        `${sittings} sitting${sittings === 1 ? "" : "s"}`,
      ].filter(Boolean);
      return { ...e, state: windowOf(e), detail: parts.join(" · ") };
    });

  // --- needs a look ---------------------------------------------------------
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  const examTitle = new Map(allExams.map((e) => [e.id, e.title]));

  const flagsBySession = new Map<string, string[]>();
  for (const f of openFlags ?? []) {
    flagsBySession.set(f.session_id, [...(flagsBySession.get(f.session_id) ?? []), f.type]);
  }

  const concerns: { id: string; who: string; why: string }[] = [];

  for (const [sessionId, types] of flagsBySession) {
    const sitting = sessionById.get(sessionId);
    if (!sitting) continue;
    const kinds = [...new Set(types.map(describeFlag))].join(", ");
    const n = types.length;
    concerns.push({
      id: sessionId,
      who: personName.get(sitting.student_id) ?? "unknown student",
      why: `${n} open warning${n === 1 ? "" : "s"} on ${
        examTitle.get(sitting.exam_id) ?? "an exam"
      } — ${kinds}`,
    });
  }

  // An exam the system ended for someone is worth a look even once its flags
  // have been dealt with — that is the sitting somebody may need to redo.
  for (const s of sessions ?? []) {
    if (flagsBySession.has(s.id)) continue;
    if (!s.submitted_at || s.submitted_at < day) continue;
    // STRIKES is the only ending that accuses anybody. Time running out and
    // the window closing are the system working, not a student to look at.
    if (parseReason(s.submitted_reason) !== "STRIKES") continue;
    concerns.push({
      id: s.id,
      who: personName.get(s.student_id) ?? "unknown student",
      why: `Submitted by the system on ${
        examTitle.get(s.exam_id) ?? "an exam"
      } — the warnings ran out`,
    });
  }

  const needsALook = concerns.slice(0, 4);

  // --- platform -------------------------------------------------------------
  const lastBackup = backups?.[0];
  const backupStale =
    !lastBackup || now - new Date(lastBackup.started_at).getTime() > 48 * 3600_000;

  // --- charts ---------------------------------------------------------------
  const sessionsByStudent = new Map<string, { status: string }[]>();
  for (const x of sessions ?? []) {
    sessionsByStudent.set(x.student_id, [
      ...(sessionsByStudent.get(x.student_id) ?? []),
      { status: x.status },
    ]);
  }

  const classRows = (sections ?? []).map((sec) => {
    const roll = new Set(enrolment.rollOf.get(sec.id) ?? []);
    const inClass = students.filter((s) => roll.has(s.id));
    let done = 0,
      taking = 0,
      notStarted = 0;
    for (const st of inClass) {
      const own = sessionsByStudent.get(st.id) ?? [];
      if (own.some((o) => o.status === "IN_PROGRESS")) taking++;
      else if (own.length > 0) done++;
      else notStarted++;
    }
    return { name: classLabel(sec), done, taking, notStarted };
  });

  const unassigned = students.filter(
    (s) => !(enrolment.classesOf.get(s.id) ?? []).length,
  ).length;
  if (unassigned > 0) {
    classRows.push({ name: "No class assigned", done: 0, taking: 0, notStarted: unassigned });
  }

  const instructorRows = (users ?? [])
    .filter((u) => u.role === "INSTRUCTOR" || u.role === "ADMIN")
    .map((u) => {
      const own = allExams.filter((e) => e.created_by_id === u.id);
      return {
        name: u.full_name || u.email,
        published: own.filter((e) => e.status === "PUBLISHED").length,
        drafts: own.filter((e) => e.status !== "PUBLISHED").length,
      };
    })
    .filter((r) => r.published + r.drafts > 0)
    .sort((a, b) => b.published + b.drafts - (a.published + a.drafts));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle={`Everything sat, flagged and generated across ${
          settings?.institution_name ?? "Proctorly"
        }.`}
        action={
          <PrimaryAction href="/admin/exams/new">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5.5v13M5.5 12h13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Generate exams &amp; quizzes
          </PrimaryAction>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Students"
          value={String(students.length)}
          note={
            useClasses
              ? `across ${sections?.length ?? 0} class${sections?.length === 1 ? "" : "es"}`
              : "all students"
          }
        />
        <Stat
          label="Exams given"
          value={String(published.length)}
          note={`${openNow} open right now`}
        />
        <Stat
          label="Open flags"
          value={String((openFlags ?? []).length)}
          tone={(openFlags ?? []).length ? "warn" : "plain"}
          note={`on ${flaggedSittings} sitting${flaggedSittings === 1 ? "" : "s"}`}
        />
        <Stat
          label="Average score"
          value={average === null ? "—" : `${average}%`}
          note={`pass mark ${passThreshold}%`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card
            title="Recently given"
            flush
            action={<CardLink href="/admin/exams">All exams &amp; quizzes</CardLink>}
          >
            {recentExams.length ? (
              recentExams.map((e) => (
                <ListRow key={e.id} title={e.title} detail={e.detail}>
                  {e.state === "open" ? (
                    <Pill tone="good" dot>
                      Open
                    </Pill>
                  ) : e.state === "scheduled" ? (
                    <Pill tone="warn">Scheduled</Pill>
                  ) : (
                    <Pill tone="muted">Closed</Pill>
                  )}
                  <RowWhen>{shortDate(e.published_at ?? e.created_at)}</RowWhen>
                </ListRow>
              ))
            ) : (
              <Empty>Nothing published yet.</Empty>
            )}
          </Card>

          <Card
            title="Needs a look"
            flush
            action={<CardLink href="/admin/students">Students &amp; risk</CardLink>}
          >
            {needsALook.length ? (
              needsALook.map((c) => (
                <ListRow key={c.id} title={c.who} detail={c.why}>
                  <Pill tone="warn">Review</Pill>
                </ListRow>
              ))
            ) : (
              <Empty>Nobody needs a look right now.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="System health"
            flush
            action={<CardLink href="/admin/health">Details</CardLink>}
          >
            <FactRow label="Database">
              <Reachable ok={!usersError}>{usersError ? "Not reaching" : "Reachable"}</Reachable>
            </FactRow>
            <FactRow label="Storage">
              <Reachable ok={!storage.error}>
                {storage.error ? "Not reaching" : "Reachable"}
              </Reachable>
            </FactRow>
            <FactRow label="Live updates">
              <LiveStatus />
            </FactRow>
            <FactRow label="Last backup">
              {lastBackup ? (
                backupStale ? (
                  <Pill tone="warn">{new Date(lastBackup.started_at).toLocaleDateString()}</Pill>
                ) : (
                  <FactValue>{new Date(lastBackup.started_at).toLocaleString()}</FactValue>
                )
              ) : (
                <Pill tone="warn">Never</Pill>
              )}
            </FactRow>
          </Card>

          <Card
            title="AI provider keys"
            flush
            action={<CardLink href="/admin/keys">Manage</CardLink>}
          >
            {keys?.length ? (
              keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-3 border-b border-gray-100 px-5.5 py-3 last:border-b-0"
                >
                  <span className="text-[13.5px] text-gray-900">{k.label}</span>
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-xs text-gray-500">····{k.key_hint}</span>
                    {k.status === "ACTIVE" && !k.last_error ? (
                      <Pill tone="good" dot>
                        Active
                      </Pill>
                    ) : (
                      <Pill tone="bad">{k.last_error ? "Erroring" : "Disabled"}</Pill>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <Empty>No keys stored — question generation will fail until one is added.</Empty>
            )}
          </Card>

          <Card
            title="Settings in force"
            flush
            action={<CardLink href="/admin/settings">Change</CardLink>}
          >
            <FactRow label="Classes">
              <FactValue>{(settings?.classes_enabled ?? true) ? "On" : "Off"}</FactValue>
            </FactRow>
            <FactRow label="Students pick their section">
              <FactValue>{(settings?.allow_class_self_join ?? true) ? "On" : "Off"}</FactValue>
            </FactRow>
            <FactRow label="Pass mark">
              <FactValue>{passThreshold}%</FactValue>
            </FactRow>
          </Card>
        </div>
      </div>

      <div className={`grid gap-5 ${useClasses ? "lg:grid-cols-2" : ""}`}>
        {useClasses ? (
          <Card
            title="Where each class stands"
            hint="Every student in a class, split by whether they have finished, are sitting an exam now, or have not started."
          >
            <ClassProgressChart rows={classRows} />
          </Card>
        ) : null}

        <Card title="Exams created" hint="By the instructor who made them.">
          <ExamsByInstructorChart rows={instructorRows} />
        </Card>
      </div>
    </div>
  );
}
