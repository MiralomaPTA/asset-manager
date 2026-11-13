import { describe, expect, it } from "vitest";
import { addDays, dayOf, daysBetween, eachDay, formatDay, isDay, parseDay } from "@/lib/dates";
import { freeOver, holdsOn, statusToday, type Booking } from "@/lib/availability";
import { requestStatus } from "@/lib/status";
import { bool, csv, int, multiline, oneOf } from "@/server/db/codecs";
import { Db, byKey } from "@/server/db/db";
import { memorySheetStore } from "@/server/adapters/memory/sheets";
import { blankRow } from "@/server/db/schema";

describe("dates", () => {
  it("does day arithmetic across month ends and DST", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetween("2026-12-10", "2026-12-12")).toBe(2);
    expect(eachDay("2026-12-10", "2026-12-12")).toEqual(["2026-12-10", "2026-12-11", "2026-12-12"]);
    expect(eachDay("2026-12-12", "2026-12-10")).toEqual([]);
  });

  it("finds the Pacific day of an instant", () => {
    // 2026-12-11 07:30 UTC is still Dec 10 in San Francisco.
    expect(dayOf(new Date("2026-12-11T07:30:00Z"))).toBe("2026-12-10");
    expect(dayOf(new Date("2026-12-11T08:30:00Z"))).toBe("2026-12-11");
  });

  it("reads days typed into the Sheet", () => {
    expect(parseDay("2026-12-11")).toBe("2026-12-11");
    expect(parseDay(" 12/1/2026 ")).toBe("2026-12-01");
    expect(parseDay("2026-02-30")).toBe("");
    expect(parseDay("next Friday")).toBe("");
    expect(isDay("2026-13-01")).toBe(false);
  });

  it("formats days", () => {
    expect(formatDay("2026-12-11")).toBe("Fri Dec 11");
  });
});

describe("codecs", () => {
  it("parses hand-typed cells forgivingly", () => {
    expect(int.parse(" 1,200 ")).toBe(1200);
    expect(int.parse("lots")).toBe(0);
    expect(bool().parse("TRUE")).toBe(true);
    expect(bool().parse("")).toBe(false);
    expect(bool(true).parse("")).toBe(true);
    expect(csv.parse("Outdoor, ,outdoor, Power")).toEqual(["Outdoor", "Power"]);
    expect(multiline.parse("Kettle\r\nScoop\n\nKettle")).toEqual(["Kettle", "Scoop"]);
    expect(oneOf(["Pending", "Picked up"] as const, "Pending").parse("PickedUp")).toBe("Picked up");
  });
});

describe("availability", () => {
  const today = "2026-12-08";
  const b = (over: Partial<Booking>): Booking => ({ lineId: "L", requestId: "R", itemId: "chairs", status: "Approved", qty: 10, pickup: "2026-12-10", ret: "2026-12-12", ...over });

  it("holds approved units on every day of the range, inclusive", () => {
    const booking = b({});
    expect(holdsOn(booking, "2026-12-09", today)).toBe(false);
    expect(holdsOn(booking, "2026-12-10", today)).toBe(true);
    expect(holdsOn(booking, "2026-12-12", today)).toBe(true);
    expect(holdsOn(booking, "2026-12-13", today)).toBe(false);
  });

  it("ignores pending lines", () => {
    expect(holdsOn(b({ status: "Pending" }), "2026-12-10", today)).toBe(false);
  });

  it("holds an overdue line's units through today but not after", () => {
    const overdue = b({ pickup: "2026-12-01", ret: "2026-12-05", status: "Picked up" });
    expect(holdsOn(overdue, "2026-12-07", today)).toBe(true);
    expect(holdsOn(overdue, today, today)).toBe(true);
    expect(holdsOn(overdue, "2026-12-09", today)).toBe(false);
  });

  it("finds the fewest free units over a range", () => {
    const bookings = [b({ lineId: "a", qty: 20 }), b({ lineId: "b", qty: 10, pickup: "2026-12-12", ret: "2026-12-14" })];
    expect(freeOver(40, bookings, "chairs", "2026-12-09", "2026-12-11", today).free).toBe(20);
    const tight = freeOver(40, bookings, "chairs", "2026-12-11", "2026-12-14", today);
    expect(tight).toEqual({ free: 10, tightestDay: "2026-12-12", heldOnTightestDay: 30 });
    expect(freeOver(40, bookings, "chairs", "2026-12-11", "2026-12-14", today, "a").free).toBe(30);
  });

  it("describes an item's status today", () => {
    expect(statusToday(0, [], "chairs", today)).toEqual({ kind: "unavailable" });
    expect(statusToday(40, [], "chairs", today)).toEqual({ kind: "available" });
    const now = [b({ pickup: "2026-12-07", ret: "2026-12-09", qty: 30 })];
    expect(statusToday(40, now, "chairs", today)).toEqual({ kind: "partial", free: 10, total: 40 });
    expect(statusToday(30, now, "chairs", today)).toEqual({ kind: "out", backOn: "2026-12-09" });
    const late = [b({ pickup: "2026-11-25", ret: "2026-11-29", qty: 1, status: "Picked up" })];
    expect(statusToday(1, late, "chairs", today)).toEqual({ kind: "overdue", since: "2026-11-30" });
  });
});

describe("request status", () => {
  it("follows the lines", () => {
    expect(requestStatus(["Pending", "Approved"])).toBe("Waiting for approval");
    expect(requestStatus(["Approved", "Declined"])).toBe("Approved");
    expect(requestStatus(["Picked up", "Pending"])).toBe("Out");
    expect(requestStatus(["Returned", "Declined"])).toBe("Closed");
    expect(requestStatus(["Declined"])).toBe("Closed");
  });
});

describe("Db", () => {
  it("parses rows, skips keyless ones, and keeps unknown columns on update", async () => {
    const store = memorySheetStore({
      Items: [
        { id: "I-0001", name: "Folding chair", quantity: "40", tags: "Tables & chairs", archived: "", notes: "kept" },
        { id: "", name: "half-typed row" },
      ],
    });
    const db = new Db(store, 0);
    const { items } = await db.load("items");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "I-0001", quantity: 40, tags: ["Tables & chairs"], archived: false, contents: [] });

    const outcome = await db.update("items", [{ match: byKey("items", "i-0001"), patch: { quantity: 30 } }]);
    expect(outcome).toEqual({ ok: true });
    expect(store.tabs.Items[0]).toMatchObject({ quantity: "30", notes: "kept", name: "Folding chair" });
  });

  it("writes nothing when any expectation fails", async () => {
    const store = memorySheetStore({ Lines: [{ id: "A", status: "Pending" }, { id: "B", status: "Approved" }] });
    const db = new Db(store, 0);
    const outcome = await db.update("lines", [
      { match: byKey("lines", "A"), expect: (r) => r.status === "Pending", patch: { status: "Approved" } },
      { match: byKey("lines", "B"), expect: (r) => r.status === "Pending", patch: { status: "Approved" } },
    ]);
    expect(outcome).toEqual({ ok: false, reason: "conflict", change: 1 });
    expect(store.tabs.Lines[0].status).toBe("Pending");
  });

  it("serves reads from the cache until a write", async () => {
    const store = memorySheetStore({ Items: [{ id: "I-1", name: "Cooler" }] });
    let now = 0;
    const db = new Db(store, 1000, () => now);
    await db.load("items");
    store.tabs.Items.push({ id: "I-2", name: "Tent" });
    expect((await db.load("items")).items).toHaveLength(1);
    await db.append("items", [{ ...blankRow("items"), id: "I-3", name: "Urn" }]);
    expect((await db.load("items")).items).toHaveLength(3);
    now = 5000;
    expect((await db.load("items")).items).toHaveLength(3);
  });
});
