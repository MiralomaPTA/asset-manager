import { sheets as sheetsApi, type sheets_v4 } from "@googleapis/sheets";
import { googleConfig } from "@/server/config";
import { googleAuth } from "@/server/adapters/google/auth";
import type { RawRow, SheetStore, TableShape } from "@/server/adapters/types";

/**
 * The spreadsheet as a set of tables: header row = column names, one record
 * per row.
 *
 * Admins edit the Sheet by hand, so nothing depends on row order or column
 * position: rows are found by their values and columns by header name.
 * Sorting, filtering and adding columns are safe; renaming a header breaks
 * the mapping.
 *
 * - Reads use FORMATTED_VALUE, the text people see, so a quantity typed as a
 *   number and one pasted as text read the same.
 * - Writes use RAW, so an event name starting with "=" is stored as text, not
 *   run as a formula.
 * - Updates write only the cells that change. Every other cell, including
 *   formulas and formatting in columns the app doesn't know, is left alone.
 * - A tab that doesn't exist yet is created, and columns missing from a
 *   header row are added at its end, so the spreadsheet never needs rebuilding.
 */

let api: sheets_v4.Sheets | null = null;

function sheets(): sheets_v4.Sheets {
  if (!api) api = sheetsApi({ version: "v4", auth: googleAuth() });
  return api;
}

export function columnLetter(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function quote(sheet: string): string {
  return `'${sheet.replace(/'/g, "''")}'`;
}

function toRaw(header: string[], cells: unknown[]): RawRow {
  const row: RawRow = {};
  header.forEach((name, i) => {
    if (name) row[name] = cells[i] == null ? "" : String(cells[i]);
  });
  return row;
}

const hasKey = (table: TableShape) => (row: RawRow) => (row[table.key] ?? "").trim() !== "";

async function tabProperties(): Promise<sheets_v4.Schema$SheetProperties[]> {
  const { data } = await sheets().spreadsheets.get({ spreadsheetId: googleConfig().spreadsheetId, fields: "sheets.properties" });
  return (data.sheets ?? []).map((s) => s.properties ?? {});
}

/** Creates any of `tables` that have no tab yet, with their header rows. False if none were missing. */
async function createMissingTabs(tables: readonly TableShape[]): Promise<boolean> {
  const { spreadsheetId } = googleConfig();
  const existing = new Set((await tabProperties()).map((p) => p.title));
  const missing = tables.filter((t) => !existing.has(t.sheet));
  if (missing.length === 0) return false;
  await sheets().spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: missing.map((t) => ({
        addSheet: { properties: { title: t.sheet, gridProperties: { columnCount: Math.max(26, t.columns.length), frozenRowCount: 1 } } },
      })),
    },
  });
  await sheets().spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: missing.map((t) => ({ range: `${quote(t.sheet)}!A1`, values: [[...t.columns]] })) },
  });
  return true;
}

/** Adds the columns missing from `existing` after its last one, widening the tab first. */
async function migrateHeader(table: TableShape, existing: string[]): Promise<string[]> {
  const missing = table.columns.filter((c) => !existing.includes(c));
  if (missing.length === 0) return existing;
  const { spreadsheetId } = googleConfig();
  const props = (await tabProperties()).find((p) => p.title === table.sheet);
  const needed = existing.length + missing.length;
  const current = props?.gridProperties?.columnCount ?? 0;
  if (props?.sheetId != null && current < needed) {
    await sheets().spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ appendDimension: { sheetId: props.sheetId, dimension: "COLUMNS", length: needed - current } }] },
    });
  }
  await sheets().spreadsheets.values.update({
    spreadsheetId,
    range: `${quote(table.sheet)}!${columnLetter(existing.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [missing] },
  });
  return [...existing, ...missing];
}

async function batchGet(tables: readonly TableShape[]): Promise<unknown[][][]> {
  const { data } = await sheets().spreadsheets.values.batchGet({
    spreadsheetId: googleConfig().spreadsheetId,
    ranges: tables.map((t) => quote(t.sheet)),
    valueRenderOption: "FORMATTED_VALUE",
  });
  return tables.map((_, i) => (data.valueRanges?.[i]?.values ?? []) as unknown[][]);
}

/** Every row of one tab with its header and Sheet row number. */
async function readTab(table: TableShape): Promise<{ header: string[]; rows: { rowNumber: number; row: RawRow }[] }> {
  const [values] = await readTables([table]);
  const header = await migrateHeader(table, (values[0] ?? []).map(String));
  const rows = values.slice(1).map((cells, i) => ({ rowNumber: i + 2, row: toRaw(header, cells) }));
  return { header, rows: rows.filter((r) => hasKey(table)(r.row)) };
}

async function readTables(tables: readonly TableShape[]): Promise<unknown[][][]> {
  try {
    return await batchGet(tables);
  } catch (error) {
    // One missing tab fails the whole batch. Create it and try once more.
    if (!(await createMissingTabs(tables))) throw error;
    return batchGet(tables);
  }
}

/** Just the header row, with any missing columns added. */
async function readHeader(table: TableShape): Promise<string[]> {
  const read = async () =>
    (
      await sheets().spreadsheets.values.get({ spreadsheetId: googleConfig().spreadsheetId, range: `${quote(table.sheet)}!1:1`, valueRenderOption: "FORMATTED_VALUE" })
    ).data.values?.[0] ?? [];
  let cells: unknown[];
  try {
    cells = await read();
  } catch (error) {
    if (!(await createMissingTabs([table]))) throw error;
    cells = await read();
  }
  return migrateHeader(table, cells.map(String));
}

export const googleSheetStore: SheetStore = {
  async read(tables) {
    const all = await readTables(tables);
    return Promise.all(
      tables.map(async (table, i) => {
        const values = all[i];
        const header = await migrateHeader(table, (values[0] ?? []).map(String));
        return values
          .slice(1)
          .map((cells) => toRaw(header, cells))
          .filter(hasKey(table));
      }),
    );
  },

  async append(table, rows) {
    const { spreadsheetId } = googleConfig();
    const header = await readHeader(table);
    await sheets().spreadsheets.values.append({
      spreadsheetId,
      range: `${quote(table.sheet)}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows.map((row) => header.map((name) => row[name] ?? "")) },
    });
  },

  async update(table, changes) {
    const { spreadsheetId } = googleConfig();
    const { header, rows } = await readTab(table);
    const cells: sheets_v4.Schema$ValueRange[] = [];
    for (const [i, change] of changes.entries()) {
      const found = rows.find((r) => change.match({ ...r.row }));
      if (!found) return { ok: false, reason: "missing", change: i };
      if (change.expect && !change.expect({ ...found.row })) return { ok: false, reason: "conflict", change: i };
      for (const [name, value] of Object.entries(change.patch)) {
        const col = header.indexOf(name);
        if (col === -1) continue;
        cells.push({ range: `${quote(table.sheet)}!${columnLetter(col)}${found.rowNumber}`, values: [[value]] });
      }
    }
    if (cells.length > 0) {
      await sheets().spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: cells } });
    }
    return { ok: true };
  },
};
