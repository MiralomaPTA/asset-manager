/** Line and request statuses, shared by the server and the browser. */

export const LINE_STATUSES = ["Pending", "Approved", "Declined", "Cancelled", "Expired", "Picked up", "Returned"] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/** Lines that still hold, or may come to hold, units. */
export const OPEN_STATUSES: readonly LineStatus[] = ["Pending", "Approved", "Picked up"];

/** Lines whose units are held on the calendar. Pending lines are only tentative. */
export const HOLDING_STATUSES: readonly LineStatus[] = ["Approved", "Picked up"];

export function isHolding(status: LineStatus): boolean {
  return status === "Approved" || status === "Picked up";
}

export type RequestStatus = "Waiting for approval" | "Approved" | "Out" | "Closed";

/**
 * A request's status follows from its lines: Out while anything is picked up,
 * Waiting while any line is pending, Approved while an approved line is still
 * to be picked up, and Closed once nothing is left to pick up or return.
 */
export function requestStatus(statuses: readonly LineStatus[]): RequestStatus {
  if (statuses.includes("Picked up")) return "Out";
  if (statuses.includes("Pending")) return "Waiting for approval";
  if (statuses.includes("Approved")) return "Approved";
  return "Closed";
}

/** What a borrower sees for one line. */
export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  Pending: "Waiting for approval",
  Approved: "Approved",
  Declined: "Declined",
  Cancelled: "Cancelled",
  Expired: "Expired",
  "Picked up": "Picked up",
  Returned: "Returned",
};
