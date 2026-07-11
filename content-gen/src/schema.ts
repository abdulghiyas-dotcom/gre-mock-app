import { z } from "zod";

// Mirrors the Question model in docs/DATABASE_SCHEMA.md so generated items
// drop straight into the DB / seed files.

export const SectionType = z.enum(["VERBAL", "QUANT", "AWA"]);
export const Difficulty = z.enum(["EASY", "MEDIUM", "HARD"]);
export const QuestionType = z.enum([
  "TEXT_COMPLETION",
  "SENTENCE_EQUIVALENCE",
  "READING_COMPREHENSION",
  "QUANT_COMPARISON",
  "MULTIPLE_CHOICE_SINGLE",
  "MULTIPLE_CHOICE_MULTIPLE",
  "NUMERIC_ENTRY",
]);
export const SkillTag = z.enum([
  // Verbal
  "SENTENCE_EQUIVALENCE",
  "TEXT_COMPLETION",
  "RC_MAIN_IDEA",
  "RC_INFERENCE",
  "RC_STRUCTURE",
  "VOCAB_IN_CONTEXT",
  // Quant
  "ARITHMETIC",
  "ALGEBRA",
  "GEOMETRY",
  "DATA_INTERPRETATION",
  "WORD_PROBLEMS",
  "QUANT_COMPARISON_LOGIC",
]);

export const Choice = z.object({
  id: z.string(), // "A", "B", ...
  label: z.string(), // choice text
  isCorrect: z.boolean(),
});

// The shape the generator must emit. Kept flat/JSON-schema-friendly so it can be
// passed directly as output_config.format to the Messages API.
export const GeneratedQuestion = z.object({
  section: SectionType,
  questionType: QuestionType,
  skillTag: SkillTag,
  difficulty: Difficulty,
  // difficultyRationale is a generator self-report; the CRITIQUE stage and, later,
  // empirical p-values (see docs/CONTENT_GENERATION.md) are the real arbiters.
  difficultyRationale: z.string(),
  passageId: z.string().nullable(),
  passageBodyHtml: z.string().nullable(), // set only for READING_COMPREHENSION
  stem: z.string(),
  choices: z.array(Choice).min(2),
  // For NUMERIC_ENTRY, choices is empty and numericAnswer carries the key.
  numericAnswer: z.number().nullable(),
  explanation: z.string(),
  assetUrl: z.string().nullable(),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

export const SolveBlindResult = z.object({
  chosenAnswer: z.array(z.string()), // choice id(s), or [] with numericValue
  numericValue: z.number().nullable(),
  multipleDefensibleAnswers: z.boolean(),
  reasoning: z.string(),
});
export type SolveBlindResult = z.infer<typeof SolveBlindResult>;

export const CritiqueResult = z.object({
  pass: z.boolean(),
  exactlyOneCorrect: z.boolean(),
  distractorsPlausible: z.boolean(),
  registerAuthentic: z.boolean(),
  unambiguous: z.boolean(),
  passageSupportsKey: z.boolean(), // n/a items should return true
  difficultyMatchesLabel: z.boolean(),
  issues: z.array(z.string()),
});
export type CritiqueResult = z.infer<typeof CritiqueResult>;

// JSON Schema forms passed to output_config.format. Structured outputs on the
// Messages API forbid unsupported keywords, so these are hand-kept minimal.
export const generatedQuestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    section: { type: "string", enum: ["VERBAL", "QUANT", "AWA"] },
    questionType: {
      type: "string",
      enum: [
        "TEXT_COMPLETION",
        "SENTENCE_EQUIVALENCE",
        "READING_COMPREHENSION",
        "QUANT_COMPARISON",
        "MULTIPLE_CHOICE_SINGLE",
        "MULTIPLE_CHOICE_MULTIPLE",
        "NUMERIC_ENTRY",
      ],
    },
    skillTag: {
      type: "string",
      enum: [
        "SENTENCE_EQUIVALENCE",
        "TEXT_COMPLETION",
        "RC_MAIN_IDEA",
        "RC_INFERENCE",
        "RC_STRUCTURE",
        "VOCAB_IN_CONTEXT",
        "ARITHMETIC",
        "ALGEBRA",
        "GEOMETRY",
        "DATA_INTERPRETATION",
        "WORD_PROBLEMS",
        "QUANT_COMPARISON_LOGIC",
      ],
    },
    difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
    difficultyRationale: { type: "string" },
    passageId: { type: ["string", "null"] },
    passageBodyHtml: { type: ["string", "null"] },
    stem: { type: "string" },
    choices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          isCorrect: { type: "boolean" },
        },
        required: ["id", "label", "isCorrect"],
      },
    },
    numericAnswer: { type: ["number", "null"] },
    explanation: { type: "string" },
    assetUrl: { type: ["string", "null"] },
  },
  required: [
    "section",
    "questionType",
    "skillTag",
    "difficulty",
    "difficultyRationale",
    "passageId",
    "passageBodyHtml",
    "stem",
    "choices",
    "numericAnswer",
    "explanation",
    "assetUrl",
  ],
} as const;
