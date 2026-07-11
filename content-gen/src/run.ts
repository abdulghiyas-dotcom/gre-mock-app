import { writeFileSync, mkdirSync } from "node:fs";
import { runOne, type PipelineOutcome } from "./pipeline.js";
import { VERBAL_SECTION, QUANT_SECTION, expand } from "./blueprint.js";

// Batch runner: expands the blueprint into specs, runs each through
// generate -> solve-blind -> critique, and writes accepted items to seed JSON
// plus a rejection log for prompt tuning. Requires ANTHROPIC_API_KEY (or an
// `ant auth login` profile) in the environment.
//
//   ANTHROPIC_API_KEY=sk-... npm run generate
//
// For production volume, swap the sequential loop for the Message Batches API
// (50% cost) — see docs/CONTENT_GENERATION.md.

async function main() {
  const specs = [...expand(VERBAL_SECTION), ...expand(QUANT_SECTION)];
  const accepted: PipelineOutcome[] = [];
  const rejected: PipelineOutcome[] = [];

  for (const [i, spec] of specs.entries()) {
    process.stdout.write(`[${i + 1}/${specs.length}] ${spec.section} ${spec.questionType} ${spec.difficulty} ... `);
    try {
      const outcome = await runOne(spec);
      if (outcome.accepted) {
        accepted.push(outcome);
        console.log("ACCEPTED");
      } else {
        rejected.push(outcome);
        console.log(`REJECTED (${outcome.rejectionReasons.join("; ")})`);
      }
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  mkdirSync("seed", { recursive: true });
  writeFileSync("seed/generated.json", JSON.stringify(accepted.map((o) => o.question), null, 2));
  writeFileSync("seed/rejected.json", JSON.stringify(rejected, null, 2));
  console.log(`\nDone. ${accepted.length} accepted, ${rejected.length} rejected -> seed/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
