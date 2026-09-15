import { ImageResponse } from "next/og";
import { describeLinkedExam, examForLink } from "@/lib/exam-link";

export const alt = "An exam on Proctorly";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The picture a chat app shows under a shared exam link: the paper's name,
 * large, on the product's own quiet ground. No questions, no class, nothing
 * the link itself would not tell the person holding it.
 */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const exam = await examForLink(token);
  const title = exam?.title ?? "An exam on Proctorly";
  const facts = exam ? describeLinkedExam(exam) : "Sign in to open it.";
  const long = title.length > 48;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAFAF8",
          color: "#111418",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2.75 4.75 5.5v6.02c0 4.34 2.94 8.4 7.25 9.73 4.31-1.33 7.25-5.39 7.25-9.73V5.5L12 2.75Z"
              stroke="#111418"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="m8.9 12.1 2.15 2.15 4.05-4.5" stroke="#111418" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Proctorly
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: long ? 64 : 84,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              display: "flex",
            }}
          >
            {title.length > 110 ? `${title.slice(0, 107)}…` : title}
          </div>
          <div style={{ fontSize: 34, color: "#6B6F76", display: "flex" }}>{facts}</div>
        </div>

        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            background: "#111418",
            color: "#FFFFFF",
            fontSize: 28,
            fontWeight: 600,
            padding: "14px 26px",
            borderRadius: 12,
          }}
        >
          Sign in to start
        </div>
      </div>
    ),
    { ...size },
  );
}
