/**
 * How many units of an item are free on a day. Pure functions, shared by the
 * server and the request form in the browser.
 *
 * - Dates are whole days, inclusive: a line booked Dec 10–12 holds its units
 *   on the 10th, 11th and 12th.
 * - Approved and picked-up lines hold their approved quantity on every day of
 *   their range. Pending lines hold nothing; they are only tentative.
 * - A line past its return date and not yet returned (overdue) also holds its
 *   units on every day after the return date up to today. Future days are not
 *   held for it.
 */

import { addDays, eachDay, type Day } from "@/lib/dates";
import { isHolding, type LineStatus } from "@/lib/status";

export interface Booking {
  lineId: string;
  requestId: string;
  itemId: string;
  status: LineStatus;
  /** The approved quantity for a holding line, the requested one for a pending line. */
  qty: number;
  pickup: Day;
  ret: Day;
}

export function isOverdue(b: Booking, today: Day): boolean {
  return isHolding(b.status) && b.ret < today;
}

/** Whether `b` holds its units on `day`. */
export function holdsOn(b: Booking, day: Day, today: Day): boolean {
  if (!isHolding(b.status)) return false;
  if (day >= b.pickup && day <= b.ret) return true;
  return b.ret < today && day > b.ret && day <= today;
}

/** Whether `b` covers `day` on the calendar: holding, overdue or pending. */
export function coversDay(b: Booking, day: Day, today: Day): boolean {
  if (b.status === "Pending") return day >= b.pickup && day <= b.ret;
  return holdsOn(b, day, today);
}

export function heldOn(bookings: readonly Booking[], itemId: string, day: Day, today: Day, excludeLineId?: string): number {
  let held = 0;
  for (const b of bookings) {
    if (b.itemId === itemId && b.lineId !== excludeLineId && holdsOn(b, day, today)) held += b.qty;
  }
  return held;
}

export interface RangeAvailability {
  /** Fewest units free on any day of the range; negative when overbooked. */
  free: number;
  /** The first day with that fewest, for messages like "overbook Dec 12 by 10". */
  tightestDay: Day;
  /** Units held by approved bookings on the tightest day. */
  heldOnTightestDay: number;
}

/** Free units over `from`–`to`, ignoring `excludeLineId` (the line being decided). */
export function freeOver(
  quantity: number,
  bookings: readonly Booking[],
  itemId: string,
  from: Day,
  to: Day,
  today: Day,
  excludeLineId?: string,
): RangeAvailability {
  const relevant = bookings.filter((b) => b.itemId === itemId && b.lineId !== excludeLineId);
  let result: RangeAvailability = { free: quantity, tightestDay: from, heldOnTightestDay: 0 };
  for (const day of eachDay(from, to)) {
    const held = heldOn(relevant, itemId, day, today);
    if (quantity - held < result.free) result = { free: quantity - held, tightestDay: day, heldOnTightestDay: held };
  }
  return result;
}

/** Pending bookings of `itemId` that overlap `from`–`to`, other than `excludeRequestId`'s. */
export function pendingOverlaps(bookings: readonly Booking[], itemId: string, from: Day, to: Day, excludeRequestId?: string): Booking[] {
  return bookings.filter(
    (b) => b.itemId === itemId && b.status === "Pending" && b.requestId !== excludeRequestId && b.pickup <= to && b.ret >= from,
  );
}

/** Approved and picked-up bookings of `itemId` that hold units on some day of `from`–`to`. */
export function holdingOverlaps(bookings: readonly Booking[], itemId: string, from: Day, to: Day, today: Day, excludeRequestId?: string): Booking[] {
  const days = eachDay(from, to);
  return bookings.filter((b) => b.itemId === itemId && b.requestId !== excludeRequestId && days.some((d) => holdsOn(b, d, today)));
}

export type ItemStatus =
  | { kind: "unavailable" }
  | { kind: "available" }
  | { kind: "partial"; free: number; total: number }
  | { kind: "out"; backOn: Day | null }
  | { kind: "overdue"; since: Day };

/** How far ahead to look for the day an item that is out comes back. */
const LOOKAHEAD_DAYS = 120;

/** An item's status today, for the catalog card and the item page. */
export function statusToday(quantity: number, bookings: readonly Booking[], itemId: string, today: Day): ItemStatus {
  if (quantity <= 0) return { kind: "unavailable" };
  const free = quantity - heldOn(bookings, itemId, today, today);
  if (free >= quantity) return { kind: "available" };
  if (free > 0) return { kind: "partial", free, total: quantity };
  const overdue = bookings.filter((b) => b.itemId === itemId && isOverdue(b, today));
  if (overdue.length > 0) {
    const earliest = overdue.reduce((min, b) => (b.ret < min ? b.ret : min), overdue[0].ret);
    return { kind: "overdue", since: addDays(earliest, 1) };
  }
  for (let day = addDays(today, 1), i = 0; i < LOOKAHEAD_DAYS; day = addDays(day, 1), i++) {
    if (quantity - heldOn(bookings, itemId, day, today) > 0) return { kind: "out", backOn: addDays(day, -1) };
  }
  return { kind: "out", backOn: null };
}

/** Units of `itemId` that are overdue today. */
export function overdueUnits(bookings: readonly Booking[], itemId: string, today: Day): number {
  return bookings.filter((b) => b.itemId === itemId && isOverdue(b, today)).reduce((sum, b) => sum + b.qty, 0);
}
