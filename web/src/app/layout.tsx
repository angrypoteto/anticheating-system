import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Titles only. A serif gives an exam system a weight a grotesque cannot, and
// keeping it to headings stops it becoming decoration.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  /**
   * The tab says where you are, and whose product it is.
   *
   * Every page used to carry the same forty-character title, so six tabs open
   * on six different screens were six identical tabs — and the part that told
   * them apart was the part the browser truncates away first. The template
   * puts the page first, where a narrow tab still shows it, and keeps the
   * product name behind it for the tab that is wide enough.
   */
  title: {
    default: "Proctorly — Anti-Cheating Exam System",
    template: "%s · Proctorly",
  },
  description:
    "Monitored online exams with lockdown mode, live proctoring and AI-assisted question generation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
