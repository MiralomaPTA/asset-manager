import { byKey } from "@/server/db/db";
import { blankRow, type LineRow, type RequestRow } from "@/server/db/schema";
import { bookings, deciderOf, canDecide, itemMap, linesOf, loadCore, todayOf, type Core } from "@/server/data";
import { CHANGED, eventTypeNames, fail, formatId, logActivity, maxSequence, trySend, type DomainDeps, type Result } from "@/server/domain/common";
import { borrowerCancelledEmail, confirmationEmail, decideEmail, ownerCancelledEmail, problemEmail, submittedEmail, type LineWarning } from "@/server/email/requests";
import { PhotoError, storeReturnPhoto } from "@/server/photos";
import { adminEmails, canManageItem, findUser, fullNameOf, itemContacts, ownerOf, shortNameOf } from "@/server/users";
import { freeOver, pendingOverlaps } from "@/lib/availability";
import { dayOf, daysBetween, formatMonthDay, isDay, type Day } from "@/lib/dates";
import { plural } from "@/lib/names";
import type { LineStatus } from "@/lib/status";

/**
 * Every change to a request goes through here, so the emails and the
 * Activity rows always go with it. Each change re-reads the Sheet first
 * (bypassing the cache), checks the lines are still in the state the page
 * showed, and writes only if they are.
 */

const ADMINS = "*admins";

async function fresh(deps: DomainDeps): Promise<Core> {
  deps.db.invalidate();
  return loadCore(deps);
}

const requestOf = (core: Core, id: string) => core.requests.find((r) => r.id === id);

/** Groups lines by who decides them: an owner's email, or ADMINS. */
function byDecider(core: Core, lines: LineRow[]): Map<string, LineRow[]> {
  const groups = new Map<string, LineRow[]>();
  for (const line of lines) {
    const key = deciderOf(core, line)?.email ?? ADMINS;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return groups;
}

const recipients = (core: Core, key: string) => (key === ADMINS ? adminEmails(core.users) : [key]);

// ---------------------------------------------------------------------------
// Submitting

export interface SubmitInput {
  borrowerEmail: string;
  eventType: string;
  eventName: string;
  pickupDate: string;
  returnDate: string;
  note: string;
  lines: { itemId: string; qty: number }[];
  linkBase: string;
}

/** Puts the quantities for the same item together and drops zeros. */
function mergeLines(lines: SubmitInput["lines"]): { itemId: string; qty: number }[] {
  const merged = new Map<string, number>();
  for (const { itemId, qty } of lines) {
    if (!Number.isInteger(qty) || qty <= 0) continue;
    merged.set(itemId, (merged.get(itemId) ?? 0) + qty);
  }
  return [...merged].map(([itemId, qty]) => ({ itemId, qty }));
}

export async function submitRequest(input: SubmitInput, deps: DomainDeps): Promise<Result<{ requestId: string }>> {
  const core = await fresh(deps);
  const today = todayOf(deps);
  const now = deps.now().toISOString();
  const me = findUser(core.users, input.borrowerEmail);
  if (me?.status !== "approved") return fail("Your sign-in has expired. Reload the page to sign in again.");

  const eventType = eventTypeNames(core).find((n) => n.toLowerCase() === input.eventType.trim().toLowerCase());
  if (!eventType) return fail("Choose what the equipment is for.", { field: "eventType" });
  const eventName = input.eventName.trim();
  if (!eventName) return fail("Give the event a name, like “Winter Carnival”.", { field: "eventName" });
  if (eventName.length > 100) return fail("Keep the event name under 100 characters.", { field: "eventName" });
  const { pickupDate, returnDate } = input;
  if (!isDay(pickupDate)) return fail("Choose a pickup date.", { field: "pickupDate" });
  if (pickupDate < today) return fail("The pickup date can't be in the past.", { field: "pickupDate" });
  if (!isDay(returnDate) || returnDate < pickupDate) return fail("Choose a return date on or after the pickup date.", { field: "returnDate" });
  if (daysBetween(pickupDate, returnDate) > 365) return fail("Choose a return date within a year of pickup.", { field: "returnDate" });
  const note = input.note.trim();
  if (note.length > 1000) return fail("Keep the note under 1,000 characters.", { field: "note" });

  const wanted = mergeLines(input.lines);
  if (wanted.length === 0) return fail("Add at least one item to the request.");
  const items = itemMap(core);
  const all = bookings(core);
  const lineErrors: Record<string, string> = {};
  for (const { itemId, qty } of wanted) {
    const item = items.get(itemId);
    if (!item || item.archived) {
      lineErrors[itemId] = "This item is no longer lent. Remove it from the request.";
      continue;
    }
    const { free } = freeOver(item.quantity, all, itemId, pickupDate, returnDate, today);
    if (qty > free) lineErrors[itemId] = free <= 0 ? "None free on these dates." : `Only ${free} free on these dates.`;
  }
  if (Object.keys(lineErrors).length > 0) return fail("Some items aren't available in those numbers. Change the quantity or the dates.", { lineErrors });

  const draft: RequestRow = {
    ...blankRow("requests"),
    id: formatId("R-", maxSequence(core.requests.map((r) => r.id), "R-") + 1),
    created_at: now,
    borrower_email: me.email,
    event_type: eventType,
    event_name: eventName,
    pickup_date: pickupDate,
    return_date: returnDate,
    borrower_note: note,
  };
  await deps.db.append("requests", [draft]);
  const request = { ...draft, id: await settleId(deps, draft) };

  const lines: LineRow[] = wanted.map(({ itemId, qty }, i) => {
    const item = items.get(itemId)!;
    // Borrowing your own item needs nobody's approval.
    const own = ownerOf(item, core.users)?.email === me.email;
    return {
      ...blankRow("lines"),
      id: `${request.id}-${i + 1}`,
      request_id: request.id,
      item_id: itemId,
      item_name: item.name,
      qty_requested: qty,
      qty_approved: own ? qty : 0,
      status: own ? "Approved" : "Pending",
      decided_by: own ? me.email : "",
      decided_at: own ? now : "",
    };
  });
  await deps.db.append("lines", lines);
  await logActivity(deps, me.email, [
    { action: "submitted", request_id: request.id, detail: `${request.event_name}, ${request.pickup_date} to ${request.return_date}, ${plural(lines.length, "item")}` },
    ...lines.filter((l) => l.status === "Approved").map((l) => ({ action: "approved", request_id: request.id, line_id: l.id, item_id: l.item_id, detail: `own item, ${l.qty_approved}` })),
  ]);

  const after: Core = { ...core, requests: [...core.requests, request], lines: [...core.lines, ...lines] };
  const pending = lines.filter((l) => l.status === "Pending");
  if (pending.length === 0) {
    await confirmIfDecided(request.id, input.linkBase, deps);
  } else {
    await trySend(deps, { to: [me.email] }, submittedEmail(after, request, lines, input.linkBase));
    for (const [key, group] of byDecider(after, pending)) {
      await trySend(
        deps,
        { to: recipients(after, key), replyTo: [{ email: me.email, name: me.name || me.email }] },
        decideEmail(after, request, group, warningsFor(after, request, group, today), input.linkBase),
      );
    }
  }
  return { ok: true, requestId: request.id };
}

/**
 * Request IDs are sequential, and the Sheet has no transactions, so two
 * requests sent in the same moment could both take R-0142. After appending,
 * the request re-reads the tab: if an earlier row holds the same ID, this one
 * moves to the next free number. Lines are written only after, so they always
 * point at the final ID.
 */
async function settleId(deps: DomainDeps, draft: RequestRow): Promise<string> {
  const mine = (r: RequestRow) => r.created_at === draft.created_at && r.borrower_email === draft.borrower_email;
  let id = draft.id;
  for (let attempt = 0; attempt < 5; attempt++) {
    deps.db.invalidate();
    const { requests } = await deps.db.load("requests");
    const same = requests.filter((r) => r.id === id);
    if (same.length <= 1 || mine(same[0])) return id;
    const next = formatId("R-", maxSequence(requests.map((r) => r.id), "R-") + 1);
    await deps.db.update("requests", [{ match: (r) => r.id === id && mine(r), patch: { id: next } }]);
    id = next;
  }
  return id;
}

/** What an owner should know before deciding: how many are free, and who else wants them. */
export function warningsFor(core: Core, request: RequestRow, lines: LineRow[], today: Day): LineWarning[] {
  const all = bookings(core);
  const requests = new Map(core.requests.map((r) => [r.id, r]));
  const items = itemMap(core);
  const out: LineWarning[] = [];
  for (const line of lines) {
    const item = items.get(line.item_id);
    if (!item) continue;
    const range = freeOver(item.quantity, all, item.id, request.pickup_date, request.return_date, today, line.id);
    if (line.qty_requested > range.free) {
      out.push({ lineId: line.id, text: overbookText(line.qty_requested, range.free, range.tightestDay, range.heldOnTightestDay, item.quantity) });
    } else if (range.free < item.quantity) {
      out.push({ lineId: line.id, text: `${range.free} of ${item.quantity} free on these dates` });
    }
    const others = pendingOverlaps(all, item.id, request.pickup_date, request.return_date, request.id);
    if (others.length > 0) {
      const names = others.map((o) => {
        const r = requests.get(o.requestId);
        return r ? `${r.event_name} (${shortNameOf(core.users, r.borrower_email)}, ${o.qty})` : o.requestId;
      });
      out.push({ lineId: line.id, text: `Also pending for these dates: ${names.join(", ")}` });
    }
  }
  return out;
}

export function overbookText(qty: number, free: number, day: Day, held: number, quantity: number): string {
  return `Approving ${qty} would overbook ${formatMonthDay(day)} by ${qty - free}. Approved bookings hold ${held} of ${quantity}.`;
}

// ---------------------------------------------------------------------------
// Deciding

export interface Decision {
  lineId: string;
  action: "approve" | "decline";
  qty: number;
  /** Required to decline: the reason the borrower sees. */
  reason: string;
  /** The owner saw the overbooking warning and approves anyway. */
  overbook: boolean;
}

export interface DecideInput {
  actorEmail: string;
  requestId: string;
  decisions: Decision[];
  /** One note to the borrower, shown in the confirmation email. */
  ownerNote: string;
  linkBase: string;
}

export async function decideLines(input: DecideInput, deps: DomainDeps): Promise<Result<{ confirmed: boolean }>> {
  const core = await fresh(deps);
  const today = todayOf(deps);
  const now = deps.now().toISOString();
  const actor = findUser(core.users, input.actorEmail);
  const request = requestOf(core, input.requestId);
  if (!request) return fail("That request doesn't exist.");
  if (input.decisions.length === 0) return fail("Choose Approve or Decline for at least one item.");
  const ownerNote = input.ownerNote.trim();
  if (ownerNote.length > 1000) return fail("Keep the note under 1,000 characters.", { field: "ownerNote" });

  const lines = linesOf(core, request.id);
  const items = itemMap(core);
  const all = bookings(core);
  const lineErrors: Record<string, string> = {};
  const overbook: string[] = [];
  const changes: { line: LineRow; patch: Partial<LineRow> }[] = [];
  for (const d of input.decisions) {
    const line = lines.find((l) => l.id === d.lineId);
    if (!line) return fail(CHANGED);
    if (line.status !== "Pending") return fail(`${line.item_name} was already ${line.status.toLowerCase()}. ${CHANGED}`);
    if (!canDecide(core, actor, line)) return fail(`You can't decide ${line.item_name}; it belongs to someone else.`);
    if (d.action === "decline") {
      const reason = d.reason.trim();
      if (!reason) {
        lineErrors[line.id] = "Say why, so the borrower knows.";
        continue;
      }
      changes.push({ line, patch: { status: "Declined", qty_approved: 0, decision_note: reason.slice(0, 500) } });
      continue;
    }
    if (!Number.isInteger(d.qty) || d.qty < 1 || d.qty > line.qty_requested) {
      lineErrors[line.id] = `Approve between 1 and ${line.qty_requested}.`;
      continue;
    }
    const item = items.get(line.item_id);
    const range = freeOver(item?.quantity ?? 0, all, line.item_id, request.pickup_date, request.return_date, today, line.id);
    if (d.qty > range.free && !d.overbook) {
      lineErrors[line.id] = overbookText(d.qty, range.free, range.tightestDay, range.heldOnTightestDay, item?.quantity ?? 0);
      overbook.push(line.id);
      continue;
    }
    changes.push({ line, patch: { status: "Approved", qty_approved: d.qty, decision_note: d.reason.trim().slice(0, 500) } });
  }
  if (Object.keys(lineErrors).length > 0) {
    return fail(overbook.length > 0 ? "Approving would overbook. Approve fewer, or tick “Approve anyway”." : "Fix the items marked below.", { lineErrors, overbook });
  }

  const outcome = await deps.db.update(
    "lines",
    changes.map(({ line, patch }) => ({
      match: byKey("lines", line.id),
      expect: (r) => r.status === "Pending",
      patch: { ...patch, decided_by: actor!.email, decided_at: now, owner_note: ownerNote },
    })),
  );
  if (!outcome.ok) return fail(CHANGED);
  await logActivity(
    deps,
    actor!.email,
    changes.map(({ line, patch }) => ({
      action: patch.status === "Approved" ? "approved" : "declined",
      request_id: request.id,
      line_id: line.id,
      item_id: line.item_id,
      detail: patch.status === "Approved" ? `${patch.qty_approved} of ${line.qty_requested}` : (patch.decision_note ?? ""),
    })),
  );
  const confirmed = await confirmIfDecided(request.id, input.linkBase, deps);
  return { ok: true, confirmed };
}

/**
 * Sends the borrower's confirmation once nothing on the request is pending,
 * at most once: `confirmed_at` is claimed before the email goes, so two
 * owners finishing at the same moment can't both send it. Nothing is sent
 * when every line was cancelled.
 */
export async function confirmIfDecided(requestId: string, linkBase: string, deps: DomainDeps): Promise<boolean> {
  const core = await fresh(deps);
  const request = requestOf(core, requestId);
  if (!request || request.confirmed_at) return false;
  const lines = linesOf(core, requestId);
  if (lines.some((l) => l.status === "Pending")) return false;
  const decided = lines.filter((l) => l.status === "Approved" || l.status === "Declined" || l.status === "Picked up");
  if (decided.length === 0) return false;
  const claim = await deps.db.update("requests", [{ match: byKey("requests", requestId), expect: (r) => !r.confirmed_at, patch: { confirmed_at: deps.now().toISOString() } }]);
  if (!claim.ok) return false;
  const deciders = [...new Set(decided.map((l) => l.decided_by).filter((e) => e && e !== request.borrower_email))];
  await trySend(
    deps,
    { to: [request.borrower_email], replyTo: deciders.map((email) => ({ email, name: fullNameOf(core.users, email) })) },
    confirmationEmail(core, request, lines, linkBase),
  );
  return true;
}

// ---------------------------------------------------------------------------
// Cancelling

export interface CancelInput {
  actorEmail: string;
  requestId: string;
  /** The lines to cancel, or "all" for every line that can still be cancelled. */
  lineIds: string[] | "all";
  /** Required when an owner or admin cancels: emailed to the borrower. */
  reason: string;
  linkBase: string;
}

/**
 * The borrower can cancel any line that isn't picked up yet. An owner or
 * admin can cancel an approved line before pickup, with a note to the
 * borrower; a pending line they decline instead.
 */
export async function cancelLines(input: CancelInput, deps: DomainDeps): Promise<Result<{ cancelled: number }>> {
  const core = await fresh(deps);
  const now = deps.now().toISOString();
  const actor = findUser(core.users, input.actorEmail);
  const request = requestOf(core, input.requestId);
  if (!request || !actor) return fail("That request doesn't exist.");
  const lines = linesOf(core, request.id);
  const chosen = input.lineIds === "all" ? lines : lines.filter((l) => (input.lineIds as string[]).includes(l.id));
  if (input.lineIds !== "all" && chosen.length !== input.lineIds.length) return fail(CHANGED);
  const isBorrower = actor.email === request.borrower_email;

  let targets: LineRow[];
  const reason = input.reason.trim();
  if (isBorrower) {
    targets = chosen.filter((l) => l.status === "Pending" || l.status === "Approved");
    if (input.lineIds !== "all" && targets.length !== chosen.length) return fail(`That item can't be cancelled now. ${CHANGED}`);
  } else {
    targets = chosen.filter((l) => l.status === "Approved" && canDecide(core, actor, l));
    if (targets.length !== chosen.length || targets.length === 0) return fail("You can only cancel approved items you manage, before they're picked up.");
    if (!reason) return fail("Say why, so the borrower knows.", { field: "reason" });
  }
  if (targets.length === 0) return fail("Nothing on this request can be cancelled now.");

  const seen = new Map(targets.map((l) => [l.id, l.status]));
  const outcome = await deps.db.update(
    "lines",
    targets.map((line) => ({
      match: byKey("lines", line.id),
      expect: (r) => r.status === seen.get(line.id),
      patch: { status: "Cancelled" as LineStatus, cancelled_at: now, cancelled_by: actor.email, cancel_note: reason.slice(0, 500) },
    })),
  );
  if (!outcome.ok) return fail(CHANGED);
  await logActivity(
    deps,
    actor.email,
    targets.map((l) => ({ action: "cancelled", request_id: request.id, line_id: l.id, item_id: l.item_id, detail: reason || `was ${l.status.toLowerCase()}` })),
  );

  if (isBorrower) {
    // Tell the owners, except about the borrower's own items.
    const toTell = targets.filter((l) => l.decided_by !== request.borrower_email);
    for (const [key, group] of byDecider(core, toTell)) {
      await trySend(deps, { to: recipients(core, key) }, borrowerCancelledEmail(core, request, group, input.linkBase));
    }
    await confirmIfDecided(request.id, input.linkBase, deps);
  } else {
    await trySend(
      deps,
      { to: [request.borrower_email], replyTo: [{ email: actor.email, name: actor.name || actor.email }] },
      ownerCancelledEmail(core, request, targets, actor.email, reason, input.linkBase),
    );
  }
  return { ok: true, cancelled: targets.length };
}

// ---------------------------------------------------------------------------
// Pickup and return

export async function markPickedUp(input: { actorEmail: string; requestId: string; lineIds: string[] | "all" }, deps: DomainDeps): Promise<Result<{ count: number }>> {
  const core = await fresh(deps);
  const request = requestOf(core, input.requestId);
  if (!request) return fail("That request doesn't exist.");
  if (request.borrower_email !== input.actorEmail.toLowerCase()) return fail("Only the borrower marks items picked up.");
  const lines = linesOf(core, request.id).filter((l) => input.lineIds === "all" || input.lineIds.includes(l.id));
  const targets = lines.filter((l) => l.status === "Approved");
  if (targets.length === 0 || (input.lineIds !== "all" && targets.length !== input.lineIds.length)) return fail(CHANGED);
  const now = deps.now().toISOString();
  const outcome = await deps.db.update(
    "lines",
    targets.map((l) => ({ match: byKey("lines", l.id), expect: (r) => r.status === "Approved", patch: { status: "Picked up" as LineStatus, picked_up_at: now } })),
  );
  if (!outcome.ok) return fail(CHANGED);
  await logActivity(
    deps,
    request.borrower_email,
    targets.map((l) => ({ action: "picked up", request_id: request.id, line_id: l.id, item_id: l.item_id, detail: String(l.qty_approved) })),
  );
  return { ok: true, count: targets.length };
}

export interface ReturnEntry {
  lineId: string;
  /** The answer to "Everything OK?". An unticked part makes it a problem whatever this says. */
  ok: boolean;
  /** The contents checklist parts that came back. */
  checked: string[];
  notes: string;
  photo?: Uint8Array;
}

export interface ReturnInput {
  actorEmail: string;
  requestId: string;
  entries: ReturnEntry[];
  returnedOn: string;
  linkBase: string;
}

/** The earliest return date that makes sense for a line: its pickup date, or the day it was picked up if earlier. */
export function earliestReturn(request: RequestRow, line: LineRow): Day {
  const pickedUp = line.picked_up_at ? dayOf(new Date(line.picked_up_at)) : "";
  return pickedUp && pickedUp < request.pickup_date ? pickedUp : request.pickup_date;
}

export async function returnLines(input: ReturnInput, deps: DomainDeps): Promise<Result<{ problems: number }>> {
  const core = await fresh(deps);
  const today = todayOf(deps);
  const now = deps.now().toISOString();
  const actor = findUser(core.users, input.actorEmail);
  const request = requestOf(core, input.requestId);
  if (!request || !actor) return fail("That request doesn't exist.");
  if (input.entries.length === 0) return fail("Choose at least one item to return.");
  const items = itemMap(core);
  const lines = linesOf(core, request.id);
  const returnedOn = input.returnedOn;
  if (!isDay(returnedOn) || returnedOn > today) return fail("Choose the day it came back: today or earlier.", { field: "returnedOn" });

  const lineErrors: Record<string, string> = {};
  const prepared: { line: LineRow; patch: Partial<LineRow>; photo?: Uint8Array }[] = [];
  for (const entry of input.entries) {
    const line = lines.find((l) => l.id === entry.lineId);
    if (!line) return fail(CHANGED);
    if (line.status !== "Approved" && line.status !== "Picked up") return fail(`${line.item_name} is already ${line.status.toLowerCase()}. ${CHANGED}`);
    const item = items.get(line.item_id);
    if (actor.email !== request.borrower_email && !canManageItem(actor, item, core.users)) return fail("Only the borrower, the item's owner or an admin can mark it returned.");
    if (returnedOn < earliestReturn(request, line)) {
      return fail(line.status === "Approved" ? "This hasn't been picked up yet and its pickup date is later. Cancel it instead." : "The return date can't be before pickup.", { field: "returnedOn" });
    }
    const contents = item?.contents ?? [];
    const checked = new Set(entry.checked.map((c) => c.toLowerCase()));
    const missing = contents.filter((c) => !checked.has(c.toLowerCase()));
    const problem = !entry.ok || missing.length > 0;
    const notes = entry.notes.trim().slice(0, 2000);
    if (problem && !notes) {
      lineErrors[line.id] = missing.length > 0 ? `Say what happened to the ${missing.join(", ").toLowerCase()}.` : "Say what's wrong, for the owner and the next borrower.";
      continue;
    }
    prepared.push({
      line,
      photo: entry.photo,
      patch: { status: "Returned", returned_on: returnedOn, returned_at: now, returned_by: actor.email, return_ok: problem ? "no" : "yes", return_notes: notes, missing_parts: missing },
    });
  }
  if (Object.keys(lineErrors).length > 0) return fail("Add a note for each problem.", { lineErrors });

  for (const p of prepared) {
    if (!p.photo || p.photo.byteLength === 0) continue;
    try {
      p.patch.return_photo_id = await storeReturnPhoto(deps.files, p.photo, actor.email, p.line.id);
    } catch (error) {
      if (error instanceof PhotoError) return fail(error.message, { lineErrors: { [p.line.id]: error.message } });
      throw error;
    }
  }

  const seen = new Map(prepared.map((p) => [p.line.id, p.line.status]));
  const outcome = await deps.db.update(
    "lines",
    prepared.map(({ line, patch }) => ({ match: byKey("lines", line.id), expect: (r) => r.status === seen.get(line.id), patch })),
  );
  if (!outcome.ok) return fail(CHANGED);
  await logActivity(
    deps,
    actor.email,
    prepared.map(({ line, patch }) => ({
      action: patch.return_ok === "no" ? "returned with a problem" : "returned",
      request_id: request.id,
      line_id: line.id,
      item_id: line.item_id,
      detail: [returnedOn, patch.missing_parts?.length ? `missing ${patch.missing_parts.join(", ")}` : ""].filter(Boolean).join("; "),
    })),
  );

  const problems = prepared.filter((p) => p.patch.return_ok === "no");
  for (const p of problems) {
    const line = { ...p.line, ...p.patch } as LineRow;
    await trySend(
      deps,
      { to: itemContacts(items.get(line.item_id), core.users), replyTo: [{ email: request.borrower_email, name: fullNameOf(core.users, request.borrower_email) }] },
      problemEmail(core, request, line, actor.email, input.linkBase),
    );
  }
  return { ok: true, problems: problems.length };
}

// ---------------------------------------------------------------------------
// Problems

export async function clearProblem(
  input: { actorEmail: string; lineId: string; note: string; quantity?: number },
  deps: DomainDeps,
): Promise<Result> {
  const core = await fresh(deps);
  const now = deps.now().toISOString();
  const actor = findUser(core.users, input.actorEmail);
  const line = core.lines.find((l) => l.id === input.lineId);
  if (!line || !actor) return fail("That return doesn't exist.");
  const item = core.items.find((i) => i.id === line.item_id);
  if (!canManageItem(actor, item, core.users)) return fail("Only the item's owner or an admin can clear a problem.");
  if (line.return_ok !== "no" || line.problem_cleared_at) return fail("That problem was already cleared.");
  const note = input.note.trim();
  if (!note) return fail("Say what was done, like “Replaced the scoop”.", { field: "note" });
  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 9999)) {
    return fail("Enter the quantity as a whole number.", { field: "quantity" });
  }

  const outcome = await deps.db.update("lines", [
    { match: byKey("lines", line.id), expect: (r) => !r.problem_cleared_at, patch: { problem_cleared_at: now, problem_cleared_by: actor.email, problem_cleared_note: note.slice(0, 500) } },
  ]);
  if (!outcome.ok) return fail("Someone else cleared it first.");
  const activity = [{ action: "cleared problem", request_id: line.request_id, line_id: line.id, item_id: line.item_id, detail: note }];
  if (item && input.quantity !== undefined && input.quantity !== item.quantity) {
    await deps.db.update("items", [{ match: byKey("items", item.id), patch: { quantity: input.quantity, updated_at: now } }]);
    activity.push({ action: "changed quantity", request_id: "", line_id: "", item_id: item.id, detail: `${item.quantity} to ${input.quantity}` });
  }
  await logActivity(deps, actor.email, activity);
  return { ok: true };
}
