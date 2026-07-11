import type { Difficulty, Question } from "./types";

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
// config, tuned against real distributions once calibration data exists. Scaled
// here to the section length so the same rule works for small dev sections and
// full 13-14 question sections.
export const ADAPTIVE_THRESHOLDS = {
  VERBAL: { hardFrac: 0.75, mediumFrac: 0.45 },
  QUANT: { hardFrac: 0.75, mediumFrac: 0.45 },
} as const;

export function routeDifficulty(
  section: "VERBAL" | "QUANT",
  raw: number,
  total: number,
): Difficulty {
  const t = ADAPTIVE_THRESHOLDS[section];
  const frac = total > 0 ? raw / total : 0;
  if (frac >= t.hardFrac) return "HARD";
  if (frac >= t.mediumFrac) return "MEDIUM";
  return "EASY";
}

// Pick the second-section question set from the per-difficulty pools, falling
// back to the nearest non-empty pool when the routed tier is thin (a content
// limitation of a small bank, not a logic error).
export function selectAdaptiveQuestions(
  pools: Partial<Record<Difficulty, Question[]>>,
  routed: Difficulty,
  count: number,
): { questions: Question[]; administeredLevel: Difficulty } {
  const order: Difficulty[] = [routed, "MEDIUM", "HARD", "EASY"];
  for (const level of order) {
    const pool = pools[level];
    if (pool && pool.length > 0) {
      return { questions: pool.slice(0, count > 0 ? count : pool.length), administeredLevel: level };
    }
  }
  return { questions: [], administeredLevel: routed };
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
