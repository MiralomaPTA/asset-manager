import type { Core } from "@/server/data";
import { locationOf } from "@/server/data";
import { blankRow, type ItemRow } from "@/server/db/schema";
import { formatId, maxSequence } from "@/server/domain/common";
import { findUser } from "@/server/users";

/**
 * The first stocktake: a CSV of items (one row each) and a folder of photos,
 * loaded in one go. Kept apart from the script so it can be tested.
 *
 * Columns, by header name, in any order: name (required), description, tags
 * (comma-separated), location, quantity (required), owner_email, contents
 * (parts separated by ";" or new lines), photo (a file name in the photos
 * folder). Unknown columns are ignored.
 */

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and new lines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface PlannedItem {
  line: number;
  row: ItemRow;
  photo: string;
  warnings: string[];
}

export interface ImportPlan {
  items: PlannedItem[];
  skipped: { line: number; reason: string }[];
}

/** Works out the rows to add, with warnings, without writing anything. */
export function planImport(csv: string, core: Pick<Core, "items" | "locations" | "users">, opts: { now: string; allowDuplicates?: boolean }): ImportPlan {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return { items: [], skipped: [] };
  const col = new Map(header.map((h, i) => [h.trim().toLowerCase().replace(/\s+/g, "_"), i]));
  if (!col.has("name") || !col.has("quantity")) throw new Error('The CSV needs at least "name" and "quantity" columns.');
  const cell = (r: string[], name: string) => (col.has(name) ? (r[col.get(name)!] ?? "").trim() : "");

  const existing = new Set(core.items.map((i) => i.name.toLowerCase()));
  let next = maxSequence(core.items.map((i) => i.id), "I-");
  const plan: ImportPlan = { items: [], skipped: [] };
  rows.forEach((r, index) => {
    const line = index + 2;
    const name = cell(r, "name");
    if (!name) return plan.skipped.push({ line, reason: "no name" });
    const quantity = Number(cell(r, "quantity").replace(/,/g, ""));
    if (!Number.isInteger(quantity) || quantity < 0) return plan.skipped.push({ line, reason: `${name}: quantity "${cell(r, "quantity")}" isn't a whole number` });
    if (existing.has(name.toLowerCase()) && !opts.allowDuplicates) return plan.skipped.push({ line, reason: `${name}: already in the Items tab` });
    existing.add(name.toLowerCase());

    const warnings: string[] = [];
    let location = cell(r, "location");
    const known = location ? locationOf(core, location) : undefined;
    if (known) location = known.name;
    else if (core.locations.length > 0) warnings.push(location ? `location "${location}" isn't in the Locations tab` : "no location");
    const owner = cell(r, "owner_email").toLowerCase();
    if (owner && findUser(core.users, owner)?.status !== "approved") warnings.push(`owner ${owner} isn't an approved user yet; the admins decide until they are`);

    plan.items.push({
      line,
      photo: cell(r, "photo"),
      warnings,
      row: {
        ...blankRow("items"),
        id: formatId("I-", ++next),
        name,
        description: cell(r, "description"),
        tags: cell(r, "tags").split(",").map((t) => t.trim()).filter(Boolean),
        location,
        quantity,
        owner_email: owner,
        contents: cell(r, "contents").split(/[;\n]/).map((p) => p.trim()).filter(Boolean),
        created_at: opts.now,
        updated_at: opts.now,
      },
    });
  });
  return plan;
}
