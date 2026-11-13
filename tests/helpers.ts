import type { Deps } from "@/server/adapters";
import { memorySheetStore } from "@/server/adapters/memory/sheets";
import type { FileStore, MailMessage, RawRow, StoredFile } from "@/server/adapters/types";
import { Db } from "@/server/db/db";

/** In-memory adapters, a mailbox to inspect, and a clock the test can move. */
export function testDeps(tabs: Record<string, RawRow[]> = {}, start = "2026-12-08T18:00:00Z") {
  const store = memorySheetStore(tabs);
  const sent: MailMessage[] = [];
  const stored = new Map<string, StoredFile>();
  let now = new Date(start);
  const files: FileStore = {
    async put(file) {
      const id = `file${stored.size + 1}xxxxxx`;
      stored.set(id, { mimeType: file.mimeType, kind: file.kind, bytes: file.bytes });
      return { id };
    },
    async get(id) {
      return stored.get(id) ?? null;
    },
  };
  const deps: Deps = { db: new Db(store, 0), files, mailer: { send: async (m) => void sent.push(m) }, now: () => now };
  return {
    deps,
    store,
    sent,
    stored,
    setNow(iso: string) {
      now = new Date(iso);
    },
    /** Messages sent since the last call. */
    drain(): MailMessage[] {
      return sent.splice(0, sent.length);
    },
  };
}

/** A small PTA: two owners, an admin, a borrower and four items. */
export function samplePta(): Record<string, RawRow[]> {
  return {
    Users: [
      { email: "admin@example.com", name: "Alex Admin", phone: "415-555-0100", status: "approved", role: "admin" },
      { email: "dana@example.com", name: "Dana Lee", phone: "415-555-0101", status: "approved", role: "borrower" },
      { email: "chris@example.com", name: "Chris Wong", phone: "415-555-0199", status: "approved", role: "borrower" },
      { email: "jordan@example.com", name: "Jordan Rivera", phone: "415-555-0123", status: "approved", role: "borrower" },
    ],
    Locations: [
      { name: "Auditorium storage", pickup_instructions: "Side door; key at the front office.", return_instructions: "Stack chairs 10 high on rack B." },
      { name: "Chris W.'s garage", pickup_instructions: "Text Chris to pick a time." },
    ],
    Items: [
      { id: "I-0001", name: "Folding chair", quantity: "40", location: "Auditorium storage", owner_email: "dana@example.com", tags: "Tables & chairs" },
      { id: "I-0002", name: "Popcorn machine", quantity: "1", location: "Auditorium storage", owner_email: "dana@example.com", contents: "Kettle\nScoop\nPower cord" },
      { id: "I-0003", name: "Cooler, 48 qt", quantity: "3", location: "Chris W.'s garage", owner_email: "chris@example.com" },
      { id: "I-0004", name: "Canopy tent", quantity: "2", location: "Auditorium storage", owner_email: "" },
    ],
  };
}
