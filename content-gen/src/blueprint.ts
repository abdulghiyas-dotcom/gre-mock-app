import type { QuestionSpec } from "./pipeline.js";

// A GRE section blueprint: how many of each (type, skill, difficulty) to generate.
// One full-length test needs: 2 Verbal sections (27 Q) + 2 Quant sections (27 Q) + 1 AWA.
// This blueprint expands into concrete QuestionSpecs the runner iterates over.

interface BlueprintRow {
  section: string;
  questionType: string;
  skillTag: string;
  difficulty: string;
  count: number;
}

// Representative single-section blueprint (~13 items). Scale by cloning across
// EASY/MEDIUM/HARD difficulty pools for the adaptive second sections, and across
// the 6 full-length + 10 practice tests.
export const VERBAL_SECTION: BlueprintRow[] = [
  { section: "VERBAL", questionType: "TEXT_COMPLETION", skillTag: "TEXT_COMPLETION", difficulty: "MEDIUM", count: 4 },
  { section: "VERBAL", questionType: "SENTENCE_EQUIVALENCE", skillTag: "SENTENCE_EQUIVALENCE", difficulty: "MEDIUM", count: 3 },
  { section: "VERBAL", questionType: "READING_COMPREHENSION", skillTag: "RC_MAIN_IDEA", difficulty: "MEDIUM", count: 2 },
  { section: "VERBAL", questionType: "READING_COMPREHENSION", skillTag: "RC_INFERENCE", difficulty: "MEDIUM", count: 2 },
  { section: "VERBAL", questionType: "READING_COMPREHENSION", skillTag: "RC_STRUCTURE", difficulty: "HARD", count: 2 },
];

export const QUANT_SECTION: BlueprintRow[] = [
  { section: "QUANT", questionType: "QUANT_COMPARISON", skillTag: "QUANT_COMPARISON_LOGIC", difficulty: "MEDIUM", count: 3 },
  { section: "QUANT", questionType: "MULTIPLE_CHOICE_SINGLE", skillTag: "ALGEBRA", difficulty: "MEDIUM", count: 3 },
  { section: "QUANT", questionType: "MULTIPLE_CHOICE_SINGLE", skillTag: "GEOMETRY", difficulty: "MEDIUM", count: 2 },
  { section: "QUANT", questionType: "NUMERIC_ENTRY", skillTag: "ARITHMETIC", difficulty: "MEDIUM", count: 2 },
  { section: "QUANT", questionType: "MULTIPLE_CHOICE_SINGLE", skillTag: "DATA_INTERPRETATION", difficulty: "HARD", count: 3 },
];

export function expand(rows: BlueprintRow[]): QuestionSpec[] {
  const specs: QuestionSpec[] = [];
  for (const r of rows) {
    for (let i = 0; i < r.count; i++) {
      specs.push({
        section: r.section,
        questionType: r.questionType,
        skillTag: r.skillTag,
        difficulty: r.difficulty,
      });
    }
  }
  return specs;
}
