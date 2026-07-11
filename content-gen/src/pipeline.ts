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

const MODEL = "claude-opus-4-8";
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

function firstText(msg: Anthropic.Message): string {
  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("no text block in response");
  return block.text;
}

// 1. GENERATE — structured output conforming to the Question schema.
export async function generate(spec: QuestionSpec): Promise<GeneratedQuestion> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: spec.difficulty === "HARD" && spec.section === "QUANT" ? "xhigh" : "high",
      format: { type: "json_schema", schema: generatedQuestionJsonSchema },
    },
    system: GENERATE_SYSTEM,
    messages: [{ role: "user", content: generateUserPrompt(spec) }],
  });
  return GeneratedQuestion.parse(JSON.parse(firstText(msg)));
}

// 2. SOLVE-BLIND — a separate call sees stem+choices only, never the key.
export async function solveBlind(q: GeneratedQuestion): Promise<SolveBlindResult> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
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
      },
    },
    system: SOLVE_BLIND_SYSTEM,
    messages: [{ role: "user", content: solveBlindUserPrompt(q) }],
  });
  return SolveBlindResult.parse(JSON.parse(firstText(msg)));
}

// 3. CRITIQUE — adversarial review against the GRE-authenticity rubric.
export async function critique(q: GeneratedQuestion): Promise<CritiqueResult> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
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
      },
    },
    system: CRITIQUE_SYSTEM,
    messages: [{ role: "user", content: critiqueUserPrompt(q) }],
  });
  return CritiqueResult.parse(JSON.parse(firstText(msg)));
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
