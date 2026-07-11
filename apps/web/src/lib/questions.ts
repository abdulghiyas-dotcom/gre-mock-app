import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Question, Difficulty, TestDef, TestSummary } from "./types";

// DEV DATA SOURCE: reads the verified seed bank produced by content-gen.
// In production this module is replaced by Prisma queries against Postgres.
// The test engine never calls an LLM at runtime — it reads pre-generated,
// pre-verified questions only.
const SEED_DIR =
  process.env.SEED_DIR ?? path.resolve(process.cwd(), "..", "..", "content-gen", "seed");

async function readSeed(file: string): Promise<Omit<Question, "id">[]> {
  const raw = await readFile(path.join(SEED_DIR, file), "utf8");
  return JSON.parse(raw) as Omit<Question, "id">[];
}

async function readEssayPrompts(): Promise<{ id: string; promptText: string }[]> {
  const raw = await readFile(path.join(SEED_DIR, "awa-prompts.json"), "utf8");
  return JSON.parse(raw) as { id: string; promptText: string }[];
}

function withIds(items: Omit<Question, "id">[], prefix: string): Question[] {
  return items.map((q, i) => ({ ...q, id: `${prefix}-${i + 1}` }));
}

function poolsByDifficulty(questions: Question[]): Partial<Record<Difficulty, Question[]>> {
  const pools: Partial<Record<Difficulty, Question[]>> = {};
  for (const q of questions) (pools[q.difficulty] ??= []).push(q);
  return pools;
}

// Build all test definitions from the seed bank.
//
// NOTE ON CONTENT SCALE: the section sizes below are bounded by the small seed
// bank. Real GRE sections are ~13-14 questions across separate EASY/MEDIUM/HARD
// pools; grow the bank with content-gen and these assemblies fill out. The test
// STRUCTURE (multi-section, one-way boundaries, adaptive section 2) is complete.
export async function getTestDefs(): Promise<TestDef[]> {
  const [verbalRaw, quantRaw, prompts] = await Promise.all([
    readSeed("verbal.json"),
    readSeed("quant.json"),
    readEssayPrompts(),
  ]);
  const verbal = withIds(verbalRaw, "v");
  const quant = withIds(quantRaw, "q");
  const vPools = poolsByDifficulty(verbal);
  const qPools = poolsByDifficulty(quant);

  const verbalPractice: TestDef = {
    id: "verbal-practice-1",
    name: "Verbal Practice Test 1",
    kind: "VERBAL_PRACTICE",
    sections: [
      { id: "v1", kind: "VERBAL", title: "Verbal Reasoning — Section 1", timeLimitSeconds: verbal.length * 90, adaptive: false, questions: verbal },
      { id: "v2", kind: "VERBAL", title: "Verbal Reasoning — Section 2", timeLimitSeconds: verbal.length * 90, adaptive: false, questions: verbal },
    ],
  };

  const quantPractice: TestDef = {
    id: "quant-practice-1",
    name: "Quantitative Practice Test 1",
    kind: "QUANT_PRACTICE",
    sections: [
      { id: "q1", kind: "QUANT", title: "Quantitative Reasoning — Section 1", timeLimitSeconds: quant.length * 105, adaptive: false, questions: quant },
      { id: "q2", kind: "QUANT", title: "Quantitative Reasoning — Section 2", timeLimitSeconds: quant.length * 105, adaptive: false, questions: quant },
    ],
  };

  // Full-length: AWA -> Verbal 1 -> Quant 1 -> Verbal 2 (adaptive) -> Quant 2 (adaptive).
  const fullLength: TestDef = {
    id: "full-length-1",
    name: "Full-Length Mock Test 1",
    kind: "FULL_LENGTH",
    sections: [
      {
        id: "awa",
        kind: "AWA",
        title: "Analytical Writing — Analyze an Issue",
        timeLimitSeconds: 1800,
        adaptive: false,
        essayPromptId: prompts[0]?.id,
        essayPromptText: prompts[0]?.promptText,
      },
      { id: "verbal-1", kind: "VERBAL", title: "Verbal Reasoning — Section 1", timeLimitSeconds: verbal.length * 90, adaptive: false, questions: verbal },
      { id: "quant-1", kind: "QUANT", title: "Quantitative Reasoning — Section 1", timeLimitSeconds: quant.length * 105, adaptive: false, questions: quant },
      { id: "verbal-2", kind: "VERBAL", title: "Verbal Reasoning — Section 2 (adaptive)", timeLimitSeconds: verbal.length * 90, adaptive: true, pools: vPools, questionCount: verbal.length },
      { id: "quant-2", kind: "QUANT", title: "Quantitative Reasoning — Section 2 (adaptive)", timeLimitSeconds: quant.length * 105, adaptive: true, pools: qPools, questionCount: quant.length },
    ],
  };

  return [fullLength, verbalPractice, quantPractice];
}

export async function getTestSummaries(): Promise<TestSummary[]> {
  const defs = await getTestDefs();
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    sectionCount: d.sections.length,
    totalQuestions: d.sections.reduce((n, s) => n + (s.questions?.length ?? s.questionCount ?? 0), 0),
    totalTimeSeconds: d.sections.reduce((n, s) => n + s.timeLimitSeconds, 0),
    hasEssay: d.sections.some((s) => s.kind === "AWA"),
  }));
}

export async function getTestDef(id: string): Promise<TestDef | null> {
  const defs = await getTestDefs();
  return defs.find((d) => d.id === id) ?? null;
}
