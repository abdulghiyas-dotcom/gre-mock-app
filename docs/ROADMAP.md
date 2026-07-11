# Development Roadmap: MVP → Launch

## Phase 0 — Foundations (repo, infra, auth)
- Turborepo scaffold: `apps/web` (Next.js), `packages/db` (Prisma schema from `DATABASE_SCHEMA.md`), `packages/scoring` (adaptive routing + conversion logic), `packages/ui` (shared components).
- Postgres + Redis provisioned (Supabase/Railway for MVP).
- Auth (NextAuth.js): sign up, login, session.
- CI: typecheck + lint + Vitest on every push.
- **Exit criteria**: authenticated user can log in and see an empty test catalog page.

## Phase 1 — Question bank & content pipeline
- Prisma models for `Question`, `Passage`, `EssayPrompt` migrated.
- Admin-only content entry: start with a JSON/CSV bulk-import script (fastest to populate ~1,500+ questions needed for 6 full-length + 10 practice tests without hand-building a CMS yet); a proper admin UI can come in Phase 6.
- Seed script for `ScoreConversionTable` (hand-authored curves per §2 of `SCORING_ENGINE.md`).
- Validation: every question has ≥1 correct answer, RC questions have a linked passage, choices array matches `questionType` shape.
- **Exit criteria**: question bank populated for at least one full-length test's worth of content, passes validation.

## Phase 2 — Test assembly + non-adaptive engine (single section MVP)
- `SectionDefinition` / `SectionQuestion` wired for one Verbal practice test (2 fixed-difficulty sections, no adaptivity yet — start simple).
- Test engine: `TestShell`, `QuestionRenderer` for Text Completion + Sentence Equivalence + RC only, `NavigationBar` (Next/Back/Mark), timer.
- Zustand session store + debounced autosave to Redis → Postgres checkpoint.
- **Exit criteria**: a user can start, take, and submit one full Verbal practice test end-to-end, untimed-out.

## Phase 3 — Review screen, pause/resume, remaining question types
- `ReviewScreen` overlay with jump-to-question.
- Pause/exit → `AttemptStatus.PAUSED`, resume flow rehydrates from Postgres.
- Add Quant question types (`QuantComparison`, `NumericEntry`, MC single/multi) + `CalculatorWidget`.
- **Exit criteria**: a user can pause mid-section, close the tab, come back later, and resume with the correct time remaining and prior answers intact.

## Phase 4 — Adaptive routing + full-length mock assembly
- Implement `routeDifficulty()` server-side per `SCORING_ENGINE.md` §1; wire into the Section-1-submit tRPC mutation so Section 2 is only assembled/served after scoring.
- Build all 6 full-length `TestDefinition`s (AWA + Verbal-1/2 + Quant-1/2) with adaptive slots.
- `SectionIntroScreen` between sections, one-way section boundaries (no going back).
- **Exit criteria**: a user completing Verbal Section 1 with a high raw score is provably routed to the HARD Section-2 pool (test this with an E2E test that forces known answers).

## Phase 5 — Scoring engine + AWA
- `ScaledScore` computation from `ScoreConversionTable` on attempt completion.
- AWA editor + BullMQ job for LLM-rubric essay scoring.
- Immediate score screen at test end (Verbal/Quant 130-170, AWA 0-6).
- **Exit criteria**: completing any full-length test produces a scaled score within 5 seconds of submission.

## Phase 6 — Diagnostic dashboard
- `SkillBreakdownChart`, `PacingTimeline`, `AnswerReviewList`, `ScoreTrendChart`.
- Explanation content authored/attached for every question in the bank.
- **Exit criteria**: post-test report shows accuracy by skill tag, pacing outliers, and full answer explanations.

## Phase 7 — UI fidelity pass + remaining practice tests
- Pixel/interaction pass against real ETS screenshots (spacing, fonts, button placement, timer color states).
- Populate remaining 5 Verbal + 5 Quant practice tests and remaining full-length tests' question pools.
- Admin CMS for question entry (replaces Phase 1's CSV import) if content velocity demands it.
- **Exit criteria**: all 16 tests (6 full-length + 5 Verbal + 5 Quant) are fully populated and playable.

## Phase 8 — Hardening & launch
- Playwright E2E suite covering: timed section auto-submit on timeout, pause/resume, adaptive routing, review-screen navigation, calculator correctness.
- Load test the section-submit path (this is the moment routing + scoring both fire).
- Accessibility pass (keyboard navigation for the entire test flow — real ETS software supports this).
- **Exit criteria**: green E2E suite, load test passes at target concurrent-user count, launch.

## Suggested sequencing note

Phases 2-3 deliberately ship the **non-adaptive** engine before adaptive routing (Phase 4). This lets you validate the entire question-rendering/timer/autosave/resume stack — the highest-risk, highest-surface-area code — against the *simpler* of the two test types (independent practice tests) before layering in server-side adaptive branching on top of it.
