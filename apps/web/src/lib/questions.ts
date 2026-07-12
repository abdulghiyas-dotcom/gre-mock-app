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
  // Exact real-GRE section sizes (post-2023 shortened format): Section 1 is
  // 12 questions, Section 2 is 15 questions (27 total per subject). Times
  // match ETS's official per-subject allocations. Capped at these targets
  // but never promise more than the bank has for a given share.
  const SECTION_1_TARGET = 12;
  const SECTION_2_TARGET = 15;
  const SECTION_TIMES: Record<"VERBAL" | "QUANT", { s1: number; s2: number }> = {
    VERBAL: { s1: 18 * 60, s2: 23 * 60 },
    QUANT: { s1: 21 * 60, s2: 26 * 60 },
  };

  function sectionsFor(kind: "VERBAL" | "QUANT", share: Question[], secPrefix: string) {
    const tiers = byDifficulty(share);
    // Section 1: fixed medium-difficulty pool (mirrors the real GRE's medium
    // first section); the rest of the share feeds Section 2's pools.
    const s1 = tiers.MEDIUM.slice(0, SECTION_1_TARGET);
    const rest = share.filter((q) => !s1.includes(q));
    const pools = byDifficulty(rest);
    const s2Count = Math.max(4, Math.min(SECTION_2_TARGET, Math.max(pools.EASY.length, pools.MEDIUM.length, pools.HARD.length)));
    const times = SECTION_TIMES[kind];
    return [
      {
        id: `${secPrefix}-1`,
        kind,
        title: `${kind === "VERBAL" ? "Verbal" : "Quantitative"} Reasoning — Section 1`,
        timeLimitSeconds: times.s1,
        adaptive: false,
        questions: s1,
      },
      {
        id: `${secPrefix}-2`,
        kind,
        title: `${kind === "VERBAL" ? "Verbal" : "Quantitative"} Reasoning — Section 2 (adaptive)`,
        timeLimitSeconds: times.s2,
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
      ...sectionsFor("VERBAL", verbalShare, "verbal"),
      ...sectionsFor("QUANT", quantShare, "quant"),
    ],
  };
}

// Build one two-section practice test from a share (non-adaptive).
function buildPractice(
  id: string,
  name: string,
  kind: "VERBAL_PRACTICE" | "QUANT_PRACTICE",
  share: Question[],
): TestDef {
  const secKind = kind === "VERBAL_PRACTICE" ? "VERBAL" : "QUANT";
  const label = secKind === "VERBAL" ? "Verbal" : "Quantitative";
  const times =
    secKind === "VERBAL" ? { s1: 18 * 60, s2: 23 * 60 } : { s1: 21 * 60, s2: 26 * 60 };
  // Mirror one full subject's worth of the real GRE: 12 in Section 1, 15 in
  // Section 2 (27 total), capped by whatever the share actually has.
  const s1Count = Math.min(12, share.length);
  const s2Count = Math.min(15, Math.max(0, share.length - s1Count));
  const s1 = share.slice(0, s1Count);
  const s2 = share.slice(s1Count, s1Count + s2Count);
  return {
    id,
    name,
    kind,
    sections: [
      { id: "s1", kind: secKind, title: `${label} Reasoning — Section 1`, timeLimitSeconds: times.s1, adaptive: false, questions: s1 },
      { id: "s2", kind: secKind, title: `${label} Reasoning — Section 2`, timeLimitSeconds: times.s2, adaptive: false, questions: s2 },
    ],
  };
}

// Assemble the catalog: N_FULL full-length + N_VERBAL_PRACTICE verbal-only +
// N_QUANT_PRACTICE quant-only tests, each drawing from a DISJOINT slice of the
// bank so no two tests share items. Each bank is partitioned ONCE into
// (N_FULL + N_practice) shares — flatter than nested halving, so rounding
// loss doesn't compound and every share gets the largest possible slice.
// As the bank grows (run content-gen), bump these counts toward the 6
// full-length + 5 verbal + 5 quant target; the partitioning yields fuller
// sections automatically as more content becomes available.
const N_FULL = 6;
const N_VERBAL_PRACTICE = 5;
const N_QUANT_PRACTICE = 5;

export async function getTestDefs(): Promise<TestDef[]> {
  const prompts = readEssayPrompts();
  const verbal = withIds(readSeed(verbalRaw), "v");
  const quant = withIds(readSeed(quantRaw), "q");

  const verbalShares = partition(verbal, N_FULL + N_VERBAL_PRACTICE);
  const quantShares = partition(quant, N_FULL + N_QUANT_PRACTICE);
  const vFull = verbalShares.slice(0, N_FULL);
  const vPrac = verbalShares.slice(N_FULL);
  const qFull = quantShares.slice(0, N_FULL);
  const qPrac = quantShares.slice(N_FULL);

  const fullLength = vFull.map((vShare, i) =>
    buildFullLength(
      `full-length-${i + 1}`,
      `Full-Length Mock Test ${i + 1}`,
      vShare,
      qFull[i],
      prompts[i],
    ),
  );
  const verbalPractice = vPrac.map((share, i) =>
    buildPractice(
      `verbal-practice-${i + 1}`,
      `Verbal Practice Test ${i + 1}`,
      "VERBAL_PRACTICE",
      share,
    ),
  );
  const quantPractice = qPrac.map((share, i) =>
    buildPractice(
      `quant-practice-${i + 1}`,
      `Quantitative Practice Test ${i + 1}`,
      "QUANT_PRACTICE",
      share,
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
