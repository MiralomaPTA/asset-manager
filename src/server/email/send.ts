import { config } from "@/server/config";
import type { Mailer } from "@/server/adapters/types";
import { render, type Email } from "@/server/email/render";

export interface Envelope {
  to: string[];
  cc?: string[];
  /** The people a reply should reach, with their names for the footer. */
  replyTo?: { email: string; name: string }[];
}

const unique = (emails: string[]) => [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];

/** Renders and sends one email. Someone in both To and Cc is only in To. */
export async function sendEmail(mailer: Mailer, envelope: Envelope, email: Email): Promise<void> {
  const to = unique(envelope.to);
  if (to.length === 0) return;
  const cc = unique(envelope.cc ?? []).filter((e) => !to.includes(e));
  const replyTo = envelope.replyTo?.filter((r) => r.email) ?? [];
  const host = config.appUrl.replace(/^https?:\/\//, "");
  const footer = [
    replyTo.length > 0
      ? `Reply to this email to reach ${new Intl.ListFormat("en", { type: "conjunction" }).format(replyTo.map((r) => r.name))}.`
      : `Questions? Email ${config.contactEmail}.`,
    `Miraloma PTA · ${host}`,
  ].join("\n");
  const rendered = render(email, footer);
  await mailer.send({
    to,
    cc: cc.length > 0 ? cc : undefined,
    replyTo: replyTo.length > 0 ? unique(replyTo.map((r) => r.email)) : undefined,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
}
