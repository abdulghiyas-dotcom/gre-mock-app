// Shared types for the test engine. Mirror the generated-question shape in
// content-gen/src/schema.ts (which mirrors the Question DB model).

export type SectionType = "VERBAL" | "QUANT" | "AWA";
export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type QuestionType =
  | "TEXT_COMPLETION"
  | "SENTENCE_EQUIVALENCE"
  | "READING_COMPREHENSION"
  | "QUANT_COMPARISON"
  | "MULTIPLE_CHOICE_SINGLE"
  | "MULTIPLE_CHOICE_MULTIPLE"
  | "NUMERIC_ENTRY";

export interface Choice {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  section: SectionType;
  questionType: QuestionType;
  skillTag: string;
  difficulty: Difficulty;
  passageId: string | null;
  passageBodyHtml: string | null;
  stem: string;
  choices: Choice[];
  numericAnswer: number | null;
  explanation: string;
}

export interface TestSummary {
  id: string;
  name: string;
  kind: "VERBAL_PRACTICE" | "QUANT_PRACTICE" | "FULL_LENGTH";
  section: SectionType;
  questionCount: number;
  timeLimitSeconds: number;
}

export interface Test extends TestSummary {
  questions: Question[];
}
