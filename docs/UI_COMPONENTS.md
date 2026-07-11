# UI Component Outline

Modeled directly on ETS's POWERPREP / live test-day interface. Component tree for the Next.js app:

```
app/
  test/[attemptId]/
    layout.tsx                      → TestShell
    page.tsx                        → SectionRouter

components/test-engine/
  TestShell.tsx                     → top chrome: exit icon, section/time label, "Help" button
  TimerDisplay.tsx                  → countdown, click-to-hide (ETS lets you hide the clock)
  SectionIntroScreen.tsx            → "Section X of Y — directions" screen before each timed section
  QuestionRenderer.tsx              → polymorphic dispatcher by Question.questionType:
    ├─ TextCompletionQuestion.tsx        (1-3 blanks, dropdown-per-blank layout)
    ├─ SentenceEquivalenceQuestion.tsx   (6 choices, select exactly 2)
    ├─ ReadingComprehensionQuestion.tsx  (split-pane: PassagePane left, QuestionPane right, independently scrollable)
    ├─ QuantComparisonQuestion.tsx       (Quantity A / Quantity B / 4 fixed choices)
    ├─ MultipleChoiceSingle.tsx
    ├─ MultipleChoiceMultiple.tsx        ("select all that apply", no partial credit)
    └─ NumericEntryQuestion.tsx          (single input box or fraction numerator/denominator pair)
  NavigationBar.tsx                 → Back | Mark for Review | Next | Review (bottom bar, fixed)
  ReviewScreen.tsx                  → overlay/grid: question # x answered/unanswered/marked-for-review status,
                                        click any cell to jump directly to that question
  ExitTestDialog.tsx                → confirm exit → triggers pause checkpoint
  Calculator/
    CalculatorWidget.tsx            → draggable, four-function, appears only in Quant sections
    CalculatorButtonPad.tsx
    CalculatorDisplay.tsx
  AwaEditor.tsx                     → plain-text essay box, word count, cut/paste/undo (no rich formatting,
                                        matching ETS's restricted editor)

components/dashboard/
  ScoreSummaryCard.tsx              → Verbal 130-170, Quant 130-170, AWA 0-6, side by side
  SkillBreakdownChart.tsx           → accuracy % bar chart per skillTag, weakest-first
  PacingTimeline.tsx                → per-question time-spent strip chart vs. target pace line
  AnswerReviewList.tsx              → every question, your answer vs. correct answer, expandable explanation
  ScoreTrendChart.tsx               → scaled score across attempts over time

components/test-catalog/
  TestCard.tsx                      → mock test / practice test tile: name, status (not started/in progress/
                                        paused/completed), "Resume" vs "Start" CTA
  TestCatalogGrid.tsx               → the 6 full-length + 5 verbal + 5 quant tests, grouped by type
```

## Key interaction details to replicate faithfully

- **Timer**: top-right, can be toggled hidden/shown (ETS behavior), turns red/warns at 5 minutes remaining.
- **Mark for Review**: toggles a flag icon next to the question number in `ReviewScreen`'s grid; does not block navigation.
- **Review screen**: reachable from `NavigationBar` at any point mid-section, shows a full grid (question number, answered/unanswered/marked) and lets the user jump to any question — mirrors ETS's "Review" screen exactly, including that it's only navigable *within* the current section (can't go back to a prior submitted section).
- **Reading Comprehension split screen**: `PassagePane` and `QuestionPane` scroll independently; passage stays pinned when navigating between questions attached to the same passage.
- **Calculator**: only rendered for Quant sections, draggable but non-resizable, supports `+ − × ÷ √ +/- . = C` and a memory (M+/M-/MR/MC) to match ETS's on-screen calculator, not a full scientific one.
- **Section boundaries are one-way**: once a section is submitted, `NavigationBar`/`ReviewScreen` for that section become read-only; there is no "go back to Section 1" affordance during the live test, matching real GRE rules.
- **AWA editor**: intentionally minimal — no spellcheck highlighting beyond basic browser default, no rich text, to match the plain editor test-takers actually get.

## State ownership

- `TestShell` owns the Zustand test-session store (current section, question index, per-question response map, timer) — hydrated once on section load, written to on every interaction, and debounced-synced to the backend (see `ARCHITECTURE.md` §2).
- `QuestionRenderer` variants are pure/controlled components: they receive the current question + current answer value + an `onChange` callback, and hold no state of their own — keeps the review/resume logic in one place instead of scattered across question types.
