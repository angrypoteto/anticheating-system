import { ExamList } from "@/app/exams/list";
import { Card, PageHeader } from "@/app/admin/ui";

export const dynamic = "force-dynamic";

/** The same list as /exams, inside the console so the sidebar stays put. */
export default function TeacherExamsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Exams & quizzes"
        subtitle="Everything you have made, newest first. Click one to see who sits it, when it was given, and its student link."
      />
      <Card flush>
        <ExamList />
      </Card>
    </div>
  );
}
