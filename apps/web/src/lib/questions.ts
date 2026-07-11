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

function byDifficulty(questions: Question[]): Record<Difficulty, Question[]> {
  const pools: Record<Difficulty, Question[]> = { EASY: [], MEDIUM: [], HARD: [] };
  for (const q of questions) pools[q.difficulty].push(q);
  return pools;
}

// Deterministically partition the bank into n disjoint shares, balanced per
// difficulty tier (round-robin within each tier), so every test gets its own
// questions AND its own usable EASY/MEDIUM/HARD pools. Deterministic order
// keeps server/client rendering and resumed attempts stable.
function partition(questions: Question[], n: number): Question[][] {
  const shares: Question[][] = Array.from({ length: n }, () => []);
  const tiers = byDifficulty(questions);
  for (const tier of ["EASY", "MEDIUM", "HARD"] as const) {
    tiers[tier].forEach((q, i) => shares[i % n].push(q));
  }
  return shares;
}

// Build one full-length test from a verbal share + quant share + essay prompt.
// Section 1 is a fixed medium-difficulty set; Section 2 is adaptive, drawing
// from the share's remaining items grouped into difficulty pools.
function buildFullLength(
  id: string,
  name: string,
  verbalShare: Question[],
  quantShare: Question[],
  prompt: { id: string; promptText: string } | undefined,
): TestDef {
  function sectionsFor(kind: "VERBAL" | "QUANT", share: Question[], secPrefix: string, perQ: number) {
    const tiers = byDifficulty(share);
    // Section 1: up to 6 medium items (fixed pool, mirrors the real GRE's
    // medium first section); the rest of the share feeds Section 2's pools.
    const s1 = tiers.MEDIUM.slice(0, 6);
    const rest = share.filter((q) => !s1.includes(q));
    const pools = byDifficulty(rest);
    const s2Count = Math.max(4, Math.min(6, Math.max(pools.EASY.length, pools.MEDIUM.length, pools.HARD.length)));
    return [
      {
        id: `${secPrefix}-1`,
        kind,
        title: `${kind === "VERBAL" ? "Verbal" : "Quantitative"} Reasoning — Section 1`,
        timeLimitSeconds: s1.length * perQ,
        adaptive: false,
        questions: s1,
      },
      {
        id: `${secPrefix}-2`,
        kind,
        title: `${kind === "VERBAL" ? "Verbal" : "Quantitative"} Reasoning — Section 2 (adaptive)`,
        timeLimitSeconds: s2Count * perQ,
        adaptive: true,
        pools,
        questionCount: s2Count,
      },
    ] satisfies TestDef["sections"];
  }

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
      ...sectionsFor("VERBAL", verbalShare, "verbal", 90),
      ...sectionsFor("QUANT", quantShare, "quant", 105),
    ],
  };
}

// Build one two-section practice test from a share (non-adaptive).
function buildPractice(
  id: string,
  name: string,
  kind: "VERBAL_PRACTICE" | "QUANT_PRACTICE",
  share: Question[],
  perQ: number,
): TestDef {
  const secKind = kind === "VERBAL_PRACTICE" ? "VERBAL" : "QUANT";
  const label = secKind === "VERBAL" ? "Verbal" : "Quantitative";
  const half = Math.ceil(share.length / 2);
  const s1 = share.slice(0, half);
  const s2 = share.slice(half);
  return {
    id,
    name,
    kind,
    sections: [
      { id: "s1", kind: secKind, title: `${label} Reasoning — Section 1`, timeLimitSeconds: s1.length * perQ, adaptive: false, questions: s1 },
      { id: "s2", kind: secKind, title: `${label} Reasoning — Section 2`, timeLimitSeconds: s2.length * perQ, adaptive: false, questions: s2 },
    ],
  };
}

// Assemble the catalog: 2 full-length + 2 verbal practice + 2 quant practice,
// each drawing from a DISJOINT slice of the bank so no two tests share items.
// As the bank grows (run content-gen), the same partitioning yields fuller
// sections automatically; the real GRE's 13-14 per section needs ~55+ items
// per section type per full-length test.
export async function getTestDefs(): Promise<TestDef[]> {
  const [verbalRaw, quantRaw, prompts] = await Promise.all([
    readSeed("verbal.json"),
    readSeed("quant.json"),
    readEssayPrompts(),
  ]);
  const verbal = withIds(verbalRaw, "v");
  const quant = withIds(quantRaw, "q");

  // Half the bank feeds the two full-length tests, half the practice tests.
  const [vFull, vPractice] = partition(verbal, 2);
  const [qFull, qPractice] = partition(quant, 2);
  const [vFull1, vFull2] = partition(vFull, 2);
  const [qFull1, qFull2] = partition(qFull, 2);
  const [vPrac1, vPrac2] = partition(vPractice, 2);
  const [qPrac1, qPrac2] = partition(qPractice, 2);

  return [
    buildFullLength("full-length-1", "Full-Length Mock Test 1", vFull1, qFull1, prompts[0]),
    buildFullLength("full-length-2", "Full-Length Mock Test 2", vFull2, qFull2, prompts[1]),
    buildPractice("verbal-practice-1", "Verbal Practice Test 1", "VERBAL_PRACTICE", vPrac1, 90),
    buildPractice("verbal-practice-2", "Verbal Practice Test 2", "VERBAL_PRACTICE", vPrac2, 90),
    buildPractice("quant-practice-1", "Quantitative Practice Test 1", "QUANT_PRACTICE", qPrac1, 105),
    buildPractice("quant-practice-2", "Quantitative Practice Test 2", "QUANT_PRACTICE", qPrac2, 105),
  ];
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
