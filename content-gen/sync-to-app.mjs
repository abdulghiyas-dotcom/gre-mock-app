// Copies the verified seed bank into apps/web/src/data/ so the Next.js app
// bundles it at build time (no runtime filesystem dependency — required for
// serverless deployments like Vercel, where content-gen/ isn't included).
// Run after merging new content: `node sync-to-app.mjs` from content-gen/.
import { copyFileSync } from "node:fs";
import path from "node:path";

const files = ["verbal.json", "quant.json", "awa-prompts.json"];
const srcDir = path.resolve(import.meta.dirname, "seed");
const destDir = path.resolve(import.meta.dirname, "..", "apps", "web", "src", "data");

for (const file of files) {
  copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  console.log(`synced ${file}`);
}
