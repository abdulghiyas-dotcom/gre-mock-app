// Shared types for the test engine. Question mirrors content-gen/src/schema.ts
// (which mirrors the Question DB model). A test is a sequence of sections.

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

export type TestKind = "FULL_LENGTH" | "VERBAL_PRACTICE" | "QUANT_PRACTICE";

export interface SectionDef {
  id: string; // stable within a test, e.g. "verbal-1"
  kind: SectionType;
  title: string;
  timeLimitSeconds: number;
  // AWA sections:
  essayPromptId?: string;
  essayPromptText?: string;
  // Verbal/Quant sections:
  adaptive: boolean; // true = difficulty of this section is routed from the prior one
  questions?: Question[]; // resolved list for fixed / section-1 sections
  pools?: Partial<Record<Difficulty, Question[]>>; // per-difficulty pools for adaptive sections
  questionCount?: number;
}

export interface TestDef {
  id: string;
  name: string;
  kind: TestKind;
  sections: SectionDef[];
}

export interface TestSummary {
  id: string;
  name: string;
  kind: TestKind;
  sectionCount: number;
  totalQuestions: number;
  totalTimeSeconds: number;
  hasEssay: boolean;
}
