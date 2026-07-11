# Architecture

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14 (App Router) + TypeScript + Tailwind CSS** | SSR for dashboards/marketing pages, CSR for the test-taking engine, one deploy target, huge ecosystem. Tailwind lets us hand-tune spacing/typography to pixel-match ETS's UI. |
| Client state | **Zustand** (test-session store) | The test engine must feel instant — no round trip to render the next question. Zustand holds the current section's questions, answers, timer, and marks in memory; network calls are fire-and-forget writes, not blocking reads. |
| API layer | **tRPC** (colocated with Next.js) | End-to-end type safety between the question bank / scoring engine and the client, no REST boilerplate, works great in a small-team monorepo. Fall back to a separate NestJS service only if you outgrow a single Next.js deployment. |
| Database | **PostgreSQL** | Question bank, attempts, and responses are deeply relational (questions↔passages↔skill tags, attempts↔sections↔responses). Postgres also gives us `jsonb` for flexible question-content payloads without losing relational integrity elsewhere. |
| ORM | **Prisma** | Type-safe queries matching tRPC, migrations as code. |
| Session/timer cache | **Redis** | Active-attempt state (current question index, per-section countdown, autosave heartbeat) lives here for low-latency reads/writes, then is checkpointed to Postgres every ~10–15s and on every question navigation, so a refresh or crash never loses more than a few seconds of state and a paused test resumes exactly where it left off. |
| Auth | **NextAuth.js (Auth.js)** with email/password + OAuth | Simple, self-hosted, no vendor lock-in for a product that will store sensitive test-performance data. |
| File/asset storage | **S3-compatible bucket (Cloudflare R2 or AWS S3)** | Question images (geometry figures, graphs) and passage assets. |
| Background jobs | **BullMQ (Redis-backed)** | AWA essay scoring (if using an LLM judge), score-report generation, nightly analytics rollups. |
| Hosting | **Vercel** (Next.js app) + **Supabase or Railway** (managed Postgres + Redis) | Fastest path to a lag-free MVP; swap for self-managed infra later if scale demands it. |
| Testing | **Vitest** (unit) + **Playwright** (E2E, including a timed-section simulation) | The timer/navigation/adaptive-routing logic is exactly the kind of stateful flow that regresses silently without E2E coverage. |

## 2. Why a "client-heavy, thin-write" test engine

The single biggest UX risk in a GRE clone is **input lag on Next/Back/answer-select** — the real ETS software feels instant. Design rule: **the entire current section's questions are fetched once** when the section starts (already resolved to the correct difficulty tier for adaptive sections) and held in client memory. Every user action (select answer, mark for review, navigate) updates local state immediately and is only *mirrored* to the backend asynchronously. The backend is never on the critical path for rendering the next question.

Autosave contract:
- On every answer change / navigation / mark-for-review toggle → debounced write to Redis (≤300ms).
- Every 15s and on section submit → checkpoint Redis state to Postgres (`attempt_sections`, `user_responses`).
- On resume, hydrate client state from Postgres (or Redis if the session is still warm).

## 3. High-level system diagram

```
┌─────────────────────────┐
│  Next.js Client (React) │
│  - Test Engine (Zustand)│
│  - Calculator widget    │
│  - Review overlay       │
└───────────┬──────────────┘
            │ tRPC (typed RPC over HTTP)
┌───────────▼──────────────┐
│  Next.js Server / tRPC   │
│  - authRouter            │
│  - testRouter (start/    │
│    resume/submit)        │
│  - adaptiveRouter        │
│  - scoringRouter         │
│  - questionBankRouter    │
└──────┬──────────┬────────┘
       │          │
┌──────▼───┐  ┌───▼───────┐      ┌────────────────┐
│ Postgres │  │  Redis    │      │ S3 / R2 assets │
│ (Prisma) │  │ (session, │      │ (images, SVGs) │
│          │  │  timers)  │      └────────────────┘
└──────────┘  └───────────┘
       │
┌──────▼───────────┐
│ BullMQ workers    │
│ - AWA scoring     │
│ - report rollups  │
└───────────────────┘
```

## 4. Adaptive test assembly (server-side, not client-side)

Section 2 must never be visible to the client before Section 1 is scored, or a savvy user could inspect network payloads to infer difficulty. Flow:

1. Client requests Section 1 questions for the attempt → server resolves from `question_bank` (fixed medium-difficulty pool) and returns them.
2. Client submits Section 1 responses → server scores raw correct count, applies the routing rule (see `SCORING_ENGINE.md`), writes `attempt_sections.difficulty_assigned` for Section 2, and **only then** returns the Section 2 question set.
3. This keeps the adaptive branch server-authoritative and un-inspectable from the client.

## 5. Non-functional requirements this stack satisfies

- **Lag-free UI**: client-heavy engine, no per-question network round trip.
- **Pause/resume**: Redis + Postgres checkpointing, attempt status machine (`not_started → in_progress → paused → completed`).
- **Auditability**: every response row stores `time_spent_seconds`, `visited_at`, `answered_at`, `marked_for_review` for the pacing/diagnostics dashboard.
- **Content scalability**: question bank is decoupled from test assembly, so new mock tests are just new rows in `test_definitions` + `section_definitions` referencing pooled questions.
