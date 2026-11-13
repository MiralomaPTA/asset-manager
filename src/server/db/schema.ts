/**
 * The tabs of the "PTA equipment" spreadsheet. Column names are the Sheet's
 * header names and the keys of each row object. The app finds columns by
 * header, so columns can be reordered or added by hand; renaming one breaks
 * it. Columns missing from a tab are added at the end of its header row.
 */

import { LINE_STATUSES } from "@/lib/status";
import { bool, csv, day, email, int, multiline, oneOf, text, type Codec, type CodecValue } from "@/server/db/codecs";

// Codecs of every value type live in one record, so `any` is the honest element type here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Columns = Record<string, Codec<any>>;

export interface TableDef<C extends Columns = Columns> {
  /** The tab's name in the spreadsheet. */
  sheet: string;
  /** The column that identifies a row. Rows with it blank are ignored. */
  key: keyof C & string;
  columns: C;
}

function table<C extends Columns>(sheet: string, key: keyof C & string, columns: C): TableDef<C> {
  return { sheet, key, columns };
}

export const TABLES = {
  items: table("Items", "id", {
    id: text,
    name: text,
    description: text,
    tags: csv,
    location: text,
    quantity: int,
    owner_email: email,
    contents: multiline,
    photo_id: text,
    thumb_id: text,
    archived: bool(),
    created_at: text,
    updated_at: text,
  }),
  locations: table("Locations", "name", {
    name: text,
    address: text,
    pickup_instructions: text,
    return_instructions: text,
  }),
  eventTypes: table("Event types", "name", {
    name: text,
    active: bool(true),
  }),
  users: table("Users", "email", {
    email,
    name: text,
    phone: text,
    connection: text,
    status: oneOf(["pending", "approved", "denied"], "pending"),
    role: oneOf(["borrower", "admin"], "borrower"),
    requested_at: text,
    decided_at: text,
    decided_by: text,
    last_link_at: text,
    signed_in_at: text,
  }),
  requests: table("Requests", "id", {
    id: text,
    created_at: text,
    borrower_email: email,
    event_type: text,
    event_name: text,
    pickup_date: day,
    return_date: day,
    borrower_note: text,
    confirmed_at: text,
  }),
  lines: table("Lines", "id", {
    id: text,
    request_id: text,
    item_id: text,
    item_name: text,
    qty_requested: int,
    qty_approved: int,
    status: oneOf(LINE_STATUSES, "Pending"),
    decided_by: email,
    decided_at: text,
    decision_note: text,
    owner_note: text,
    cancelled_at: text,
    cancelled_by: email,
    cancel_note: text,
    picked_up_at: text,
    returned_on: day,
    returned_at: text,
    returned_by: email,
    return_ok: oneOf(["", "yes", "no"], ""),
    return_notes: text,
    missing_parts: multiline,
    return_photo_id: text,
    problem_cleared_at: text,
    problem_cleared_by: email,
    problem_cleared_note: text,
  }),
  activity: table("Activity", "at", {
    at: text,
    actor_email: email,
    action: text,
    request_id: text,
    line_id: text,
    item_id: text,
    detail: text,
  }),
  sends: table("Sends", "key", {
    key: text,
    kind: text,
    sent_at: text,
    to: text,
    line_ids: text,
  }),
};

export type Tables = typeof TABLES;
export type TableName = keyof Tables;
export type Row<N extends TableName> = { [K in keyof Tables[N]["columns"]]: CodecValue<Tables[N]["columns"][K]> };
export type Snapshot = { [N in TableName]: Row<N>[] };

export type ItemRow = Row<"items">;
export type LocationRow = Row<"locations">;
export type EventTypeRow = Row<"eventTypes">;
export type UserRow = Row<"users">;
export type RequestRow = Row<"requests">;
export type LineRow = Row<"lines">;
export type ActivityRow = Row<"activity">;
export type SendRow = Row<"sends">;

export function columnNames(name: TableName): string[] {
  return Object.keys(TABLES[name].columns);
}

/** A row with every column at its blank value, for building new rows. */
export function blankRow<N extends TableName>(name: N): Row<N> {
  const out: Record<string, unknown> = {};
  for (const [col, codec] of Object.entries(TABLES[name].columns)) out[col] = codec.parse("");
  return out as Row<N>;
}
