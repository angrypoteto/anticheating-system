import "server-only";

/**
 * Pass/fail risk indicator.
 *
 * This is a transparent, rule-based indicator — deliberately NOT a machine
 * learning model. A class has a handful of students and an exam or two; anything
 * trained on that would be guessing with a confident face. Every band below can
 * be explained to a student in one sentence, which matters when the output is
 * "this person may fail".
 *
 * It reports its own confidence from how much evidence exists, so a judgement
 * made on one attempt is never presented as if it were made on ten.
 */

export type Attempt = {
  score: number | null;
  status: string;
  flags: number;
};

export type RiskBand = "on-track" | "watch" | "at-risk" | "no-data";

export type Risk = {
  band: RiskBand;
  /** Mean of graded attempts, or null when nothing is graded yet. */
  average: number | null;
  graded: number;
  notTaken: number;
  autoSubmitted: number;
  flags: number;
  confidence: "none" | "low" | "moderate" | "reasonable";
  reasons: string[];
};

export const BAND_LABEL: Record<RiskBand, string> = {
  "on-track": "On track",
  watch: "Watch",
  "at-risk": "At risk",
  "no-data": "No data",
};

export function assessStudent(
  attempts: Attempt[],
  examsAvailable: number,
  passThreshold: number,
): Risk {
  const graded = attempts.filter((a) => a.score != null);
  const average =
    graded.length > 0
      ? Math.round((graded.reduce((n, a) => n + (a.score ?? 0), 0) / graded.length) * 100) / 100
      : null;

  const autoSubmitted = attempts.filter((a) => a.status === "AUTO_SUBMITTED").length;
  const flags = attempts.reduce((n, a) => n + a.flags, 0);
  const notTaken = Math.max(0, examsAvailable - attempts.length);

  const confidence =
    graded.length === 0 ? "none"
      : graded.length === 1 ? "low"
      : graded.length <= 3 ? "moderate"
      : "reasonable";

  const reasons: string[] = [];

  if (average == null) {
    if (notTaken > 0) reasons.push(`Has not attempted ${notTaken} available exam${notTaken === 1 ? "" : "s"}.`);
    else reasons.push("No graded attempt yet.");
    return { band: "no-data", average, graded: 0, notTaken, autoSubmitted, flags, confidence, reasons };
  }

  // The average against the pass mark is the primary signal; everything else
  // can only make the picture worse, never better.
  let band: RiskBand =
    average < passThreshold - 10 ? "at-risk"
      : average < passThreshold ? "watch"
      : "on-track";

  reasons.push(
    average < passThreshold
      ? `Average ${average}% is below the ${passThreshold}% pass mark.`
      : `Average ${average}% is at or above the ${passThreshold}% pass mark.`,
  );

  if (notTaken > 0 && notTaken >= examsAvailable / 2) {
    band = band === "on-track" ? "watch" : "at-risk";
    reasons.push(`Missing ${notTaken} of ${examsAvailable} exams, which will pull the average down.`);
  } else if (notTaken > 0) {
    reasons.push(`Still has ${notTaken} exam${notTaken === 1 ? "" : "s"} to take.`);
  }

  if (autoSubmitted > 0) {
    if (band === "on-track") band = "watch";
    reasons.push(
      `${autoSubmitted} attempt${autoSubmitted === 1 ? " was" : "s were"} submitted automatically — ran out of time or hit the strike limit.`,
    );
  }

  // Flags are an integrity signal, not an academic one, so they are reported
  // but never move the band on their own.
  if (flags > 0) {
    reasons.push(`${flags} flag${flags === 1 ? "" : "s"} recorded (integrity, not counted toward this band).`);
  }

  return { band, average, graded: graded.length, notTaken, autoSubmitted, flags, confidence, reasons };
}

export type SectionRisk = {
  students: number;
  assessed: number;
  atRisk: number;
  watch: number;
  onTrack: number;
  noData: number;
  average: number | null;
  /** Share of assessed students currently projected to pass. */
  projectedPassRate: number | null;
  confidence: Risk["confidence"];
};

export function assessSection(risks: Risk[]): SectionRisk {
  const assessedRisks = risks.filter((r) => r.band !== "no-data");
  const withAverage = risks.filter((r) => r.average != null);

  const average =
    withAverage.length > 0
      ? Math.round(
          (withAverage.reduce((n, r) => n + (r.average ?? 0), 0) / withAverage.length) * 100,
        ) / 100
      : null;

  const onTrack = risks.filter((r) => r.band === "on-track").length;

  const totalGraded = risks.reduce((n, r) => n + r.graded, 0);
  const confidence =
    totalGraded === 0 ? "none"
      : totalGraded <= 2 ? "low"
      : totalGraded <= 8 ? "moderate"
      : "reasonable";

  return {
    students: risks.length,
    assessed: assessedRisks.length,
    atRisk: risks.filter((r) => r.band === "at-risk").length,
    watch: risks.filter((r) => r.band === "watch").length,
    onTrack,
    noData: risks.filter((r) => r.band === "no-data").length,
    average,
    projectedPassRate:
      assessedRisks.length > 0
        ? Math.round((onTrack / assessedRisks.length) * 1000) / 10
        : null,
    confidence,
  };
}
