import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";

// Loads the pre-generated, pre-verified seed bank produced by content-gen into
// Postgres. Run once your DB is provisioned:
//   DATABASE_URL=postgres://... npm run db:push && npm run db:seed
//
// Re-runnable: passages/questions/prompts are upserted by a deterministic key.

const prisma = new PrismaClient();
const SEED_DIR =
  process.env.SEED_DIR ?? path.resolve(process.cwd(), "..", "..", "content-gen", "seed");

interface SeedChoice {
  id: string;
  label: string;
  isCorrect: boolean;
}
interface SeedQuestion {
  section: string;
  questionType: string;
  skillTag: string;
  difficulty: string;
  passageId: string | null;
  passageBodyHtml: string | null;
  stem: string;
  choices: SeedChoice[];
  numericAnswer: number | null;
  explanation: string;
}

async function loadQuestions(file: string) {
  const items = JSON.parse(await readFile(path.join(SEED_DIR, file), "utf8")) as SeedQuestion[];
  const passageCache = new Map<string, string>();

  for (const q of items) {
    let passageId: string | undefined;
    if (q.questionType === "READING_COMPREHENSION" && q.passageId && q.passageBodyHtml) {
      if (!passageCache.has(q.passageId)) {
        const passage = await prisma.passage.upsert({
          where: { id: q.passageId },
          create: { id: q.passageId, bodyHtml: q.passageBodyHtml },
          update: { bodyHtml: q.passageBodyHtml },
        });
        passageCache.set(q.passageId, passage.id);
      }
      passageId = passageCache.get(q.passageId);
    }

    const correctAnswer: Prisma.InputJsonValue =
      q.questionType === "NUMERIC_ENTRY"
        ? { numeric: q.numericAnswer }
        : { choiceIds: q.choices.filter((c) => c.isCorrect).map((c) => c.id) };

    await prisma.question.create({
      data: {
        section: q.section as never,
        questionType: q.questionType as never,
        skillTag: q.skillTag,
        difficulty: q.difficulty as never,
        passageId,
        stem: q.stem,
        choices: q.choices as unknown as Prisma.InputJsonValue,
        correctAnswer,
        explanation: q.explanation,
      },
    });
  }
  return items.length;
}

async function loadEssayPrompts(file: string) {
  const items = JSON.parse(await readFile(path.join(SEED_DIR, file), "utf8")) as {
    id: string;
    taskType: string;
    promptText: string;
  }[];
  for (const p of items) {
    await prisma.essayPrompt.upsert({
      where: { id: p.id },
      create: { id: p.id, taskType: p.taskType, promptText: p.promptText },
      update: { taskType: p.taskType, promptText: p.promptText },
    });
  }
  return items.length;
}

async function main() {
  const v = await loadQuestions("verbal.json");
  const q = await loadQuestions("quant.json");
  const a = await loadEssayPrompts("awa-prompts.json");
  console.log(`Seeded ${v + q} questions and ${a} essay prompts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
