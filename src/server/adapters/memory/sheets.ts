import type { RawRow, RowChange, SheetStore, TableShape, UpdateOutcome } from "@/server/adapters/types";

/**
 * A SheetStore over plain arrays of rows, one per tab. Used directly by the
 * tests, and by the local adapter, which saves each tab to a JSON file.
 * It behaves like the Google one: rows with a blank key are invisible, and an
 * update writes all of its changes or none.
 */

export interface TabBackend {
  load(sheet: string): Promise<RawRow[]>;
  save(sheet: string, rows: RawRow[]): Promise<void>;
}

const keyed = (table: TableShape) => (row: RawRow) => (row[table.key] ?? "").trim() !== "";

export function backedSheetStore(backend: TabBackend): SheetStore {
  // Each call runs alone, as each Sheets API call is atomic on Google's side.
  // Without this, two appends at once could each load, add and save, and the
  // second save would drop the first one's row.
  let queue: Promise<unknown> = Promise.resolve();
  const atomic = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    read(tables) {
      return atomic(() =>
        Promise.all(
          tables.map(async (t) => {
            const rows = await backend.load(t.sheet);
            return rows.filter(keyed(t)).map((r) => ({ ...r }));
          }),
        ),
      );
    },
    append(table, rows) {
      return atomic(async () => {
        const existing = await backend.load(table.sheet);
        await backend.save(table.sheet, [...existing, ...rows.map((r) => ({ ...r }))]);
      });
    },
    update(table, changes) {
      return atomic(() => applyChanges(backend, table, changes));
    },
  };
}

async function applyChanges(backend: TabBackend, table: TableShape, changes: RowChange[]): Promise<UpdateOutcome> {
  const rows = await backend.load(table.sheet);
  const visible = rows.filter(keyed(table));
  const targets: RawRow[] = [];
  for (const [i, change] of changes.entries()) {
    const row = visible.find((r) => change.match({ ...r }));
    if (!row) return { ok: false, reason: "missing", change: i };
    if (change.expect && !change.expect({ ...row })) return { ok: false, reason: "conflict", change: i };
    targets.push(row);
  }
  changes.forEach((change, i) => Object.assign(targets[i], change.patch));
  await backend.save(table.sheet, rows);
  return { ok: true };
}

/** Everything in memory; `tabs` is shared, so a test can inspect or seed it. */
export function memorySheetStore(tabs: Record<string, RawRow[]> = {}): SheetStore & { tabs: Record<string, RawRow[]> } {
  const store = backedSheetStore({
    async load(sheet) {
      return (tabs[sheet] ??= []);
    },
    async save(sheet, rows) {
      tabs[sheet] = rows;
    },
  });
  return Object.assign(store, { tabs });
}
