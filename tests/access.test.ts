import { describe, expect, it } from "vitest";
import { completeSignIn, decideAccess, requestAccess, requestSignIn } from "@/server/auth/access";
import { createMagicToken } from "@/server/auth/tokens";
import { testDeps } from "./helpers";

const base = "https://equipment.example.org";
const linkIn = (text: string) => decodeURIComponent(text.match(/token=([^&\s]+)/)?.[1] ?? "");

describe("sign-in and access", () => {
  it("emails approved users a link, at most once a minute", async () => {
    const t = testDeps({ Users: [{ email: "jordan@example.com", name: "Jordan Rivera", status: "approved", role: "borrower" }] });
    expect(await requestSignIn({ email: " Jordan@Example.com ", linkBase: base }, t.deps)).toBe("sent");
    expect(await requestSignIn({ email: "jordan@example.com", linkBase: base }, t.deps)).toBe("sent");
    expect(t.drain()).toHaveLength(1);
    t.setNow("2026-12-08T18:02:00Z");
    await requestSignIn({ email: "jordan@example.com", linkBase: base }, t.deps);
    expect(t.drain()).toHaveLength(1);
  });

  it("asks unknown addresses who they are, records them as pending and emails every admin once", async () => {
    const t = testDeps({
      Users: [
        { email: "a1@example.com", status: "approved", role: "admin" },
        { email: "a2@example.com", status: "approved", role: "admin" },
      ],
    });
    expect(await requestSignIn({ email: "new@example.com", linkBase: base }, t.deps)).toBe("unknown");
    expect(t.drain()).toHaveLength(0);
    expect(await requestAccess({ email: "new@example.com", name: "Morgan Ellis", phone: "415-555-0188", connection: "Parent or guardian", linkBase: base }, t.deps)).toBe("pending");
    const [mail] = t.drain();
    expect(mail.to).toEqual(["a1@example.com", "a2@example.com"]);
    expect(mail.text).toContain("415-555-0188");
    expect(t.store.tabs.Users[2]).toMatchObject({ email: "new@example.com", status: "pending", name: "Morgan Ellis" });
    // Asking again sends nothing more, and nothing ever goes to the unknown address.
    expect(await requestAccess({ email: "new@example.com", name: "Morgan", phone: "1", connection: "Other", linkBase: base }, t.deps)).toBe("pending");
    expect(t.drain()).toHaveLength(0);
  });

  it("sends access requests to the app's mailbox before any admin exists", async () => {
    const t = testDeps();
    await requestAccess({ email: "first@example.com", name: "First", phone: "415-555-0000", connection: "Volunteer", linkBase: base }, t.deps);
    expect(t.drain()[0].to).toEqual(["equipment@miralomasf.com"]);
  });

  it("lets the first admin decide; a later click on an older link changes nothing", async () => {
    const t = testDeps({ Users: [{ email: "new@example.com", status: "pending", requested_at: "2026-12-08T17:00:00Z" }] });
    const issuedAt = new Date("2026-12-08T17:00:01Z");
    expect((await decideAccess({ email: "new@example.com", decision: "approve", decidedBy: "a1@example.com", linkBase: base, issuedAt }, t.deps)).outcome).toBe("approved");
    expect(t.drain()[0].subject).toBe("You're approved for PTA Equipment");
    expect((await decideAccess({ email: "new@example.com", decision: "deny", decidedBy: "a2@example.com", linkBase: base, issuedAt }, t.deps)).outcome).toBe("already-decided");
    expect(t.store.tabs.Users[0].status).toBe("approved");
  });

  it("makes each sign-in link work once", async () => {
    const t = testDeps({ Users: [{ email: "jordan@example.com", status: "approved" }] });
    await requestSignIn({ email: "jordan@example.com", linkBase: base }, t.deps);
    const token = linkIn(t.drain()[0].text);
    expect(await completeSignIn(token, t.deps)).toEqual({ ok: true, email: "jordan@example.com" });
    expect(await completeSignIn(token, t.deps)).toEqual({ ok: false, reason: "used" });
  });

  it("refuses links for addresses no longer approved", async () => {
    const t = testDeps({ Users: [{ email: "gone@example.com", status: "denied" }] });
    expect(await completeSignIn(await createMagicToken("gone@example.com"), t.deps)).toEqual({ ok: false, reason: "not-approved" });
    expect(await completeSignIn("not-a-token", t.deps)).toEqual({ ok: false, reason: "invalid" });
  });
});
