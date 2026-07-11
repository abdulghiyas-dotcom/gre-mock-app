# Database Schema

Relational design (PostgreSQL via Prisma). Grouped by domain. `jsonb` is used only where content is genuinely variable-shaped (question payloads, answer keys) — everything else stays relational so scoring/analytics queries remain fast joins, not JSON scans.

## 1. Identity

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?
  name         String?
  role         Role     @default(STUDENT)
  createdAt    DateTime @default(now())

  attempts     TestAttempt[]
}

enum Role {
  STUDENT
  ADMIN        // content authors / question-bank managers
}
```

## 2. Question bank

```prisma
model Passage {
  id        String     @id @default(cuid())
  title     String?
  bodyHtml  String     // rendered left-pane content for RC
  wordCount Int
  questions Question[]
}

model Question {
  id            String       @id @default(cuid())
  section       SectionType  // VERBAL | QUANT
  questionType  QuestionType // TEXT_COMPLETION | SENTENCE_EQUIVALENCE | READING_COMPREHENSION |
                              // QUANT_COMPARISON | MULTIPLE_CHOICE_SINGLE | MULTIPLE_CHOICE_MULTIPLE |
                              // NUMERIC_ENTRY
  skillTag      SkillTag     // e.g. GEOMETRY, DATA_INTERPRETATION, SENTENCE_EQUIVALENCE, ALGEBRA, RC_INFERENCE...
  difficulty    Difficulty   // EASY | MEDIUM | HARD
  passageId     String?
  passage       Passage?     @relation(fields: [passageId], references: [id])

  stem          String       // question text / blanks markup
  choices       Json         // [{ id, label, isCorrect }] — supports single & multi-select uniformly
  correctAnswer Json         // canonical answer key (choice id[s], or numeric value/range for entry Qs)
  explanation   String       // shown on the post-test diagnostic report
  assetUrl      String?      // figure/graph image in S3/R2

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  sectionSlots  SectionQuestion[]
  responses     UserResponse[]

  @@index([section, questionType, difficulty, skillTag])
}

enum SectionType { VERBAL QUANT AWA }
enum Difficulty  { EASY MEDIUM HARD }
enum QuestionType {
  TEXT_COMPLETION
  SENTENCE_EQUIVALENCE
  READING_COMPREHENSION
  QUANT_COMPARISON
  MULTIPLE_CHOICE_SINGLE
  MULTIPLE_CHOICE_MULTIPLE
  NUMERIC_ENTRY
}
enum SkillTag {
  // Verbal
  SENTENCE_EQUIVALENCE, TEXT_COMPLETION, RC_MAIN_IDEA, RC_INFERENCE, RC_STRUCTURE, VOCAB_IN_CONTEXT
  // Quant
  ARITHMETIC, ALGEBRA, GEOMETRY, DATA_INTERPRETATION, WORD_PROBLEMS, QUANT_COMPARISON_LOGIC
}

model EssayPrompt {
  id        String   @id @default(cuid())
  promptText String
  taskType  String   // "Analyze an Issue"
  responses EssayResponse[]
}
```

## 3. Test definitions (assembly layer — decoupled from question content)

```prisma
model TestDefinition {
  id          String       @id @default(cuid())
  name        String       // "GRE Full-Length Mock #3", "Verbal Practice Test #2"
  testType    TestKind     // FULL_LENGTH | VERBAL_PRACTICE | QUANT_PRACTICE
  isAdaptive  Boolean      @default(false) // true only for FULL_LENGTH's Verbal/Quant pair
  sections    SectionDefinition[]
  attempts    TestAttempt[]
}

enum TestKind { FULL_LENGTH VERBAL_PRACTICE QUANT_PRACTICE }

model SectionDefinition {
  id               String      @id @default(cuid())
  testDefinitionId String
  testDefinition   TestDefinition @relation(fields: [testDefinitionId], references: [id])
  orderIndex       Int          // 1 = AWA, 2 = Verbal-1, 3 = Quant-1, 4 = Verbal-2(adaptive), ...
  sectionType      SectionType
  timeLimitSeconds Int
  questionCount    Int
  isAdaptiveSlot   Boolean      @default(false) // true = difficulty resolved at runtime from prior section
  fixedDifficulty  Difficulty?  // set for non-adaptive sections / practice tests
  questionSlots    SectionQuestion[]
}

// Pre-curated pool per (section, difficulty) so runtime assembly is a lookup, not a live query
model SectionQuestion {
  id                  String @id @default(cuid())
  sectionDefinitionId String
  sectionDefinition   SectionDefinition @relation(fields: [sectionDefinitionId], references: [id])
  questionId          String
  question            Question @relation(fields: [questionId], references: [id])
  difficultyPool      Difficulty // which pool this slot belongs to (EASY/MEDIUM/HARD) for adaptive slots
  orderIndex          Int

  @@unique([sectionDefinitionId, questionId, difficultyPool])
}
```

## 4. Attempts, responses, and the pause/resume state machine

```prisma
model TestAttempt {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  testDefinitionId String
  testDefinition   TestDefinition @relation(fields: [testDefinitionId], references: [id])

  status           AttemptStatus @default(NOT_STARTED)
  currentSectionIx Int      @default(0)
  startedAt        DateTime?
  lastActivityAt   DateTime?
  completedAt      DateTime?

  sections         AttemptSection[]
  essayResponses   EssayResponse[]
  score            ScaledScore?

  @@index([userId, status])
}

enum AttemptStatus { NOT_STARTED IN_PROGRESS PAUSED COMPLETED ABANDONED }

model AttemptSection {
  id                   String   @id @default(cuid())
  attemptId            String
  attempt              TestAttempt @relation(fields: [attemptId], references: [id])
  sectionDefinitionId  String
  sectionDefinition    SectionDefinition @relation(fields: [sectionDefinitionId], references: [id])
  orderIndex           Int
  difficultyAssigned   Difficulty?   // filled in for adaptive slots once routing runs
  timeRemainingSeconds Int
  status               SectionStatus @default(NOT_STARTED)
  startedAt            DateTime?
  submittedAt          DateTime?
  rawScore             Int?          // correct-answer count, used for routing + scaling

  responses            UserResponse[]

  @@unique([attemptId, orderIndex])
}

enum SectionStatus { NOT_STARTED IN_PROGRESS SUBMITTED }

model UserResponse {
  id                String   @id @default(cuid())
  attemptSectionId  String
  attemptSection    AttemptSection @relation(fields: [attemptSectionId], references: [id])
  questionId        String
  question          Question @relation(fields: [questionId], references: [id])
  orderIndex        Int            // position within the section, for the review-screen grid
  selectedAnswer    Json?          // choice id[s] or numeric value
  isCorrect         Boolean?
  markedForReview   Boolean  @default(false)
  visitedAt         DateTime?
  answeredAt        DateTime?
  timeSpentSeconds  Int      @default(0)  // pacing analytics

  @@unique([attemptSectionId, questionId])
  @@index([attemptSectionId, orderIndex])
}

model EssayResponse {
  id            String   @id @default(cuid())
  attemptId     String
  attempt       TestAttempt @relation(fields: [attemptId], references: [id])
  promptId      String
  prompt        EssayPrompt @relation(fields: [promptId], references: [id])
  essayText     String
  wordCount     Int
  aiScore       Float?        // 0-6, half-point increments, from LLM-judge scoring job
  aiFeedback    String?
}
```

## 5. Scoring

```prisma
model ScaledScore {
  id             String  @id @default(cuid())
  attemptId      String  @unique
  attempt        TestAttempt @relation(fields: [attemptId], references: [id])
  verbalScaled   Int?    // 130-170
  quantScaled    Int?    // 130-170
  awaScore       Float?  // 0.0-6.0
  verbalRaw      Int?
  quantRaw       Int?
  verbalPercentile Int?
  quantPercentile  Int?
  computedAt     DateTime @default(now())
}

// Raw→scaled lookup, keyed by which difficulty pool the *second* section came from
// (mirrors real GRE score equating: harder Section 2 → more generous conversion curve)
model ScoreConversionTable {
  id                  String     @id @default(cuid())
  sectionType         SectionType   // VERBAL | QUANT
  secondSectionLevel  Difficulty    // difficulty actually administered for section 2
  rawScore            Int
  scaledScore         Int           // 130-170

  @@unique([sectionType, secondSectionLevel, rawScore])
}
```

## 6. Indexes / performance notes

- `Question(section, questionType, difficulty, skillTag)` — the hot path for both test assembly and the diagnostics dashboard's "weak point by subtype" rollup.
- `AttemptSection(attemptId, orderIndex)` unique — guarantees a stable, resumable section order.
- `UserResponse(attemptSectionId, orderIndex)` — powers the review-screen grid and pacing chart in one ordered query.
- `ScoreConversionTable` is a small (~2,000 row) static table seeded once from your equating design — not computed at runtime.

## 7. Pause/Resume mechanics

`TestAttempt.status` + `AttemptSection.timeRemainingSeconds` are the source of truth. On "Exit test" (or an idle timeout), the client flushes current Redis state to Postgres and sets `status = PAUSED`. On resume, the server hydrates the client with: current section's already-fetched question set (re-served from `SectionQuestion`, not re-randomized), the `UserResponse` rows already saved, and `timeRemainingSeconds` — so the countdown resumes exactly where it left off, matching real GRE proctoring rules (no extra time granted on resume).
