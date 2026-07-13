import type { Question, Difficulty, TestDef, TestSummary } from "./types";
import verbalRaw from "../data/verbal.json";
import quantRaw from "../data/quant.json";
import awaPromptsRaw from "../data/awa-prompts.json";

// DEV DATA SOURCE: the verified seed bank produced by content-gen, bundled
// directly into the app (synced from content-gen/seed/*.json) so it works
// on serverless deployments with no runtime filesystem dependency.
// In production this module is replaced by Prisma queries against Postgres.
// The test engine never calls an LLM at runtime — it reads pre-generated,
// pre-verified questions only.
function readSeed(raw: unknown): Omit<Question, "id">[] {
  return raw as Omit<Question, "id">[];
}

function readEssayPrompts(): { id: string; promptText: string }[] {
  return awaPromptsRaw as { id: string; promptText: string }[];
}

function withIds(items: Omit<Question, "id">[], prefix: string): Question[] {
  return items.map((q, i) => ({ ...q, id: `${prefix}-${i + 1}` }));
}

function byDifficulty(questions: Question[]): Record<Difficulty, Question[]> {
  const pools: Record<Difficulty, Question[]> = { EASY: [], MEDIUM: [], HARD: [] };
  for (const q of questions) pools[q.difficulty].push(q);
  return pools;
}

// Deterministically take `n` questions from `pool` starting at `offset`,
// wrapping around the end. Never returns a duplicate within a single call
// (count is clamped to the pool size), so a section is always internally
// distinct. Different offsets across tests spread the draws over the bank to
// keep tests as different from one another as the bank size allows.
function take(pool: Question[], offset: number, n: number): Question[] {
  if (pool.length === 0) return [];
  const count = Math.min(n, pool.length);
  const start = ((offset % pool.length) + pool.length) % pool.length;
  const out: Question[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

// Exact real-GRE section sizes (post-2023 shortened format): Section 1 = 12
// questions, Section 2 = 15 questions (27 per subject). ETS's official
// per-subject timing.
const SECTION_1 = 12;
const SECTION_2 = 15;
const TIMES: Record<"VERBAL" | "QUANT", { s1: number; s2: number }> = {
  VERBAL: { s1: 18 * 60, s2: 23 * 60 },
  QUANT: { s1: 21 * 60, s2: 26 * 60 },
};

function label(kind: "VERBAL" | "QUANT"): string {
  return kind === "VERBAL" ? "Verbal" : "Quantitative";
}

// Build the two sections for one subject of a full-length test. Section 1 is a
// fixed 12-question medium set; Section 2 is adaptive with full 15-question
// EASY / MEDIUM / HARD pools, so it always administers a complete 15-question
// section whichever difficulty the test-taker routes into. `k` offsets the
// draws so the six full-length tests overlap as little as the bank allows.
function fullLengthSubject(
  kind: "VERBAL" | "QUANT",
  tiers: Record<Difficulty, Question[]>,
  secPrefix: string,
  k: number,
): TestDef["sections"] {
  const t = TIMES[kind];
  // Draw 12 + 15 = 27 medium in one contiguous block so Section 1 and the
  // Section-2 medium pool never share a question within this test.
  const medBlock = take(tiers.MEDIUM, k * SECTION_2, SECTION_1 + SECTION_2);
  const s1 = medBlock.slice(0, SECTION_1);
  const mediumPool = medBlock.slice(SECTION_1, SECTION_1 + SECTION_2);
  const easyPool = take(tiers.EASY, k * 10, SECTION_2);
  const hardPool = take(tiers.HARD, k * 11, SECTION_2);
  return [
    {
      id: `${secPrefix}-1`,
      kind,
      title: `${label(kind)} Reasoning — Section 1`,
      timeLimitSeconds: t.s1,
      adaptive: false,
      questions: s1,
    },
    {
      id: `${secPrefix}-2`,
      kind,
      title: `${label(kind)} Reasoning — Section 2 (adaptive)`,
      timeLimitSeconds: t.s2,
      adaptive: true,
      pools: { EASY: easyPool, MEDIUM: mediumPool, HARD: hardPool },
      questionCount: SECTION_2,
    },
  ];
}

function buildFullLength(
  id: string,
  name: string,
  verbalTiers: Record<Difficulty, Question[]>,
  quantTiers: Record<Difficulty, Question[]>,
  prompt: { id: string; promptText: string } | undefined,
  k: number,
): TestDef {
  return {
    id,
    name,
    kind: "FULL_LENGTH",
    sections: [
      {
        id: "awa",
        kind: "AWA",
        title: "Analytical Writing — Analyze an Issue",
        timeLimitSeconds: 1800,
        adaptive: false,
        essayPromptId: prompt?.id,
        essayPromptText: prompt?.promptText,
      },
      ...fullLengthSubject("VERBAL", verbalTiers, "verbal", k),
      ...fullLengthSubject("QUANT", quantTiers, "quant", k),
    ],
  };
}

// Build one single-subject practice test: 12 + 15 = 27 questions (non-adaptive)
// with a real-test-like difficulty mix, drawn with a `k` offset for distinctness.
function buildPractice(
  id: string,
  name: string,
  kind: "VERBAL_PRACTICE" | "QUANT_PRACTICE",
  tiers: Record<Difficulty, Question[]>,
  k: number,
): TestDef {
  const secKind = kind === "VERBAL_PRACTICE" ? "VERBAL" : "QUANT";
  const t = TIMES[secKind];
  // 27 total across a representative spread: 7 easy, 13 medium, 7 hard.
  const all = [
    ...take(tiers.EASY, k * 7, 7),
    ...take(tiers.MEDIUM, k * 13, 13),
    ...take(tiers.HARD, k * 7, 7),
  ];
  const s1 = all.slice(0, SECTION_1);
  const s2 = all.slice(SECTION_1, SECTION_1 + SECTION_2);
  return {
    id,
    name,
    kind,
    sections: [
      { id: "s1", kind: secKind, title: `${label(secKind)} Reasoning — Section 1`, timeLimitSeconds: t.s1, adaptive: false, questions: s1 },
      { id: "s2", kind: secKind, title: `${label(secKind)} Reasoning — Section 2`, timeLimitSeconds: t.s2, adaptive: false, questions: s2 },
    ],
  };
}

// Assemble the catalog: N_FULL full-length + N_VERBAL_PRACTICE verbal-only +
// N_QUANT_PRACTICE quant-only tests. Every test draws a full, difficulty-correct
// 12 + 15 = 27 questions per subject from the whole bank. Because 16 tests at 27
// per subject (432) exceeds the current bank, questions may recur across tests;
// rotating offsets (the `k` argument) spread the draws so distinct tests differ
// as much as the bank allows. Within any single test no question repeats.
const N_FULL = 6;
const N_VERBAL_PRACTICE = 5;
const N_QUANT_PRACTICE = 5;

export async function getTestDefs(): Promise<TestDef[]> {
  const prompts = readEssayPrompts();
  const verbalTiers = byDifficulty(withIds(readSeed(verbalRaw), "v"));
  const quantTiers = byDifficulty(withIds(readSeed(quantRaw), "q"));

  const fullLength = Array.from({ length: N_FULL }, (_, i) =>
    buildFullLength(
      `full-length-${i + 1}`,
      `Full-Length Mock Test ${i + 1}`,
      verbalTiers,
      quantTiers,
      prompts[i % prompts.length],
      i,
    ),
  );
  const verbalPractice = Array.from({ length: N_VERBAL_PRACTICE }, (_, i) =>
    buildPractice(
      `verbal-practice-${i + 1}`,
      `Verbal Practice Test ${i + 1}`,
      "VERBAL_PRACTICE",
      verbalTiers,
      N_FULL + i,
    ),
  );
  const quantPractice = Array.from({ length: N_QUANT_PRACTICE }, (_, i) =>
    buildPractice(
      `quant-practice-${i + 1}`,
      `Quantitative Practice Test ${i + 1}`,
      "QUANT_PRACTICE",
      quantTiers,
      N_FULL + i,
    ),
  );

  return [...fullLength, ...verbalPractice, ...quantPractice];
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
