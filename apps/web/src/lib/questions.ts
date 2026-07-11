import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Question, Test, TestSummary } from "./types";

// DEV DATA SOURCE: reads the verified seed bank produced by content-gen.
// In production this module is replaced by Prisma queries against Postgres
// (see prisma/schema.prisma + prisma/seed.ts) — the test engine never calls
// an LLM at runtime; it only reads pre-generated, pre-verified questions.
const SEED_DIR =
  process.env.SEED_DIR ?? path.resolve(process.cwd(), "..", "..", "content-gen", "seed");

async function readSeed(file: string): Promise<Omit<Question, "id">[]> {
  const raw = await readFile(path.join(SEED_DIR, file), "utf8");
  return JSON.parse(raw) as Omit<Question, "id">[];
}

function withIds(items: Omit<Question, "id">[]): Question[] {
  // Deterministic ids from position keep server/client hydration stable.
  return items.map((q, i) => ({ ...q, id: `${q.section.toLowerCase()}-${i + 1}` }));
}

// Assemble the demo test catalog from the seed bank. Each practice test is one
// timed section here; a full-length build wires two sections + adaptivity
// (see docs/SCORING_ENGINE.md) once the bank has per-difficulty pools.
export async function getTests(): Promise<Test[]> {
  const [verbal, quant] = await Promise.all([readSeed("verbal.json"), readSeed("quant.json")]);
  const verbalQs = withIds(verbal);
  const quantQs = withIds(quant);

  return [
    {
      id: "verbal-practice-1",
      name: "Verbal Practice Test 1",
      kind: "VERBAL_PRACTICE",
      section: "VERBAL",
      questionCount: verbalQs.length,
      timeLimitSeconds: verbalQs.length * 90, // ~1.5 min/question
      questions: verbalQs,
    },
    {
      id: "quant-practice-1",
      name: "Quantitative Practice Test 1",
      kind: "QUANT_PRACTICE",
      section: "QUANT",
      questionCount: quantQs.length,
      timeLimitSeconds: quantQs.length * 105, // ~1.75 min/question
      questions: quantQs,
    },
  ];
}

export async function getTestSummaries(): Promise<TestSummary[]> {
  const tests = await getTests();
  return tests.map(({ questions, ...summary }) => summary);
}

export async function getTest(id: string): Promise<Test | null> {
  const tests = await getTests();
  return tests.find((t) => t.id === id) ?? null;
}

// Reserved for future attempt persistence.
export const newAttemptId = () => randomUUID();
