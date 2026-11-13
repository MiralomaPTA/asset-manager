import type { Deps } from "@/server/adapters";
import type { ItemRow, LineRow, LocationRow, RequestRow, Snapshot, UserRow } from "@/server/db/schema";
import type { Booking } from "@/lib/availability";
import { isOverdue, statusToday, type ItemStatus } from "@/lib/availability";
import { today as todayIn, type Day } from "@/lib/dates";
import { requestStatus, type RequestStatus } from "@/lib/status";
import { canManageItem, ownerOf } from "@/server/users";

/**
 * The read side: everything a page shows is worked out from one snapshot of
 * the six tabs below, read in one call. Activity and Sends are only written
 * (and read by the daily job), so pages don't pay for them.
 */

export const CORE_TABLES = ["users", "items", "locations", "eventTypes", "requests", "lines"] as const;
export type Core = Pick<Snapshot, (typeof CORE_TABLES)[number]>;

export function loadCore(deps: Pick<Deps, "db">): Promise<Core> {
  return deps.db.load(...CORE_TABLES);
}

export function todayOf(deps: Pick<Deps, "now">): Day {
  return todayIn(deps.now());
}

export function requestMap(core: Pick<Core, "requests">): Map<string, RequestRow> {
  return new Map(core.requests.map((r) => [r.id, r]));
}

export function itemMap(core: Pick<Core, "items">): Map<string, ItemRow> {
  return new Map(core.items.map((i) => [i.id, i]));
}

export function linesOf(core: Pick<Core, "lines">, requestId: string): LineRow[] {
  return core.lines.filter((l) => l.request_id === requestId);
}

/** The quantity a line holds or asks for: approved once decided, requested while pending. */
export function lineQty(line: LineRow): number {
  return line.status === "Pending" ? line.qty_requested : line.qty_approved;
}

/** Every line that can appear on the calendar or reduce availability, with its request's dates. */
export function bookings(core: Pick<Core, "lines" | "requests">): Booking[] {
  const requests = requestMap(core);
  const out: Booking[] = [];
  for (const line of core.lines) {
    if (line.status !== "Pending" && line.status !== "Approved" && line.status !== "Picked up") continue;
    const request = requests.get(line.request_id);
    if (!request?.pickup_date || !request.return_date) continue;
    out.push({ lineId: line.id, requestId: request.id, itemId: line.item_id, status: line.status, qty: lineQty(line), pickup: request.pickup_date, ret: request.return_date });
  }
  return out;
}

export function locationOf(core: Pick<Core, "locations">, name: string): LocationRow | undefined {
  const wanted = name.trim().toLowerCase();
  return core.locations.find((l) => l.name.toLowerCase() === wanted);
}

/** The most recent return with an open problem flag for an item, if any. */
export function openProblem(core: Pick<Core, "lines">, itemId: string): LineRow | undefined {
  return core.lines
    .filter((l) => l.item_id === itemId && l.status === "Returned" && l.return_ok === "no" && !l.problem_cleared_at)
    .sort((a, b) => b.returned_at.localeCompare(a.returned_at))[0];
}

/** Returns of an item, newest first: the condition history. */
export function conditionHistory(core: Pick<Core, "lines">, itemId: string): LineRow[] {
  return core.lines
    .filter((l) => l.item_id === itemId && l.status === "Returned")
    .sort((a, b) => (b.returned_on || b.returned_at).localeCompare(a.returned_on || a.returned_at) || b.returned_at.localeCompare(a.returned_at));
}

export interface ItemView {
  item: ItemRow;
  status: ItemStatus;
  problem: LineRow | undefined;
}

export function itemViews(core: Core, today: Day): ItemView[] {
  const all = bookings(core);
  return core.items.map((item) => ({ item, status: statusToday(item.quantity, all, item.id, today), problem: openProblem(core, item.id) }));
}

export function requestStatusOf(core: Pick<Core, "lines">, requestId: string): RequestStatus {
  return requestStatus(linesOf(core, requestId).map((l) => l.status));
}

/** A request with a line that is overdue today. */
export function isRequestOverdue(core: Pick<Core, "lines">, request: RequestRow, today: Day): boolean {
  return linesOf(core, request.id).some((l) =>
    isOverdue({ lineId: l.id, requestId: request.id, itemId: l.item_id, status: l.status, qty: l.qty_approved, pickup: request.pickup_date, ret: request.return_date }, today),
  );
}

/** Can `user` decide `line`? The item's owner, or any admin. */
export function canDecide(core: Pick<Core, "items" | "users">, user: UserRow | undefined, line: LineRow): boolean {
  const item = core.items.find((i) => i.id === line.item_id);
  return canManageItem(user, item ?? { owner_email: "" }, core.users);
}

/**
 * Whose decision a line waits on: the item's owner, or null for the admins.
 * Lines whose item was deleted from the Sheet fall to the admins too.
 */
export function deciderOf(core: Pick<Core, "items" | "users">, line: LineRow): UserRow | null {
  return ownerOf(core.items.find((i) => i.id === line.item_id), core.users);
}

/** Does `user` own any item (and so see the Review tab)? */
export function ownsAnything(core: Pick<Core, "items">, user: UserRow): boolean {
  return core.items.some((i) => !i.archived && i.owner_email === user.email);
}

/**
 * Pending lines that `user` is expected to decide: their own items' lines,
 * plus, for admins, lines of items with no (approved) owner.
 */
export function linesToDecide(core: Core, user: UserRow): LineRow[] {
  const isAdmin = user.role === "admin" && user.status === "approved";
  return core.lines.filter((l) => {
    if (l.status !== "Pending") return false;
    const decider = deciderOf(core, l);
    return decider ? decider.email === user.email : isAdmin;
  });
}
