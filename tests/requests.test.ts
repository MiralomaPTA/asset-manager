import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cancelLines, clearProblem, decideLines, markPickedUp, returnLines, submitRequest } from "@/server/domain/requests";
import { loadCore } from "@/server/data";
import { samplePta, testDeps } from "./helpers";

const base = "https://equipment.example.org";

function submit(t: ReturnType<typeof testDeps>, over: Partial<Parameters<typeof submitRequest>[0]> = {}) {
  return submitRequest(
    {
      borrowerEmail: "jordan@example.com",
      eventType: "Signup party",
      eventName: "Winter Carnival",
      pickupDate: "2026-12-11",
      returnDate: "2026-12-14",
      note: "For the carnival booths",
      lines: [
        { itemId: "I-0001", qty: 30 },
        { itemId: "I-0002", qty: 1 },
        { itemId: "I-0003", qty: 2 },
      ],
      linkBase: base,
      ...over,
    },
    t.deps,
  );
}

describe("submitting a request", () => {
  it("records the request and lines and emails the borrower and each owner", async () => {
    const t = testDeps(samplePta());
    const result = await submit(t);
    expect(result).toEqual({ ok: true, requestId: "R-0001" });
    expect(t.store.tabs.Requests).toHaveLength(1);
    expect(t.store.tabs.Lines.map((l) => [l.id, l.status, l.qty_requested])).toEqual([
      ["R-0001-1", "Pending", "30"],
      ["R-0001-2", "Pending", "1"],
      ["R-0001-3", "Pending", "2"],
    ]);
    const mail = t.drain();
    expect(mail.map((m) => [m.to.join(), m.subject])).toEqual([
      ["jordan@example.com", "Request R-0001 sent: Winter Carnival"],
      ["dana@example.com", "To decide: Winter Carnival · Jordan R. · Fri Dec 11"],
      ["chris@example.com", "To decide: Winter Carnival · Jordan R. · Fri Dec 11"],
    ]);
    expect(mail[1].text).toContain("Folding chair × 30");
    expect(mail[1].text).toContain("/review/R-0001");
    expect(mail[1].replyTo).toEqual(["jordan@example.com"]);
    expect(t.store.tabs.Activity.length).toBeGreaterThan(0);
  });

  it("refuses more units than approved bookings leave free, and past dates", async () => {
    const t = testDeps(samplePta());
    expect(await submit(t, { lines: [{ itemId: "I-0003", qty: 4 }] })).toMatchObject({ ok: false, lineErrors: { "I-0003": "Only 3 free on these dates." } });
    expect(await submit(t, { pickupDate: "2026-12-07" })).toMatchObject({ ok: false, field: "pickupDate" });
    expect(await submit(t, { returnDate: "2026-12-10" })).toMatchObject({ ok: false, field: "returnDate" });
    expect(await submit(t, { eventType: "Rave" })).toMatchObject({ ok: false, field: "eventType" });
    expect(t.store.tabs.Requests ?? []).toHaveLength(0);
  });

  it("approves an owner's own items at once and confirms when nothing is pending", async () => {
    const t = testDeps(samplePta());
    const result = await submit(t, { borrowerEmail: "dana@example.com", lines: [{ itemId: "I-0002", qty: 1 }] });
    expect(result.ok).toBe(true);
    expect(t.store.tabs.Lines[0]).toMatchObject({ status: "Approved", qty_approved: "1", decided_by: "dana@example.com" });
    const mail = t.drain();
    expect(mail.map((m) => m.subject)).toEqual(["Approved: Winter Carnival · pick up Fri Dec 11"]);
    expect(t.store.tabs.Requests[0].confirmed_at).not.toBe("");
  });

  it("sends lines for items with no owner to the admins", async () => {
    const t = testDeps(samplePta());
    await submit(t, { lines: [{ itemId: "I-0004", qty: 1 }] });
    const mail = t.drain();
    expect(mail[1].to).toEqual(["admin@example.com"]);
  });

  it("gives simultaneous requests different IDs", async () => {
    const t = testDeps(samplePta());
    const [a, b] = await Promise.all([submit(t, { lines: [{ itemId: "I-0001", qty: 1 }] }), submit(t, { borrowerEmail: "chris@example.com", lines: [{ itemId: "I-0001", qty: 1 }] })]);
    expect(a.ok && b.ok).toBe(true);
    const ids = t.store.tabs.Requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
    const lineRequests = new Set(t.store.tabs.Lines.map((l) => l.request_id));
    expect([...lineRequests].sort()).toEqual([...ids].sort());
  });
});

describe("deciding", () => {
  it("lets each owner decide only their own lines, and confirms once all are decided", async () => {
    const t = testDeps(samplePta());
    await submit(t);
    t.drain();

    const notMine = await decideLines({ actorEmail: "chris@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-1", action: "approve", qty: 30, reason: "", overbook: false }], ownerNote: "", linkBase: base }, t.deps);
    expect(notMine.ok).toBe(false);

    const dana = await decideLines(
      {
        actorEmail: "dana@example.com",
        requestId: "R-0001",
        decisions: [
          { lineId: "R-0001-1", action: "approve", qty: 20, reason: "", overbook: false },
          { lineId: "R-0001-2", action: "approve", qty: 1, reason: "", overbook: false },
        ],
        ownerNote: "Only 20 chairs that weekend, sorry!",
        linkBase: base,
      },
      t.deps,
    );
    expect(dana).toEqual({ ok: true, confirmed: false });
    expect(t.drain()).toHaveLength(0);

    const declineWithoutReason = await decideLines({ actorEmail: "chris@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-3", action: "decline", qty: 0, reason: " ", overbook: false }], ownerNote: "", linkBase: base }, t.deps);
    expect(declineWithoutReason).toMatchObject({ ok: false, lineErrors: { "R-0001-3": expect.any(String) } });

    const chris = await decideLines({ actorEmail: "chris@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-3", action: "decline", qty: 0, reason: "Lent out to the 5th grade", overbook: false }], ownerNote: "", linkBase: base }, t.deps);
    expect(chris).toEqual({ ok: true, confirmed: true });
    const [confirmation] = t.drain();
    expect(confirmation.to).toEqual(["jordan@example.com"]);
    expect(confirmation.subject).toBe("Approved: Winter Carnival · pick up Fri Dec 11");
    expect(confirmation.text).toContain("Side door; key at the front office.");
    expect(confirmation.text).toContain("20 of the 30 you asked for");
    expect(confirmation.text).toContain("In the box: kettle, scoop, power cord");
    expect(confirmation.text).toContain("Only 20 chairs that weekend, sorry!");
    expect(confirmation.text).toContain("Lent out to the 5th grade");
    expect(confirmation.replyTo?.sort()).toEqual(["chris@example.com", "dana@example.com"]);
    expect(confirmation.html).toContain("Auditorium storage");

    // A second decision on a decided line is refused.
    const again = await decideLines({ actorEmail: "dana@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-1", action: "approve", qty: 30, reason: "", overbook: false }], ownerNote: "", linkBase: base }, t.deps);
    expect(again.ok).toBe(false);
  });

  it("warns before an approval overbooks, and allows it once confirmed", async () => {
    const t = testDeps(samplePta());
    await submit(t, { lines: [{ itemId: "I-0001", qty: 30 }] });
    await submit(t, { borrowerEmail: "chris@example.com", eventName: "Taco Night", pickupDate: "2026-12-12", returnDate: "2026-12-12", lines: [{ itemId: "I-0001", qty: 20 }] });
    await decideLines({ actorEmail: "dana@example.com", requestId: "R-0002", decisions: [{ lineId: "R-0002-1", action: "approve", qty: 20, reason: "", overbook: false }], ownerNote: "", linkBase: base }, t.deps);

    const first = await decideLines({ actorEmail: "dana@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-1", action: "approve", qty: 30, reason: "", overbook: false }], ownerNote: "", linkBase: base }, t.deps);
    expect(first).toMatchObject({ ok: false, overbook: ["R-0001-1"], lineErrors: { "R-0001-1": "Approving 30 would overbook Dec 12 by 10. Approved bookings hold 20 of 40." } });

    const anyway = await decideLines({ actorEmail: "dana@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-1", action: "approve", qty: 30, reason: "", overbook: true }], ownerNote: "", linkBase: base }, t.deps);
    expect(anyway.ok).toBe(true);
  });
});

describe("cancelling", () => {
  it("lets the borrower cancel and tells the owners", async () => {
    const t = testDeps(samplePta());
    await submit(t);
    t.drain();
    const result = await cancelLines({ actorEmail: "jordan@example.com", requestId: "R-0001", lineIds: ["R-0001-3"], reason: "", linkBase: base }, t.deps);
    expect(result).toEqual({ ok: true, cancelled: 1 });
    const mail = t.drain();
    expect(mail.map((m) => m.to.join())).toEqual(["chris@example.com"]);
    expect(t.store.tabs.Lines[2].status).toBe("Cancelled");
  });

  it("confirms the rest once the borrower cancels the last pending line", async () => {
    const t = testDeps(samplePta());
    await submit(t, { lines: [{ itemId: "I-0001", qty: 10 }, { itemId: "I-0003", qty: 1 }] });
    await decideLines({ actorEmail: "dana@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-1", action: "approve", qty: 10, reason: "", overbook: false }], ownerNote: "", linkBase: base }, t.deps);
    t.drain();
    await cancelLines({ actorEmail: "jordan@example.com", requestId: "R-0001", lineIds: ["R-0001-2"], reason: "", linkBase: base }, t.deps);
    expect(t.drain().map((m) => m.subject)).toEqual(["Cancelled: Winter Carnival · Jordan R.", "Approved: Winter Carnival · pick up Fri Dec 11"]);
  });

  it("requires a reason when an owner cancels an approved line, and emails the borrower", async () => {
    const t = testDeps(samplePta());
    await submit(t, { lines: [{ itemId: "I-0001", qty: 10 }] });
    await decideLines({ actorEmail: "dana@example.com", requestId: "R-0001", decisions: [{ lineId: "R-0001-1", action: "approve", qty: 10, reason: "", overbook: false }], ownerNote: "", linkBase: base }, t.deps);
    t.drain();
    expect(await cancelLines({ actorEmail: "dana@example.com", requestId: "R-0001", lineIds: ["R-0001-1"], reason: "", linkBase: base }, t.deps)).toMatchObject({ ok: false, field: "reason" });
    expect(await cancelLines({ actorEmail: "dana@example.com", requestId: "R-0001", lineIds: ["R-0001-1"], reason: "Rack B flooded", linkBase: base }, t.deps)).toMatchObject({ ok: true });
    const [mail] = t.drain();
    expect(mail.to).toEqual(["jordan@example.com"]);
    expect(mail.text).toContain("Rack B flooded");
  });
});

describe("pickup and return", () => {
  async function approvedPopcorn(t: ReturnType<typeof testDeps>) {
    await submit(t, { lines: [{ itemId: "I-0002", qty: 1 }, { itemId: "I-0001", qty: 10 }] });
    await decideLines(
      {
        actorEmail: "dana@example.com",
        requestId: "R-0001",
        decisions: [
          { lineId: "R-0001-1", action: "approve", qty: 1, reason: "", overbook: false },
          { lineId: "R-0001-2", action: "approve", qty: 10, reason: "", overbook: false },
        ],
        ownerNote: "",
        linkBase: base,
      },
      t.deps,
    );
    t.drain();
  }

  it("marks pickup, then a return with a missing part emails the owner", async () => {
    const t = testDeps(samplePta());
    await approvedPopcorn(t);
    expect(await markPickedUp({ actorEmail: "dana@example.com", requestId: "R-0001", lineIds: "all" }, t.deps)).toMatchObject({ ok: false });
    expect(await markPickedUp({ actorEmail: "jordan@example.com", requestId: "R-0001", lineIds: "all" }, t.deps)).toEqual({ ok: true, count: 2 });

    t.setNow("2026-12-14T20:00:00Z");
    const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c33" } }).jpeg().toBuffer();
    const missingNote = await returnLines(
      { actorEmail: "jordan@example.com", requestId: "R-0001", entries: [{ lineId: "R-0001-1", ok: true, checked: ["Kettle", "Power cord"], notes: "" }], returnedOn: "2026-12-14", linkBase: base },
      t.deps,
    );
    expect(missingNote).toMatchObject({ ok: false, lineErrors: { "R-0001-1": "Say what happened to the scoop." } });

    const result = await returnLines(
      {
        actorEmail: "jordan@example.com",
        requestId: "R-0001",
        entries: [
          { lineId: "R-0001-1", ok: true, checked: ["kettle", "Power cord"], notes: "Couldn't find the scoop after cleanup.", photo: new Uint8Array(photo) },
          { lineId: "R-0001-2", ok: true, checked: [], notes: "" },
        ],
        returnedOn: "2026-12-14",
        linkBase: base,
      },
      t.deps,
    );
    expect(result).toEqual({ ok: true, problems: 1 });
    const popcorn = t.store.tabs.Lines[0];
    expect(popcorn).toMatchObject({ status: "Returned", return_ok: "no", missing_parts: "Scoop", returned_on: "2026-12-14" });
    expect(popcorn.return_photo_id).not.toBe("");
    expect(t.store.tabs.Lines[1]).toMatchObject({ status: "Returned", return_ok: "yes" });
    const [mail] = t.drain();
    expect(mail.to).toEqual(["dana@example.com"]);
    expect(mail.subject).toBe("Problem reported: Popcorn machine · Winter Carnival");
    expect(mail.text).toContain("Scoop");

    expect(await clearProblem({ actorEmail: "jordan@example.com", lineId: "R-0001-1", note: "found it" }, t.deps)).toMatchObject({ ok: false });
    expect(await clearProblem({ actorEmail: "dana@example.com", lineId: "R-0001-1", note: "Replaced the scoop", quantity: 1 }, t.deps)).toEqual({ ok: true });
    expect(t.store.tabs.Lines[0].problem_cleared_note).toBe("Replaced the scoop");
  });

  it("refuses a return date before pickup or in the future", async () => {
    const t = testDeps(samplePta());
    await approvedPopcorn(t);
    t.setNow("2026-12-14T20:00:00Z");
    const early = await returnLines({ actorEmail: "jordan@example.com", requestId: "R-0001", entries: [{ lineId: "R-0001-2", ok: true, checked: [], notes: "" }], returnedOn: "2026-12-10", linkBase: base }, t.deps);
    expect(early).toMatchObject({ ok: false, field: "returnedOn" });
    const future = await returnLines({ actorEmail: "jordan@example.com", requestId: "R-0001", entries: [{ lineId: "R-0001-2", ok: true, checked: [], notes: "" }], returnedOn: "2026-12-15", linkBase: base }, t.deps);
    expect(future).toMatchObject({ ok: false, field: "returnedOn" });
  });

  it("lets the owner mark a return for the borrower, but not a stranger", async () => {
    const t = testDeps(samplePta());
    await approvedPopcorn(t);
    t.setNow("2026-12-15T20:00:00Z");
    const entry = [{ lineId: "R-0001-2", ok: true, checked: [], notes: "" }];
    expect(await returnLines({ actorEmail: "chris@example.com", requestId: "R-0001", entries: entry, returnedOn: "2026-12-14", linkBase: base }, t.deps)).toMatchObject({ ok: false });
    expect(await returnLines({ actorEmail: "dana@example.com", requestId: "R-0001", entries: entry, returnedOn: "2026-12-14", linkBase: base }, t.deps)).toMatchObject({ ok: true });
    const core = await loadCore(t.deps);
    expect(core.lines[1]).toMatchObject({ returned_by: "dana@example.com" });
  });
});
