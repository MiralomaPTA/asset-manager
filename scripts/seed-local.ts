/**
 * Fills .data/sheet/ with sample data for local development: the items,
 * people and bookings from the mockups, with dates around today.
 *
 *   npm run seed            # refuses if .data/sheet already has data
 *   npm run seed -- --force # replaces it
 *
 * Sign in as admin@example.com (an admin who owns nothing), dana@example.com
 * (owns most items), chris@example.com (owns the coolers) or
 * jordan@example.com (a borrower). The sign-in link is printed by `npm run dev`
 * and saved in .data/outbox/.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addDays, today } from "../src/lib/dates";

const dir = path.join(process.cwd(), process.env.LOCAL_DATA_DIR ?? ".data", "sheet");
const force = process.argv.includes("--force");
if (existsSync(dir) && readdirSync(dir).length > 0 && !force) {
  console.error(`${dir} already has data. Run with --force to replace it.`);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const t = today();
const d = (n: number) => addDays(t, n);
const at = (n: number, hour = 10) => new Date(`${d(n)}T${String(hour + 8).padStart(2, "0")}:00:00Z`).toISOString();

const tabs: Record<string, Record<string, string>[]> = {
  Users: [
    { email: "admin@example.com", name: "Alex Admin", phone: "(415) 555-0100", connection: "Volunteer", status: "approved", role: "admin", requested_at: at(-60) },
    { email: "dana@example.com", name: "Dana Lee", phone: "(415) 555-0101", connection: "Parent or guardian", status: "approved", role: "borrower", requested_at: at(-60) },
    { email: "chris@example.com", name: "Chris Wong", phone: "(415) 555-0199", connection: "Parent or guardian", status: "approved", role: "borrower", requested_at: at(-60) },
    { email: "jordan@example.com", name: "Jordan Rivera", phone: "(415) 555-0142", connection: "Parent or guardian", status: "approved", role: "borrower", requested_at: at(-40) },
    { email: "sam@example.com", name: "Sam Kim", phone: "(415) 555-0177", connection: "Staff", status: "approved", role: "borrower", requested_at: at(-40) },
    { email: "priya@example.com", name: "Priya Shah", phone: "(415) 555-0160", connection: "Volunteer", status: "approved", role: "borrower", requested_at: at(-40) },
    { email: "newparent@example.com", name: "Morgan Ellis", phone: "(415) 555-0188", connection: "Parent or guardian", status: "pending", role: "borrower", requested_at: at(-1) },
  ],
  Locations: [
    {
      name: "Auditorium storage",
      address: "Miraloma Elementary, side door by the auditorium",
      pickup_instructions: "Side door by the auditorium. Get the key from the front office, 7:30 am – 4 pm on school days.",
      return_instructions: "Chairs stacked 10 high on rack B, tables against the back wall, popcorn machine on the low shelf. Key goes back to the front office.",
    },
    { name: "Chris W.'s garage", address: "Near the school; Chris will text the address", pickup_instructions: "Text Chris at (415) 555-0199 to pick a time. Coolers are in the side yard.", return_instructions: "Rinse and dry the coolers, then text Chris." },
    { name: "Front office", address: "Miraloma Elementary, main entrance", pickup_instructions: "Ask at the front desk, 7:30 am – 4 pm on school days.", return_instructions: "Hand it to the front desk." },
  ],
  "Event types": [
    { name: "PTA event", active: "TRUE" },
    { name: "Signup party", active: "TRUE" },
    { name: "Classroom", active: "TRUE" },
    { name: "Other", active: "TRUE" },
  ],
  Items: [
    { id: "I-0001", name: "Folding table, 6 ft", description: "Plastic folding tables. Two people to carry.", tags: "Tables & chairs", location: "Auditorium storage", quantity: "16", owner_email: "dana@example.com" },
    { id: "I-0002", name: "Folding chair", description: "Grey metal folding chairs.", tags: "Tables & chairs", location: "Auditorium storage", quantity: "40", owner_email: "dana@example.com" },
    {
      id: "I-0003",
      name: "Popcorn machine",
      description: "8 oz kettle on a cart. Makes about 100 small bags an hour. Oil and kernels not included.",
      tags: "Food service, Events",
      location: "Auditorium storage",
      quantity: "1",
      owner_email: "dana@example.com",
      contents: "Kettle\nKettle lid\nScoop\nPower cord",
    },
    { id: "I-0004", name: "Cooler, 48 qt", description: "Wheeled coolers.", tags: "Coolers & drinks", location: "Chris W.'s garage", quantity: "3", owner_email: "chris@example.com" },
    { id: "I-0005", name: "Water jug, 5 gal", description: "Insulated jugs with a spigot.", tags: "Coolers & drinks", location: "Auditorium storage", quantity: "4", owner_email: "dana@example.com" },
    { id: "I-0006", name: "Extension cord, 50 ft", description: "Outdoor-rated, orange.", tags: "Power, Outdoor", location: "Front office", quantity: "6", owner_email: "" },
    { id: "I-0007", name: "Coffee urn, 100 cup", description: "Takes about an hour to brew a full urn.", tags: "Food service", location: "Front office", quantity: "1", owner_email: "", contents: "Urn\nBasket\nLid" },
    { id: "I-0008", name: "Canopy tent, 10×10", description: "Pop-up canopy with weights.", tags: "Outdoor, Events", location: "Auditorium storage", quantity: "2", owner_email: "dana@example.com", contents: "Frame\nCanopy top\nCarry bag\n4 weights" },
  ],
  Requests: [],
  Lines: [],
  Activity: [],
  Sends: [],
};

type Line = Record<string, string>;
let seq = 130;
function request(r: { borrower: string; type: string; name: string; pickup: number; ret: number; note?: string; created: number; confirmed?: boolean }, lines: Line[]) {
  const id = `R-${String(++seq).padStart(4, "0")}`;
  tabs.Requests.push({
    id,
    created_at: at(r.created),
    borrower_email: r.borrower,
    event_type: r.type,
    event_name: r.name,
    pickup_date: d(r.pickup),
    return_date: d(r.ret),
    borrower_note: r.note ?? "",
    confirmed_at: r.confirmed ? at(r.created + 1) : "",
  });
  lines.forEach((l, i) => tabs.Lines.push({ id: `${id}-${i + 1}`, request_id: id, ...l }));
}
const decided = (by: string, day: number) => ({ decided_by: by, decided_at: at(day) });

// Past returns: the condition history.
request({ borrower: "jordan@example.com", type: "PTA event", name: "Back-to-school social", pickup: -70, ret: -69, created: -80, confirmed: true }, [
  { item_id: "I-0003", item_name: "Popcorn machine", qty_requested: "1", qty_approved: "1", status: "Returned", ...decided("dana@example.com", -79), picked_up_at: at(-70), returned_on: d(-69), returned_at: at(-69), returned_by: "jordan@example.com", return_ok: "yes", return_notes: "Works great. Unplug before emptying the kettle." },
]);
request({ borrower: "sam@example.com", type: "PTA event", name: "Movie night", pickup: -47, ret: -46, created: -55, confirmed: true }, [
  {
    item_id: "I-0003",
    item_name: "Popcorn machine",
    qty_requested: "1",
    qty_approved: "1",
    status: "Returned",
    ...decided("dana@example.com", -54),
    picked_up_at: at(-47),
    returned_on: d(-46),
    returned_at: at(-46),
    returned_by: "sam@example.com",
    return_ok: "no",
    missing_parts: "Scoop",
    return_notes: "Scoop missing. Probably went home with the cleanup bins.",
    problem_cleared_at: at(-43),
    problem_cleared_by: "dana@example.com",
    problem_cleared_note: "Found it in the cooler bin. Back in the box.",
  },
]);
request({ borrower: "priya@example.com", type: "PTA event", name: "Fall Festival", pickup: -30, ret: -29, created: -40, confirmed: true }, [
  { item_id: "I-0003", item_name: "Popcorn machine", qty_requested: "1", qty_approved: "1", status: "Returned", ...decided("dana@example.com", -39), picked_up_at: at(-30), returned_on: d(-29), returned_at: at(-29), returned_by: "priya@example.com", return_ok: "yes", return_notes: "Cleaned the kettle and wiped the glass. Takes about 5 minutes to heat up, so turn it on early." },
  { item_id: "I-0008", item_name: "Canopy tent, 10×10", qty_requested: "2", qty_approved: "2", status: "Returned", ...decided("dana@example.com", -39), picked_up_at: at(-30), returned_on: d(-29), returned_at: at(-29), returned_by: "priya@example.com", return_ok: "no", missing_parts: "Carry bag", return_notes: "One tent's carry bag ripped and went in the trash. The tent is fine." },
]);

// Overdue: the coffee urn, never brought back.
request({ borrower: "sam@example.com", type: "Classroom", name: "Teacher appreciation breakfast", pickup: -10, ret: -9, created: -16, confirmed: true }, [
  { item_id: "I-0007", item_name: "Coffee urn, 100 cup", qty_requested: "1", qty_approved: "1", status: "Picked up", ...decided("admin@example.com", -15), picked_up_at: at(-10) },
]);

// Out now: the book fair has the water jugs.
request({ borrower: "priya@example.com", type: "PTA event", name: "Book Fair", pickup: -2, ret: 1, created: -9, confirmed: true }, [
  { item_id: "I-0005", item_name: "Water jug, 5 gal", qty_requested: "4", qty_approved: "4", status: "Picked up", ...decided("dana@example.com", -8), picked_up_at: at(-2) },
  { item_id: "I-0006", item_name: "Extension cord, 50 ft", qty_requested: "4", qty_approved: "4", status: "Picked up", ...decided("admin@example.com", -8), picked_up_at: at(-2) },
  { item_id: "I-0001", item_name: "Folding table, 6 ft", qty_requested: "8", qty_approved: "8", status: "Picked up", ...decided("dana@example.com", -8), picked_up_at: at(-2) },
]);

// Approved, coming up.
request({ borrower: "sam@example.com", type: "Classroom", name: "Room 9 science day", pickup: 2, ret: 3, created: -5, confirmed: true }, [
  { item_id: "I-0004", item_name: "Cooler, 48 qt", qty_requested: "1", qty_approved: "1", status: "Approved", ...decided("chris@example.com", -4) },
]);

// Pending: the Winter Carnival from the mockups, and Taco Night competing for chairs.
request(
  { borrower: "jordan@example.com", type: "Signup party", name: "Winter Carnival", pickup: 3, ret: 6, created: -4, note: "Setting up in the yard Friday after school. Everything back Monday by 9 am." },
  [
    { item_id: "I-0001", item_name: "Folding table, 6 ft", qty_requested: "6", status: "Pending" },
    { item_id: "I-0002", item_name: "Folding chair", qty_requested: "30", status: "Pending" },
    { item_id: "I-0003", item_name: "Popcorn machine", qty_requested: "1", status: "Pending" },
    { item_id: "I-0004", item_name: "Cooler, 48 qt", qty_requested: "2", status: "Pending" },
  ],
);
request({ borrower: "sam@example.com", type: "Signup party", name: "Taco Night", pickup: 4, ret: 5, created: -2 }, [
  { item_id: "I-0002", item_name: "Folding chair", qty_requested: "20", status: "Pending" },
  { item_id: "I-0006", item_name: "Extension cord, 50 ft", qty_requested: "2", status: "Pending" },
]);
request({ borrower: "priya@example.com", type: "Classroom", name: "Room 14 holiday party", pickup: 9, ret: 10, created: -1, confirmed: true }, [
  { item_id: "I-0003", item_name: "Popcorn machine", qty_requested: "1", qty_approved: "1", status: "Approved", ...decided("dana@example.com", 0) },
]);

for (const [name, rows] of Object.entries(tabs)) writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rows, null, 2));
console.log(`Seeded ${dir} with ${tabs.Items.length} items and ${tabs.Requests.length} requests around ${t}.`);
