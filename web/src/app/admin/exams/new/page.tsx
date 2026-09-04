import { ExamBuilder, BUILDER_BLURB } from "@/app/exams/builder";
import { Card, PageHeader } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * The same builder as /exams/new, but under /admin so it inherits the console
 * layout — clicking it in the sidebar shouldn't throw an admin out of the
 * dashboard.
 */
export default function AdminNewExamPage() {
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
