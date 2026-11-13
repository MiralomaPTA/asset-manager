import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv, planImport } from "@/server/import-items";
import { render, p, b, items, button } from "@/server/email/render";
import { buildMime } from "@/server/adapters/google/mailer";
import { parseCart } from "@/server/cart";

describe("CSV import", () => {
  it("parses quoted fields with commas, quotes and new lines", () => {
    expect(parseCsv('name,notes\n"Table, 6 ft","Say ""hi""\nthen go"\r\nChair,\n')).toEqual([
      ["name", "notes"],
      ["Table, 6 ft", 'Say "hi"\nthen go'],
      ["Chair", ""],
    ]);
  });

  it("plans rows from the example CSV, numbering after existing items and flagging problems", () => {
    const core = {
      items: [{ id: "I-0041", name: "Folding chair" }] as never[],
      locations: [{ name: "Auditorium storage", address: "", pickup_instructions: "", return_instructions: "" }],
      users: [{ email: "dana@example.com", status: "approved" }] as never[],
    };
    const plan = planImport(readFileSync("examples/items.csv", "utf8"), core, { now: "2026-12-08T00:00:00Z" });
    expect(plan.skipped).toEqual([{ line: 3, reason: "Folding chair: already in the Items tab" }]);
    expect(plan.items.map((i) => [i.row.id, i.row.name, i.row.quantity])).toEqual([
      ["I-0042", "Folding table, 6 ft", 16],
      ["I-0043", "Popcorn machine", 1],
      ["I-0044", "Cooler, 48 qt", 3],
    ]);
    expect(plan.items[1].row.contents).toEqual(["Kettle", "Kettle lid", "Scoop", "Power cord"]);
    expect(plan.items[1].row.tags).toEqual(["Food service", "Events"]);
    expect(plan.items[2].warnings).toEqual([`location "Chris W.'s garage" isn't in the Locations tab`, "owner chris@example.com isn't an approved user yet; the admins decide until they are"]);
  });
});

describe("emails", () => {
  it("escapes user text in the HTML and keeps links readable in the text", () => {
    const out = render({ subject: "Hi", blocks: [p("From ", b("<Jordan>"), " & co"), items([{ title: "Chair <b>", qty: "× 2" }]), button("Open", "https://x.org/r?a=1&b=2")] }, "Footer");
    expect(out.html).toContain("&lt;Jordan&gt;");
    expect(out.html).toContain("Chair &lt;b&gt;");
    expect(out.html).toContain('href="https://x.org/r?a=1&amp;b=2"');
    expect(out.text).toContain("Open:\nhttps://x.org/r?a=1&b=2");
    expect(out.text).toContain("- Chair <b> × 2");
  });

  it("builds a multipart message with Reply-To", () => {
    const mime = buildMime({ to: ["a@example.com"], replyTo: ["dana@example.com", "chris@example.com"], subject: "Approved: Winter Carnival · pick up Fri", text: "hi", html: "<p>hi</p>" });
    expect(mime).toContain("Reply-To: dana@example.com, chris@example.com");
    expect(mime).toContain("multipart/alternative");
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});

describe("cart cookie", () => {
  it("ignores anything malformed", () => {
    expect(parseCart('[["I-0001",2],["I-0002",0],["bad id!",1],["I-0001",5],"x"]')).toEqual([{ itemId: "I-0001", qty: 2 }]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(undefined)).toEqual([]);
  });
});
