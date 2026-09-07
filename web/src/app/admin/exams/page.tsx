import type { Metadata } from "next";
import { ExamList } from "@/app/exams/list";
import { Card, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

/** The same list as /exams, kept inside the console so the sidebar stays put. */
export const metadata: Metadata = { title: "Exams & quizzes" };

export default function AdminExamsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Exams & quizzes"
        subtitle="Everything made so far, newest first. Click one to see who set it, which classes sit it and when."
      />
      <Card flush>
        <ExamList />
      </Card>
    </div>
  );
}
