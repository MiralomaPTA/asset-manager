import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/server/config";
import { backedSheetStore } from "@/server/adapters/memory/sheets";
import type { RawRow } from "@/server/adapters/types";

/**
 * Development stand-in for the spreadsheet: one JSON array per tab in
 * .data/sheet/, e.g. .data/sheet/Items.json. Edit the files by hand to try
 * what a hand-edited Sheet does; `npm run seed` fills them with sample data.
 */

export function sheetDir(): string {
  return path.join(process.cwd(), config.localDataDir, "sheet");
}

function tabPath(sheet: string): string {
  return path.join(sheetDir(), `${sheet}.json`);
}

export const localSheetStore = backedSheetStore({
  async load(sheet) {
    try {
      return JSON.parse(await fs.readFile(tabPath(sheet), "utf8")) as RawRow[];
    } catch {
      return [];
    }
  },
  async save(sheet, rows) {
    await fs.mkdir(sheetDir(), { recursive: true });
    // Write then rename, so a crash mid-write never leaves half a file.
    const target = tabPath(sheet);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(rows, null, 2));
    await fs.rename(temp, target);
  },
});
