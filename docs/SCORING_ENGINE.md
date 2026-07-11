# Scoring & Adaptive Logic

## 1. Section-level adaptivity (the real GRE's "multistage" model)

The GRE General Test is **not** question-by-question adaptive — it adapts once, at the section boundary. Section 1 of Verbal (or Quant) is a fixed medium-difficulty set. Your performance on it routes you into one of three difficulty pools for Section 2. This is what we replicate:

```
Verbal/Quant Section 1 (fixed MEDIUM pool, 13-14 Qs)
        │
        ▼  server scores rawScore = count(isCorrect)
┌───────────────────────────────────────────┐
│  routing rule (config, not hardcoded)      │
│  rawScore >= HARD_THRESHOLD   → HARD pool  │
│  rawScore >= MEDIUM_THRESHOLD → MEDIUM pool│
│  else                          → EASY pool │
└───────────────────────────────────────────┘
        │
        ▼
Verbal/Quant Section 2 (13-14 Qs pulled from the assigned difficulty pool)
```

Because ETS doesn't publish exact routing cutoffs, thresholds are **configurable**, not hardcoded, so they can be tuned against known score-percentile distributions as you calibrate your question bank:

```ts
// packages/scoring/adaptiveRouting.ts
export const ADAPTIVE_THRESHOLDS = {
  VERBAL: { hardMin: 10, mediumMin: 6 },  // out of 13 first-section questions
  QUANT:  { hardMin: 10, mediumMin: 6 },  // out of 13 first-section questions
} as const;

export function routeDifficulty(section: 'VERBAL' | 'QUANT', rawScore: number): Difficulty {
  const t = ADAPTIVE_THRESHOLDS[section];
  if (rawScore >= t.hardMin) return 'HARD';
  if (rawScore >= t.mediumMin) return 'MEDIUM';
  return 'EASY';
}
```

This runs **server-side only**, inside the tRPC mutation that handles Section-1 submission, before Section 2's questions are ever sent to the client (see `ARCHITECTURE.md` §4).

Non-adaptive tests (the 5+5 targeted practice tests) skip routing entirely — both sections are pulled from a fixed `fixedDifficulty` pool per `SectionDefinition`.

## 2. Raw → Scaled score conversion (130–170)

Real GRE scoring equates the raw score against *which* second-section difficulty you received, so two test-takers who get the same raw total across both sections can get different scaled scores if one faced a harder Section 2. We reproduce this with `ScoreConversionTable`, keyed by `(sectionType, secondSectionLevel, rawScore)`:

```
totalRaw = correctCount(Section1) + correctCount(Section2)   // 0-27
scaled   = ScoreConversionTable.lookup(sectionType, difficultyAssignedToSection2, totalRaw)
```

Seed this table with a monotonic curve per difficulty tier, e.g.:

| secondSectionLevel | rawScore range | scaledScore range |
|---|---|---|
| HARD | 27 → 0 | 170 → 130, generous slope (harder section = higher ceiling for same raw) |
| MEDIUM | 27 → 0 | 170 → 130, standard slope |
| EASY | 27 → 0 | 170 → 130, capped ceiling (e.g. max ~158-160 even at raw 27), steeper slope |

Because this is a mock platform (not ETS's live equating data), start with a **hand-authored monotonic curve per tier** (spreadsheet → CSV → seed script) and refine it once you have real user data to calibrate percentiles against. This keeps the *mechanism* (section-aware equating) faithful even before the exact curve is empirically tuned.

## 3. AWA (essay) scoring

Two viable paths, can ship either first and add the other later:
1. **Rubric-guided LLM judge** (recommended for MVP): send the essay + prompt + official 0–6 ETS scoring rubric to an LLM with structured output (score + per-criterion feedback), run as a BullMQ background job so it doesn't block section submission. Store in `EssayResponse.aiScore/aiFeedback`.
2. **Manual/instructor scoring** for a tutoring-service context: queue for human review, same storage shape.

## 4. Diagnostic dashboard computations

All derived from `UserResponse` + `Question.skillTag`, no extra tables needed:

- **Weak points by subtype**: `GROUP BY skillTag` → accuracy % per tag across all the user's attempts, sorted ascending.
- **Pacing**: `timeSpentSeconds` per question vs. the section's average allowed time (`timeLimitSeconds / questionCount`); flag questions where `timeSpentSeconds` is >1.5x that average as "over-paced."
- **Answer explanations**: straight join from `UserResponse.questionId → Question.explanation`, shown per question on the post-test review screen, gated until the attempt is `COMPLETED`.
- **Score trend**: `ScaledScore` rows across a user's attempts, charted over time.
