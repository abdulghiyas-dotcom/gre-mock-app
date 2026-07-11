import type { Question, SectionType } from "./types";

export type AnswerMap = Record<string, string[] | number | null>;

export function isCorrect(q: Question, answer: string[] | number | null): boolean {
  if (answer === null || answer === undefined) return false;
  if (q.questionType === "NUMERIC_ENTRY") {
    return typeof answer === "number" && q.numericAnswer !== null && answer === q.numericAnswer;
  }
  const key = q.choices
    .filter((c) => c.isCorrect)
    .map((c) => c.id)
    .sort();
  const picked = Array.isArray(answer) ? [...answer].sort() : [];
  return key.length === picked.length && key.every((id, i) => id === picked[i]);
}

export function rawScore(questions: Question[], answers: AnswerMap): number {
  return questions.reduce((n, q) => n + (isCorrect(q, answers[q.id] ?? null) ? 1 : 0), 0);
}

// Section-level adaptive routing (see docs/SCORING_ENGINE.md §1). Thresholds are
// config, tuned against real distributions once calibration data exists.
export const ADAPTIVE_THRESHOLDS = {
  VERBAL: { hardMin: 10, mediumMin: 6 },
  QUANT: { hardMin: 10, mediumMin: 6 },
} as const;

export function routeDifficulty(section: "VERBAL" | "QUANT", raw: number): "EASY" | "MEDIUM" | "HARD" {
  const t = ADAPTIVE_THRESHOLDS[section];
  if (raw >= t.hardMin) return "HARD";
  if (raw >= t.mediumMin) return "MEDIUM";
  return "EASY";
}

// PLACEHOLDER raw -> scaled (130-170) conversion. The real engine uses the
// ScoreConversionTable keyed by (section, secondSectionDifficulty, rawTotal)
// per docs/SCORING_ENGINE.md §2. This linear map is a stand-in until the
// equating curve is seeded and calibrated against user p-values.
export function scaledScore(section: SectionType, raw: number, total: number): number {
  if (total === 0) return 130;
  const fraction = raw / total;
  return Math.round(130 + fraction * 40); // 130..170
}

export interface SkillBreakdownRow {
  skillTag: string;
  correct: number;
  total: number;
}

export function skillBreakdown(questions: Question[], answers: AnswerMap): SkillBreakdownRow[] {
  const map = new Map<string, SkillBreakdownRow>();
  for (const q of questions) {
    const row = map.get(q.skillTag) ?? { skillTag: q.skillTag, correct: 0, total: 0 };
    row.total += 1;
    if (isCorrect(q, answers[q.id] ?? null)) row.correct += 1;
    map.set(q.skillTag, row);
  }
  return [...map.values()].sort((a, b) => a.correct / a.total - b.correct / b.total);
}
