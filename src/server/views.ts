import type { Core } from "@/server/data";
import { lineQty, locationOf } from "@/server/data";
import type { LineRow, LocationRow, RequestRow } from "@/server/db/schema";
import { shortNameOf } from "@/server/users";
import { dayOf, formatDay } from "@/lib/dates";

/** Shapes for the request pages, worked out from the snapshot. */

export interface PlaceGroup {
  name: string;
  location: LocationRow | undefined;
  lines: LineRow[];
}

/** Lines grouped by where their items are kept, in the order they first appear. */
export function byPlace(core: Core, lines: LineRow[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const line of lines) {
    const name = core.items.find((i) => i.id === line.item_id)?.location || "Ask the owner";
    if (!groups.has(name)) groups.set(name, { name, location: locationOf(core, name), lines: [] });
    groups.get(name)!.lines.push(line);
  }
  return [...groups.values()];
}

export interface HistoryEntry {
  at: string;
  day: string;
  text: string;
}

const list = (names: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(names);

function lower(line: LineRow): string {
  return line.item_name.charAt(0).toLowerCase() + line.item_name.slice(1);
}

/** "the folding chair", or "the folding chair (20 of 30)" when fewer were approved. */
function described(line: LineRow): string {
  if (line.status !== "Declined" && line.qty_approved > 0 && line.qty_approved < line.qty_requested) return `the ${lower(line)} (${line.qty_approved} of ${line.qty_requested})`;
  return `the ${lower(line)}`;
}

/**
 * What happened to a request, oldest first, from the timestamps on its rows.
 * Changes made in the same minute by the same person read as one entry.
 */
export function requestHistory(core: Core, request: RequestRow, lines: LineRow[], viewerEmail: string): HistoryEntry[] {
  const who = (email: string) => (email === viewerEmail ? "You" : shortNameOf(core.users, email));
  const raw: { at: string; actor: string; verb: string; line: LineRow; extra?: string }[] = [];
  for (const l of lines) {
    if (l.decided_at) raw.push({ at: l.decided_at, actor: l.decided_by, verb: l.status === "Declined" ? "declined" : l.decided_by === request.borrower_email ? "approved (own item)" : "approved", line: l });
    if (l.cancelled_at) raw.push({ at: l.cancelled_at, actor: l.cancelled_by, verb: "cancelled", line: l });
    if (l.picked_up_at) raw.push({ at: l.picked_up_at, actor: request.borrower_email, verb: "picked up", line: l });
    if (l.returned_at) raw.push({ at: l.returned_at, actor: l.returned_by, verb: "returned", line: l, extra: l.return_ok === "no" ? "problem reported" : "all OK" });
    if (l.problem_cleared_at) raw.push({ at: l.problem_cleared_at, actor: l.problem_cleared_by, verb: "cleared the problem with", line: l });
  }
  raw.sort((a, b) => a.at.localeCompare(b.at));

  const entries: HistoryEntry[] = [];
  if (request.created_at) entries.push({ at: request.created_at, day: formatDay(dayOf(new Date(request.created_at))), text: `${who(request.borrower_email)} sent the request` });
  const groups: (typeof raw)[] = [];
  for (const r of raw) {
    const last = groups[groups.length - 1];
    if (last && last[0].actor === r.actor && last[0].verb === r.verb && last[0].at.slice(0, 16) === r.at.slice(0, 16) && last[0].extra === r.extra) last.push(r);
    else groups.push([r]);
  }
  for (const g of groups) {
    const { at, actor, verb, extra } = g[0];
    const all = verb === "picked up" && g.length > 1 && g.length === lines.filter((l) => l.picked_up_at).length;
    const what = all ? "everything" : list(g.map((r) => described(r.line)));
    entries.push({ at, day: formatDay(dayOf(new Date(at))), text: `${who(actor)} ${verb} ${what}${extra ? `: ${extra}` : ""}` });
  }
  if (request.confirmed_at) entries.push({ at: request.confirmed_at, day: formatDay(dayOf(new Date(request.confirmed_at))), text: "Confirmation emailed" });
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

/** "Folding chair × 20, Popcorn machine" */
export function linesSummary(lines: LineRow[]): string {
  return lines.map((l) => (lineQty(l) > 1 ? `${l.item_name} × ${lineQty(l)}` : l.item_name)).join(", ");
}
