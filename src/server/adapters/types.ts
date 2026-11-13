/**
 * The app keeps no data of its own. Everything goes through these three
 * interfaces, backed by Google Sheets, Drive and Gmail in production and by
 * the local filesystem in development.
 */

/** A row as stored: column name to cell text. Columns the app doesn't know are kept as they are. */
export type RawRow = Record<string, string>;

export interface TableShape {
  sheet: string;
  key: string;
  columns: readonly string[];
}

export interface RowChange {
  /** Picks the row to change: the first row, in Sheet order, it returns true for. */
  match(row: RawRow): boolean;
  /** Checked against the freshly read row; false means someone else changed it first. */
  expect?(row: RawRow): boolean;
  /** Only these cells are written; every other cell in the row is left exactly as it was. */
  patch: RawRow;
}

export type UpdateOutcome = { ok: true } | { ok: false; reason: "missing" | "conflict"; change: number };

export interface SheetStore {
  /** Every row of each table, in Sheet order, in one read. Rows with a blank key are skipped. */
  read(tables: readonly TableShape[]): Promise<RawRow[][]>;
  append(table: TableShape, rows: RawRow[]): Promise<void>;
  /**
   * Re-reads the tab and applies every change, or none: if any row is missing
   * or fails its `expect`, nothing is written.
   */
  update(table: TableShape, changes: RowChange[]): Promise<UpdateOutcome>;
}

/** Item photos and thumbnails live in photos/; photos taken at return live in returns/. */
export type FileKind = "photo" | "thumb" | "return";

export interface StoredFile {
  mimeType: string;
  kind: FileKind;
  bytes: Uint8Array;
}

export interface FileStore {
  put(file: { name: string; mimeType: string; bytes: Uint8Array; kind: FileKind; uploader: string }): Promise<{ id: string }>;
  /** Only files the app stored; anything else in the Drive is null. */
  get(id: string): Promise<StoredFile | null>;
}

export interface MailMessage {
  to: string[];
  cc?: string[];
  /** Owners of the items, so a reply reaches a person rather than the app's mailbox. */
  replyTo?: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface Adapters {
  sheets: SheetStore;
  files: FileStore;
  mailer: Mailer;
}
