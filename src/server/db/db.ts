import type { RawRow, RowChange, SheetStore, TableShape, UpdateOutcome } from "@/server/adapters/types";
import { TABLES, columnNames, type Row, type Snapshot, type TableName } from "@/server/db/schema";

/**
 * Typed access to the spreadsheet: rows come back parsed, patches go out
 * formatted, and reads are shared for a few seconds.
 *
 * Sheets allows about 60 reads a minute for the one Workspace user the app
 * acts as, so each page asks for every tab it needs in a single `load`, which
 * is a single batch read. A short cache absorbs bursts (several people opening
 * the catalog at once). Every write clears it, so a page loaded after a change
 * on this server sees the change. Other serverless instances may serve a read
 * up to `cacheMs` old.
 */

export interface Change<N extends TableName> {
  match: (row: Row<N>) => boolean;
  /** False when the row was changed by someone else since the page showed it. */
  expect?: (row: Row<N>) => boolean;
  patch: Partial<Row<N>>;
}

export function shape(name: TableName): TableShape {
  const def = TABLES[name];
  return { sheet: def.sheet, key: def.key, columns: columnNames(name) };
}

export function parseRow<N extends TableName>(name: N, raw: RawRow): Row<N> {
  const out: Record<string, unknown> = {};
  for (const [col, codec] of Object.entries(TABLES[name].columns)) out[col] = codec.parse(raw[col] ?? "");
  return out as Row<N>;
}

export function formatPatch<N extends TableName>(name: N, patch: Partial<Row<N>>): RawRow {
  const out: RawRow = {};
  const columns = TABLES[name].columns as Record<string, { format(v: unknown): string }>;
  for (const [col, value] of Object.entries(patch)) {
    if (value === undefined || !columns[col]) continue;
    out[col] = columns[col].format(value);
  }
  return out;
}

export class Db {
  /**
   * Holds promises, not rows, so the layout and the page rendering at the same
   * moment share one read instead of racing to make two.
   */
  private cache = new Map<TableName, { at: number; rows: Promise<Row<TableName>[]> }>();

  constructor(
    private readonly store: SheetStore,
    private readonly cacheMs = 3000,
    private readonly clock: () => number = Date.now,
  ) {}

  /** The named tabs, parsed. Tabs read within the last `cacheMs` come from memory; the rest in one read. */
  async load<N extends TableName>(...names: N[]): Promise<Pick<Snapshot, N>> {
    const now = this.clock();
    const wanted = [...new Set(names)];
    const stale = wanted.filter((n) => {
      const hit = this.cache.get(n);
      return !hit || now - hit.at > this.cacheMs;
    });
    if (stale.length > 0) {
      const batch = this.store.read(stale.map(shape));
      stale.forEach((name, i) => {
        const rows = batch.then((raw) => raw[i].map((r) => parseRow(name, r)));
        this.cache.set(name, { at: now, rows });
        // A failed read must not be served to the next caller.
        rows.catch(() => {
          if (this.cache.get(name)?.rows === rows) this.cache.delete(name);
        });
      });
    }
    const rows = await Promise.all(wanted.map((n) => this.cache.get(n)!.rows));
    const out: Record<string, unknown> = {};
    wanted.forEach((name, i) => (out[name] = rows[i]));
    return out as Pick<Snapshot, N>;
  }

  async append<N extends TableName>(name: N, rows: Row<N>[]): Promise<void> {
    if (rows.length === 0) return;
    this.cache.clear();
    try {
      await this.store.append(shape(name), rows.map((r) => formatPatch(name, r)));
    } finally {
      this.cache.clear(); // a load that ran during the write may have cached the old rows
    }
  }

  /** Applies every change or none. See SheetStore.update. */
  async update<N extends TableName>(name: N, changes: Change<N>[]): Promise<UpdateOutcome> {
    if (changes.length === 0) return { ok: true };
    this.cache.clear();
    const raw: RowChange[] = changes.map((c) => ({
      match: (r) => c.match(parseRow(name, r)),
      expect: c.expect ? (r) => c.expect!(parseRow(name, r)) : undefined,
      patch: formatPatch(name, c.patch),
    }));
    try {
      return await this.store.update(shape(name), raw);
    } finally {
      this.cache.clear();
    }
  }

  /** Forget cached reads, e.g. before re-checking a row that another server may have changed. */
  invalidate(): void {
    this.cache.clear();
  }
}

/** Matches the row whose key column equals `value`, ignoring case and surrounding spaces. */
export function byKey<N extends TableName>(name: N, value: string): (row: Row<N>) => boolean {
  const key = TABLES[name].key as keyof Row<N>;
  const wanted = value.trim().toLowerCase();
  return (row) => String(row[key]).trim().toLowerCase() === wanted;
}
