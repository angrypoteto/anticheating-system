import { ExamBuilder, BUILDER_BLURB } from "@/app/exams/builder";
import { Card, PageHeader } from "@/app/admin/ui";

export const dynamic = "force-dynamic";

export default function TeacherNewExamPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Generate an exam or quiz"
        subtitle="Start here, then write or AI-draft the questions on the next screen."
      />
      <Card title="New exam" hint={BUILDER_BLURB}>
        <ExamBuilder />
      </Card>
    </div>
  );
}
