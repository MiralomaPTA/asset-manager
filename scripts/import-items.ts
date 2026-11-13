/**
 * Loads the first stocktake into the Items tab and Drive.
 *
 *   npm run import-items -- items.csv photos/            # shows what it would do
 *   npm run import-items -- items.csv photos/ --commit   # does it
 *
 * Uses whatever ADAPTERS says (local by default, or google with the GOOGLE_*
 * variables in .env.local). Items whose name is already in the Items tab are
 * skipped unless --allow-duplicates. See examples/items.csv for the columns.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getDeps } from "../src/server/adapters";
import { config } from "../src/server/config";
import { loadCore } from "../src/server/data";
import { logActivity } from "../src/server/domain/common";
import { planImport } from "../src/server/import-items";
import { storeItemPhoto } from "../src/server/photos";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [csvPath, photoDir] = args.filter((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error("Usage: npm run import-items -- items.csv [photos-folder] [--commit] [--allow-duplicates]");
  process.exit(1);
}
const commit = flags.has("--commit");

// No top-level await: the package is CommonJS for tsx.
async function main() {
  const deps = await getDeps();
  const core = await loadCore(deps);
  const now = new Date().toISOString();
  const plan = planImport(readFileSync(csvPath, "utf8"), core, { now, allowDuplicates: flags.has("--allow-duplicates") });

  console.log(`${commit ? "Importing" : "Would import"} ${plan.items.length} items into the ${config.adapters} Sheet${commit ? "" : " (dry run; add --commit to do it)"}:`);
  let missingPhotos = 0;
  for (const p of plan.items) {
    const photoPath = p.photo && photoDir ? path.join(photoDir, p.photo) : "";
    if (p.photo && (!photoPath || !existsSync(photoPath))) {
      p.warnings.push(`photo ${p.photo} not found${photoDir ? ` in ${photoDir}` : " (no photos folder given)"}`);
      missingPhotos++;
    }
    console.log(`  ${p.row.id}  ${p.row.name} × ${p.row.quantity}${p.row.location ? ` · ${p.row.location}` : ""}${p.photo ? ` · ${p.photo}` : ""}`);
    for (const w of p.warnings) console.log(`         ! ${w}`);
  }
  for (const s of plan.skipped) console.log(`  skipped line ${s.line}: ${s.reason}`);

  if (commit && plan.items.length > 0) {
    for (const p of plan.items) {
      const photoPath = p.photo && photoDir ? path.join(photoDir, p.photo) : "";
      if (!photoPath || !existsSync(photoPath)) continue;
      const { photoId, thumbId } = await storeItemPhoto(deps.files, new Uint8Array(readFileSync(photoPath)), "import-items", p.row.name);
      p.row.photo_id = photoId;
      p.row.thumb_id = thumbId;
      process.stdout.write(".");
    }
    await deps.db.append("items", plan.items.map((p) => p.row));
    await logActivity(deps, "import-items", [{ action: "imported items", detail: `${plan.items.length} items from ${path.basename(csvPath)}` }]);
    console.log(`\nAdded ${plan.items.length} items${missingPhotos ? `; ${missingPhotos} without their photo` : ""}.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
