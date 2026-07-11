# GRE General Mock Test Platform

A web platform that replicates the official ETS GRE General Test experience: section-level adaptive Verbal/Quant scoring, on-screen calculator, split-screen Reading Comprehension, pause/resume test sessions, and a post-test diagnostic dashboard.

## Test Inventory

- **6 Full-Length Mock Tests** — AWA (1 essay, 30 min) + 2 Verbal sections (27 Q / 41 min) + 2 Quant sections (27 Q / 47 min), with section-level adaptivity between Verbal 1→2 and Quant 1→2.
- **5 Independent Verbal Practice Tests** — 2 sections each, non-adaptive.
- **5 Independent Quantitative Practice Tests** — 2 sections each, non-adaptive.

## Documentation

| Doc | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Tech stack, system design, why each choice was made |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Full relational schema (question bank, attempts, responses, scoring) |
| [`docs/SCORING_ENGINE.md`](docs/SCORING_ENGINE.md) | Section-level adaptive routing + raw→scaled (130–170) conversion |
| [`docs/UI_COMPONENTS.md`](docs/UI_COMPONENTS.md) | Component tree that clones the ETS POWERPREP-style interface |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased build plan, MVP → launch |

## Status

Planning phase — schema and architecture defined, implementation not yet started. See `docs/ROADMAP.md` Phase 0 for the first concrete engineering tasks.
