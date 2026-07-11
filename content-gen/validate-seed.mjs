// Dependency-free validator for the seed question bank.
// Runs the structural invariants the generation pipeline enforces, so seed
// content can be checked in CI without an API key:
//   node validate-seed.mjs
import { readFileSync } from "node:fs";

const QUESTION_TYPES = new Set([
  "TEXT_COMPLETION",
  "SENTENCE_EQUIVALENCE",
  "READING_COMPREHENSION",
  "QUANT_COMPARISON",
  "MULTIPLE_CHOICE_SINGLE",
  "MULTIPLE_CHOICE_MULTIPLE",
  "NUMERIC_ENTRY",
]);

let errors = 0;
const fail = (ctx, msg) => {
  console.error(`  ✗ ${ctx}: ${msg}`);
  errors++;
};

function validateQuestion(q, ctx) {
  if (!QUESTION_TYPES.has(q.questionType)) fail(ctx, `bad questionType ${q.questionType}`);
  if (!["EASY", "MEDIUM", "HARD"].includes(q.difficulty)) fail(ctx, `bad difficulty ${q.difficulty}`);
  if (!q.stem || typeof q.stem !== "string") fail(ctx, "missing stem");
  if (!q.explanation) fail(ctx, "missing explanation");

  const correct = (q.choices || []).filter((c) => c.isCorrect);

  if (q.questionType === "NUMERIC_ENTRY") {
    if (typeof q.numericAnswer !== "number") fail(ctx, "numeric entry needs a numeric answer");
    if ((q.choices || []).length !== 0) fail(ctx, "numeric entry should have no choices");
  } else if (q.questionType === "SENTENCE_EQUIVALENCE") {
    if (q.choices.length !== 6) fail(ctx, `sentence equivalence needs 6 choices, has ${q.choices.length}`);
    if (correct.length !== 2) fail(ctx, `sentence equivalence needs exactly 2 correct, has ${correct.length}`);
  } else if (q.questionType === "MULTIPLE_CHOICE_MULTIPLE") {
    if (correct.length < 1) fail(ctx, "multi-select needs >= 1 correct");
  } else if (q.questionType === "TEXT_COMPLETION") {
    // single-blank: exactly 1 correct; multi-blank: one correct per blank group (id prefix "i-"/"ii-"/"iii-")
    const groups = new Set(q.choices.map((c) => (c.id.includes("-") ? c.id.split("-")[0] : "single")));
    for (const g of groups) {
      const inGroup = q.choices.filter((c) => (g === "single" ? true : c.id.startsWith(g + "-")));
      const correctInGroup = inGroup.filter((c) => c.isCorrect);
      if (correctInGroup.length !== 1) fail(ctx, `text completion blank '${g}' needs exactly 1 correct, has ${correctInGroup.length}`);
    }
  } else {
    // QC, MC single, RC single-select
    if (correct.length !== 1) fail(ctx, `expected exactly 1 correct, has ${correct.length}`);
  }

  if (q.questionType === "READING_COMPREHENSION" && !q.passageBodyHtml) {
    fail(ctx, "reading comprehension must have a passage");
  }
}

function run(file, kind) {
  const items = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  console.log(`\n${file}: ${items.length} ${kind}`);
  items.forEach((item, i) => {
    if (kind === "questions") validateQuestion(item, `${file}[${i}] ${item.questionType}`);
    else {
      if (!item.promptText) fail(`${file}[${i}]`, "essay prompt missing promptText");
      if (item.taskType !== "Analyze an Issue") fail(`${file}[${i}]`, `unexpected taskType ${item.taskType}`);
    }
  });
  return items.length;
}

const v = run("./seed/verbal.json", "questions");
const q = run("./seed/quant.json", "questions");
const a = run("./seed/awa-prompts.json", "essay prompts");

console.log(`\nTotal: ${v + q} questions + ${a} essay prompts`);
if (errors) {
  console.error(`\nFAILED with ${errors} error(s).`);
  process.exit(1);
}
console.log("All seed content passed structural validation. ✓");
