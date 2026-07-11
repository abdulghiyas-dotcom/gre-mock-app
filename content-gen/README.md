# content-gen

LLM question-generation pipeline for the GRE mock platform. Implements the design in [`../docs/CONTENT_GENERATION.md`](../docs/CONTENT_GENERATION.md): **generate → solve-blind → critique → validate**, using Claude Fable 5 (Anthropic's most capable model) with a server-side fallback to Opus 4.8 for refusals.

## What's here

| Path | What it is |
|---|---|
| `src/schema.ts` | Zod + JSON-Schema definitions matching the `Question` DB model |
| `src/prompts.ts` | System/user prompts for each pipeline stage |
| `src/pipeline.ts` | The three model stages + key-agreement reconciliation + retry |
| `src/blueprint.ts` | Section blueprints → concrete question specs |
| `src/run.ts` | Batch runner; writes accepted items to `seed/generated.json` |
| `validate-seed.mjs` | Dependency-free structural validator (runs in CI, no API key) |
| `seed/verbal.json` | Verified, original Verbal seed questions |
| `seed/quant.json` | Verified, original Quant seed questions (answer keys computed) |
| `seed/awa-prompts.json` | Original ETS-format "Analyze an Issue" essay prompts |

## Running the generator

Requires an Anthropic API key (or an `ant auth login` profile). Claude Fable 5 also requires **30-day data retention** on your org — it is not available under zero-data-retention:

```bash
npm install
ANTHROPIC_API_KEY=sk-... npm run generate
```

Refusals from Fable 5's safety classifiers are handled automatically via a server-side fallback to Opus 4.8 (enabled in `pipeline.ts`); the pipeline only errors if the whole chain refuses.

This expands the blueprint, runs each spec through the pipeline, and writes accepted questions plus a rejection log to `seed/`. For production volume (1,500+ items), switch `run.ts` to the Message Batches API for 50% cost — noted inline.

## Validating content (no API key needed)

```bash
node validate-seed.mjs
```

Checks every seed item for: valid type/difficulty, exactly one correct key (two for Sentence Equivalence; one per blank for Text Completion), numeric-entry answer present, and a passage attached to every Reading Comprehension item.

## Provenance & licensing

- All seed questions and reading passages are **original**, authored for this project — no real ETS/GRE items are reproduced.
- The essay prompts follow ETS's public "Analyze an Issue" task **format** but are original claims. If you want to use ETS's actual published Issue pool, confirm the licensing terms with ETS first — that pool is ETS's copyrighted material and is not included here.
- Generated questions are hypotheses about difficulty until calibrated against real user p-values (see `../docs/CONTENT_GENERATION.md` §Calibration). Human review is required before any item reaches a test-taker.
