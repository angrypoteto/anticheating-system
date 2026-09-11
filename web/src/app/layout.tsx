import type { Metadata } from "next";
import { Geist_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// One family for everything, titles included. The Instrument system gets its
// hierarchy from size and weight rather than from a second typeface, so the
// old serif is gone and `font-serif` now resolves to this too (see globals.css).
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    default: "Proctorly: anti-cheating exam system",
    template: "%s · Proctorly",
  },
  description:
    "Monitored online exams with lockdown mode, live proctoring and AI-assisted question generation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
