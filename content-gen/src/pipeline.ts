import Anthropic from "@anthropic-ai/sdk";
import {
  GeneratedQuestion,
  SolveBlindResult,
  CritiqueResult,
  generatedQuestionJsonSchema,
} from "./schema.js";
import {
  GENERATE_SYSTEM,
  generateUserPrompt,
  SOLVE_BLIND_SYSTEM,
  solveBlindUserPrompt,
  CRITIQUE_SYSTEM,
  critiqueUserPrompt,
} from "./prompts.js";

// Generation runs on Claude Fable 5 — Anthropic's most capable model.
// Fable 5 specifics handled below:
//  - Thinking is always on; controlled via output_config.effort (no budget_tokens).
//  - Safety classifiers can return stop_reason "refusal" (HTTP 200) — guarded.
//  - Server-side fallback to Opus 4.8 is enabled by default so a benign item that
//    trips a false-positive classifier is re-served instead of failing the batch.
//  - Requires 30-day data retention on the org (not available under ZDR).
const MODEL = "claude-fable-5";
const FALLBACK_MODEL = "claude-opus-4-8";
const FALLBACK_BETA = "server-side-fallback-2026-06-01";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY / ant auth profile

export interface QuestionSpec {
  section: string;
  questionType: string;
  skillTag: string;
  difficulty: string;
  anchors?: GeneratedQuestion[];
}

export interface PipelineOutcome {
  question: GeneratedQuestion;
  solveBlind: SolveBlindResult;
  critique: CritiqueResult;
  accepted: boolean;
  rejectionReasons: string[];
}

// One structured-output call to Fable 5 with the Opus-4.8 refusal fallback.
// Returns the first text block's parsed JSON, or throws on a full-chain refusal.
async function structuredCall<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: "high" | "xhigh";
  maxTokens: number;
}): Promise<T> {
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: [{ model: FALLBACK_MODEL }],
    thinking: { type: "adaptive" }, // always-on for Fable 5; accepted explicitly
    output_config: {
      effort: opts.effort,
      format: { type: "json_schema", schema: opts.schema },
    },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  if (msg.stop_reason === "refusal") {
    const detail = msg.stop_details?.explanation ?? "safety classifier refusal";
    throw new Error(`model refused (fallback chain exhausted): ${detail}`);
  }
  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("no text block in response");
  return JSON.parse(block.text) as T;
}

// 1. GENERATE — structured output conforming to the Question schema.
export async function generate(spec: QuestionSpec): Promise<GeneratedQuestion> {
  const raw = await structuredCall<unknown>({
    system: GENERATE_SYSTEM,
    user: generateUserPrompt(spec),
    schema: generatedQuestionJsonSchema as unknown as Record<string, unknown>,
    // Hard Quant gets the top effort tier; everything else runs at high.
    effort: spec.difficulty === "HARD" && spec.section === "QUANT" ? "xhigh" : "high",
    maxTokens: 8000,
  });
  return GeneratedQuestion.parse(raw);
}

// 2. SOLVE-BLIND — a separate call sees stem+choices only, never the key.
export async function solveBlind(q: GeneratedQuestion): Promise<SolveBlindResult> {
  const raw = await structuredCall<unknown>({
    system: SOLVE_BLIND_SYSTEM,
    user: solveBlindUserPrompt(q),
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        chosenAnswer: { type: "array", items: { type: "string" } },
        numericValue: { type: ["number", "null"] },
        multipleDefensibleAnswers: { type: "boolean" },
        reasoning: { type: "string" },
      },
      required: ["chosenAnswer", "numericValue", "multipleDefensibleAnswers", "reasoning"],
    },
    effort: "high",
    maxTokens: 6000,
  });
  return SolveBlindResult.parse(raw);
}

// 3. CRITIQUE — adversarial review against the GRE-authenticity rubric.
export async function critique(q: GeneratedQuestion): Promise<CritiqueResult> {
  const raw = await structuredCall<unknown>({
    system: CRITIQUE_SYSTEM,
    user: critiqueUserPrompt(q),
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pass: { type: "boolean" },
        exactlyOneCorrect: { type: "boolean" },
        distractorsPlausible: { type: "boolean" },
        registerAuthentic: { type: "boolean" },
        unambiguous: { type: "boolean" },
        passageSupportsKey: { type: "boolean" },
        difficultyMatchesLabel: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: [
        "pass",
        "exactlyOneCorrect",
        "distractorsPlausible",
        "registerAuthentic",
        "unambiguous",
        "passageSupportsKey",
        "difficultyMatchesLabel",
        "issues",
      ],
    },
    effort: "high",
    maxTokens: 4000,
  });
  return CritiqueResult.parse(raw);
}

// Reconcile the solve-blind answer against the generator's key.
function keyAgreement(q: GeneratedQuestion, sb: SolveBlindResult): boolean {
  if (q.questionType === "NUMERIC_ENTRY") {
    return sb.numericValue !== null && q.numericAnswer !== null && sb.numericValue === q.numericAnswer;
  }
  const key = q.choices.filter((c) => c.isCorrect).map((c) => c.id).sort();
  const picked = [...sb.chosenAnswer].sort();
  return key.length === picked.length && key.every((id, i) => id === picked[i]);
}

// Full pipeline for one spec, with a bounded regenerate-on-reject retry.
export async function runOne(spec: QuestionSpec, maxAttempts = 3): Promise<PipelineOutcome> {
  let last: PipelineOutcome | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const question = await generate(spec);
    const [sb, crit] = await Promise.all([solveBlind(question), critique(question)]);
    const reasons: string[] = [];
    if (sb.multipleDefensibleAnswers) reasons.push("solve-blind: multiple defensible answers");
    if (!keyAgreement(question, sb)) reasons.push("solve-blind disagrees with generator key");
    if (!crit.pass) reasons.push(...crit.issues.map((i) => `critique: ${i}`));
    const outcome: PipelineOutcome = {
      question,
      solveBlind: sb,
      critique: crit,
      accepted: reasons.length === 0,
      rejectionReasons: reasons,
    };
    if (outcome.accepted) return outcome;
    last = outcome;
  }
  return last!;
}
