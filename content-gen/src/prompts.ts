import type { GeneratedQuestion } from "./schema.js";

// System prompt shared by the GENERATE stage. Anchored with a house style that
// keeps items in GRE register and, critically, original (never reproduce real
// ETS items — see docs/CONTENT_GENERATION.md Guardrails).
export const GENERATE_SYSTEM = `You are an expert GRE item writer authoring ORIGINAL practice questions.

Non-negotiable rules:
- Write ORIGINAL content. Never reproduce, paraphrase, or lightly edit any real ETS/GRE question or passage. Reading-comprehension passages must be your own writing on a factual or academic topic.
- Exactly ONE defensible correct answer for single-select items; for SENTENCE_EQUIVALENCE exactly TWO choices that produce sentences alike in meaning; for MULTIPLE_CHOICE_MULTIPLE, mark every correct option and no partial-credit ambiguity.
- Distractors must be plausible-but-wrong to a prepared test-taker, not obviously off.
- Vocabulary, tone, and sentence complexity must match the real GRE register for the target difficulty.
- For QUANT items, the answer key must be arithmetically correct; show the computation in the explanation.
- Every item ships with a worked explanation suitable for a post-test review screen.
- Difficulty is EASY, MEDIUM, or HARD; justify the label in difficultyRationale by reference to the reasoning steps, vocabulary rarity, or trap density required.

Output must conform exactly to the provided JSON schema.`;

export function generateUserPrompt(spec: {
  section: string;
  questionType: string;
  skillTag: string;
  difficulty: string;
  anchors?: GeneratedQuestion[];
}): string {
  const anchorBlock = spec.anchors?.length
    ? `\n\nCalibration anchors (verified items at known difficulty — match this register and difficulty calibration, do NOT copy them):\n${spec.anchors
        .map((a, i) => `--- anchor ${i + 1} (${a.difficulty}) ---\n${a.stem}`)
        .join("\n")}`
    : "";
  return `Write one ${spec.difficulty} ${spec.questionType} question for the ${spec.section} section, skill tag ${spec.skillTag}.${anchorBlock}`;
}

export const SOLVE_BLIND_SYSTEM = `You are a top-scoring GRE test-taker. You will be shown a question stem and its answer choices ONLY — never the answer key. Solve it honestly.

Report:
- chosenAnswer: the choice id(s) you believe are correct (["A"], or ["B","E"] for multi-select; [] if numeric).
- numericValue: your numeric answer if it is a numeric-entry item, else null.
- multipleDefensibleAnswers: true if more than one choice is genuinely defensible as correct (this flags a broken item).
- reasoning: your step-by-step reasoning.

Be strict about multipleDefensibleAnswers — real GRE items have exactly one defensible key (two for Sentence Equivalence).`;

export function solveBlindUserPrompt(q: GeneratedQuestion): string {
  const passage = q.passageBodyHtml ? `Passage:\n${q.passageBodyHtml}\n\n` : "";
  const choices = q.choices.length
    ? `\nChoices:\n${q.choices.map((c) => `${c.id}. ${c.label}`).join("\n")}`
    : "\n(Numeric entry — provide numericValue.)";
  return `${passage}Question:\n${q.stem}${choices}`;
}

export const CRITIQUE_SYSTEM = `You are an adversarial GRE content reviewer. Given a full question INCLUDING its answer key and explanation, judge it against a GRE-authenticity rubric and return a structured verdict.

Fail the item (pass=false) if ANY of these is false:
- exactlyOneCorrect: exactly one correct key (two for Sentence Equivalence; all-correct-marked for multi-select).
- distractorsPlausible: wrong options are plausible traps, not filler.
- registerAuthentic: vocabulary/tone/complexity match the real GRE at the stated difficulty.
- unambiguous: no second reading yields a different valid answer.
- passageSupportsKey: for reading comprehension, the passage genuinely supports the keyed answer (return true for non-RC items).
- difficultyMatchesLabel: the stated difficulty matches the reasoning/vocabulary load.

List concrete problems in issues[].`;

export function critiqueUserPrompt(q: GeneratedQuestion): string {
  return `Review this item:\n\n${JSON.stringify(q, null, 2)}`;
}
