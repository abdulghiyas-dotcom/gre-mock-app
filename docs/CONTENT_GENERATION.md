# AI Content Generation Pipeline

The platform's questions are **LLM-generated, then verified** — not hand-written, not scraped, and never accepted from a single model pass. The goal is content that matches real GRE difficulty, register, and answer-key rigor. This document defines the pipeline that gets there.

## Why not one prompt

A single "write a GRE question" call produces plausible-looking but subtly broken items: two defensible correct answers, a "hard" question that's actually easy, vocabulary off the GRE register, or an arithmetic error in the answer key. At ~1,500+ questions those defects compound and destroy user trust. Quality comes from a **generate → solve-blind → critique → human-gate → calibrate** pipeline.

## Model & API configuration

| Concern | Choice |
|---|---|
| Model | **Claude Opus 4.8** (`claude-opus-4-8`) — most capable; question authoring is correctness-sensitive |
| Reasoning | Adaptive thinking on; `effort: "high"` (use `xhigh` for Hard-tier Quant) |
| Output shape | **Structured outputs** (`output_config.format`) with a JSON schema matching the `Question` model, so generated items drop straight into the DB |
| Throughput | **Message Batches API** (50% cost; generation isn't latency-sensitive) |
| Quant verification | **Code execution tool** — actually compute the answer rather than trusting the model's arithmetic |

## Pipeline stages

```
1. GENERATE
   Opus 4.8 writes one question to spec (section, questionType, skillTag,
   target difficulty) + a rationale for WHY it's that difficulty.
   Structured output conforms to the Question schema. Few-shot anchored
   with verified exemplars (see Calibration).
        │
2. SOLVE-BLIND   ← highest-value check
   A SEPARATE Opus 4.8 call sees ONLY stem + choices (no answer key) and
   must choose an answer with justification. If it disagrees with the
   generator's key, or reports more than one defensible answer, the item
   is flagged. This is what catches multi-correct-answer defects.
        │
3. CRITIQUE
   Opus 4.8 as adversarial reviewer against a GRE-authenticity rubric:
   exactly one correct answer? distractors plausible-but-wrong? vocabulary
   in GRE register? no ambiguity? (RC) does the passage actually support
   the keyed inference? Returns pass/fail + reasons.
        │
4. HUMAN GATE
   A person reviews only items that survive 1–3. Smallest possible human
   step; rejects here feed back into prompt tuning.
        │
5. CALIBRATE (post-launch, continuous)
   Difficulty is a CLAIM until users answer. Collect the item p-value
   (fraction answering correctly), reconcile actual vs. labeled difficulty,
   and re-tier items whose empirical p-value contradicts their label.
```

Stages 2 and 3 turn "looks plausible" into "actually reliable." The solve-blind stage is non-negotiable — it is the only cheap way to catch questions with more than one right answer before a user does.

## Calibrating difficulty to the real GRE

Difficulty out of the generator is a hypothesis. Ground it two ways:

- **Anchoring (pre-launch):** maintain ~20–30 verified exemplar questions per `skillTag` at known difficulty. Use them as few-shot examples in the generation prompt and as comparison points in the critique stage.
- **Empirical p-value (post-launch):** the fraction of test-takers who answer an item correctly is its true difficulty. Feed it back into `Question.difficulty`, and over time into `ScoreConversionTable`. The adaptive routing (`SCORING_ENGINE.md` §1) and 130–170 scaling are only as honest as this loop — a Hard-pool item that 80% of strong testers ace is mislabeled and must be re-tiered.

## Guardrails

- **Originality / copyright:** prompt explicitly for original items; never reproduce real ETS questions. RC passages must be LLM-authored or drawn from public-domain sources.
- **Numeric verification for Quant:** compute every Quant answer with the code-execution tool; store the verified value as `correctAnswer`.
- **Explanations in the same pass:** every question is generated with its worked explanation (feeds the diagnostic dashboard's answer-review view).
- **Schema validation:** reject any generated item that fails the Phase-1 validation rules in `ROADMAP.md` (≥1 correct answer, RC linked to a passage, choices shape matches `questionType`).

## Where this fits the roadmap

This pipeline is the engine behind `ROADMAP.md` Phase 1 (Question bank & content pipeline). Build the generate→solve-blind→critique→validate stages as a batch job in `packages/scoring` (or a dedicated `packages/content-gen`), run it to populate one full-length test's worth of content, human-gate that batch, then scale to all 16 tests in Phase 7. The calibration loop (stage 5) comes online with the diagnostic dashboard in Phase 6, once real response data exists.
