import type { Core } from "@/server/data";
import { lineQty, locationOf } from "@/server/data";
import type { ItemRow, LineRow, RequestRow } from "@/server/db/schema";
import { b, box, button, fine, h, items, note, p, type Block, type Email, type ItemRow as EmailItem } from "@/server/email/render";
import { findUser, fullNameOf, shortNameOf } from "@/server/users";
import { formatDay, formatDayRange } from "@/lib/dates";
import { firstName } from "@/lib/names";

/** The emails about requests. Each takes the snapshot the change was made against. */

const requestUrl = (base: string, id: string) => `${base}/requests/${id}`;
const reviewUrl = (base: string, id: string) => `${base}/review/${id}`;

function itemOf(core: Core, line: LineRow): ItemRow | undefined {
  return core.items.find((i) => i.id === line.item_id);
}

const dates = (r: RequestRow) => formatDayRange(r.pickup_date, r.return_date);
const qty = (n: number) => `× ${n}`;

export function submittedEmail(core: Core, request: RequestRow, lines: LineRow[], linkBase: string): Email {
  const borrower = findUser(core.users, request.borrower_email);
  return {
    subject: `Request ${request.id} sent: ${request.event_name}`,
    blocks: [
      p(`Hi ${firstName(borrower?.name ?? "", request.borrower_email)},`),
      p(
        "Your request for ",
        b(request.event_name),
        ` (${dates(request)}) went to the owners of these items. You'll get one email once every item is decided, with pickup instructions.`,
      ),
      items(lines.map((l) => ({ title: l.item_name, qty: qty(l.qty_requested), detail: l.status === "Approved" ? "Approved: it's your own item" : undefined }))),
      button("Open your request", requestUrl(linkBase, request.id)),
      fine("To change the dates or items, cancel the request and send a new one."),
    ],
  };
}

export interface LineWarning {
  lineId: string;
  text: string;
}

/** To an owner (or the admins) about the lines they decide. */
export function decideEmail(core: Core, request: RequestRow, lines: LineRow[], warnings: LineWarning[], linkBase: string): Email {
  const borrower = findUser(core.users, request.borrower_email);
  const who = borrower?.name || request.borrower_email;
  const blocks: Block[] = [
    p(b(who), ` asked to borrow ${lines.length === 1 ? "this" : "these"} for `, b(request.event_name), ` (${request.event_type}), ${dates(request)}:`),
    items(
      lines.map((l) => {
        const warning = warnings.filter((w) => w.lineId === l.id).map((w) => w.text);
        return { title: l.item_name, qty: qty(l.qty_requested), detail: warning.join("\n") || undefined, warn: warning.length > 0 };
      }),
    ),
  ];
  if (request.borrower_note) blocks.push(note(`Note from ${firstName(who)}`, request.borrower_note));
  blocks.push(button(lines.length === 1 ? "Approve or decline" : "Approve or decline each item", reviewUrl(linkBase, request.id)));
  if (borrower?.phone) blocks.push(fine(`${who}: ${borrower.phone} · ${request.borrower_email}. Reply to this email to reach them.`));
  return { subject: `To decide: ${request.event_name} · ${shortNameOf(core.users, request.borrower_email)} · ${formatDay(request.pickup_date)}`, blocks };
}

/**
 * The one email a borrower gets once every line is decided: approved items
 * grouped by where to pick them up, with each place's instructions, the
 * owners' notes and each item's contents; then anything declined, with why.
 */
export function confirmationEmail(core: Core, request: RequestRow, lines: LineRow[], linkBase: string): Email {
  const borrower = findUser(core.users, request.borrower_email);
  const approved = lines.filter((l) => l.status === "Approved" || l.status === "Picked up");
  const declined = lines.filter((l) => l.status === "Declined");

  const byPlace = new Map<string, LineRow[]>();
  for (const line of approved) {
    const place = itemOf(core, line)?.location || "Ask the owner";
    byPlace.set(place, [...(byPlace.get(place) ?? []), line]);
  }

  const noted = new Set<string>();
  const blocks: Block[] = [p(`Hi ${firstName(borrower?.name ?? "", request.borrower_email)},`)];
  if (approved.length > 0) {
    blocks.push(
      p(
        `Everything on your ${request.event_name} request has been decided. Pick up on `,
        b(formatDay(request.pickup_date)),
        " and return by ",
        b(formatDay(request.return_date)),
        ".",
      ),
    );
  } else {
    blocks.push(p(`Sorry, nothing on your ${request.event_name} request (${dates(request)}) could be lent this time.`));
  }

  for (const [place, placeLines] of byPlace) {
    const location = locationOf(core, place);
    blocks.push(h(place));
    if (location?.pickup_instructions) blocks.push(box("Pickup", location.pickup_instructions));
    if (location?.address) blocks.push(fine(location.address));
    blocks.push(
      items(
        placeLines.map((l): EmailItem => {
          const contents = itemOf(core, l)?.contents ?? [];
          const fewer = l.qty_approved < l.qty_requested ? `${l.qty_approved} of the ${l.qty_requested} you asked for` : "";
          const detail = [fewer, contents.length > 0 ? `In the box: ${contents.join(", ").toLowerCase()}` : ""].filter(Boolean).join("\n");
          return { title: l.item_name, qty: qty(lineQty(l)), mark: "ok", detail: detail || undefined, warn: Boolean(fewer) };
        }),
      ),
    );
    for (const line of placeLines) {
      const key = `${line.decided_by}\n${line.owner_note}`;
      if (!line.owner_note || noted.has(key)) continue;
      noted.add(key);
      blocks.push(note(`Note from ${shortNameOf(core.users, line.decided_by)}`, line.owner_note));
    }
  }

  if (declined.length > 0) {
    blocks.push(h("Not approved"));
    blocks.push(items(declined.map((l) => ({ title: l.item_name, qty: qty(l.qty_requested), mark: "no", detail: l.decision_note || undefined }))));
    for (const line of declined) {
      const key = `${line.decided_by}\n${line.owner_note}`;
      if (!line.owner_note || noted.has(key)) continue;
      noted.add(key);
      blocks.push(note(`Note from ${shortNameOf(core.users, line.decided_by)}`, line.owner_note));
    }
  }

  blocks.push(button("Open your request", requestUrl(linkBase, request.id)));
  if (approved.length > 0) {
    blocks.push(p("On the request page, tap ", b("Picked up"), " when you collect everything and ", b("Returned"), " when it's back."));
  }
  return {
    subject: approved.length > 0 ? `Approved: ${request.event_name} · pick up ${formatDay(request.pickup_date)}` : `Not approved: ${request.event_name}`,
    blocks,
  };
}

export function ownerCancelledEmail(core: Core, request: RequestRow, lines: LineRow[], cancelledBy: string, reason: string, linkBase: string): Email {
  const borrower = findUser(core.users, request.borrower_email);
  const by = fullNameOf(core.users, cancelledBy);
  return {
    subject: `Cancelled: ${lines.map((l) => l.item_name).join(", ")} for ${request.event_name}`,
    blocks: [
      p(`Hi ${firstName(borrower?.name ?? "", request.borrower_email)},`),
      p(`${by} cancelled ${lines.length === 1 ? "this item" : "these items"} on your ${request.event_name} request (${dates(request)}):`),
      items(lines.map((l) => ({ title: l.item_name, qty: qty(lineQty(l)), mark: "no" }))),
      note(`Note from ${shortNameOf(core.users, cancelledBy)}`, reason),
      button("Open your request", requestUrl(linkBase, request.id)),
    ],
  };
}

export function borrowerCancelledEmail(core: Core, request: RequestRow, lines: LineRow[], linkBase: string): Email {
  const who = fullNameOf(core.users, request.borrower_email);
  return {
    subject: `Cancelled: ${request.event_name} · ${shortNameOf(core.users, request.borrower_email)}`,
    blocks: [
      p(b(who), ` cancelled ${lines.length === 1 ? "this item" : "these items"} for `, b(request.event_name), ` (${dates(request)}):`),
      items(lines.map((l) => ({ title: l.item_name, qty: qty(lineQty(l)), detail: l.status === "Approved" ? "Was approved; the units are free again" : "Was waiting for your decision" }))),
      button("Open the request", reviewUrl(linkBase, request.id)),
      fine("Nothing else to do."),
    ],
  };
}

export function problemEmail(core: Core, request: RequestRow, line: LineRow, returnedBy: string, linkBase: string): Email {
  const who = fullNameOf(core.users, request.borrower_email);
  const marker = returnedBy && returnedBy !== request.borrower_email ? ` (marked returned by ${fullNameOf(core.users, returnedBy)})` : "";
  const blocks: Block[] = [
    p(b(line.item_name), ` came back from ${request.event_name} with a problem, reported by ${who}${marker}.`),
  ];
  if (line.missing_parts.length > 0) blocks.push(items(line.missing_parts.map((part) => ({ title: part, mark: "no", detail: "Missing" }))));
  if (line.return_notes) blocks.push(note(`Notes from ${firstName(who)}`, line.return_notes));
  if (line.return_photo_id) blocks.push(p({ link: "See the photo", href: `${linkBase}/photos/${line.return_photo_id}` }));
  blocks.push(p(`The item shows "Problem reported" until you clear it. It can still be requested. If something broke, you can lower its quantity when you clear the flag.`));
  blocks.push(button("Review and clear the flag", `${linkBase}/items/${line.item_id}#problem`));
  return { subject: `Problem reported: ${line.item_name} · ${request.event_name}`, blocks };
}
