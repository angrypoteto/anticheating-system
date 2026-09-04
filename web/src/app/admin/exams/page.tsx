import Link from "next/link";
import { ExamList } from "@/app/exams/list";
import { Card, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

/** The same list as /exams, kept inside the console so the sidebar stays put. */
export default function AdminExamsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Exams & quizzes"
        subtitle="Everything made so far, newest first. Open one to edit its questions, timer and lockdown rules."
      />
      <div>
        <Link
          href="/admin/exams/new"
          className="inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          Generate an exam or quiz
        </Link>
      </div>
      <Card title="All exams" flush>
        <ExamList />
      </Card>
    </div>
  );
}
