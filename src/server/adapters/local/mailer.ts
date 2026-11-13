import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/server/config";
import type { Mailer } from "@/server/adapters/types";

/**
 * Development stand-in for Gmail. Each message is saved to .data/outbox as
 * JSON, plus an .html file to open in a browser, and the text is echoed to the
 * server console so sign-in links are easy to find.
 */
export const localMailer: Mailer = {
  async send(message) {
    const outbox = path.join(process.cwd(), config.localDataDir, "outbox");
    await fs.mkdir(outbox, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = message.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const base = `${stamp}-${slug}`;
    await fs.writeFile(path.join(outbox, `${base}.json`), JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2));
    if (message.html) await fs.writeFile(path.join(outbox, `${base}.html`), message.html);
    const cc = message.cc?.length ? `\nCc: ${message.cc.join(", ")}` : "";
    console.log(`\n[local mailer] To: ${message.to.join(", ")}${cc}\nSubject: ${message.subject}\n\n${message.text}\n`);
  },
};
