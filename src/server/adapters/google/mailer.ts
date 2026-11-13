import { gmail as gmailApi, type gmail_v1 } from "@googleapis/gmail";
import { config } from "@/server/config";
import { googleAuth } from "@/server/adapters/google/auth";
import type { MailMessage, Mailer } from "@/server/adapters/types";

/** Sends through the Gmail API as equipment@ (the delegated user). */

let api: gmail_v1.Gmail | null = null;

function gmail(): gmail_v1.Gmail {
  if (!api) api = gmailApi({ version: "v1", auth: googleAuth() });
  return api;
}

function encodeHeader(value: string): string {
  // RFC 2047 for non-ASCII subjects and names.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64Lines(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

/** An RFC 5322 message: plain text, plus an HTML alternative when the message has one. */
export function buildMime(message: MailMessage): string {
  const headers = [
    `From: ${encodeHeader(config.fromName)} <${config.fromEmail}>`,
    `To: ${message.to.join(", ")}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.join(", ")}`] : []),
    ...(message.replyTo?.length ? [`Reply-To: ${message.replyTo.join(", ")}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
  ];
  const part = (type: string, body: string) => [`Content-Type: ${type}; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", base64Lines(body)];
  if (!message.html) return [...headers, ...part("text/plain", message.text), ""].join("\r\n");
  const boundary = `=_am_${crypto.randomUUID()}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...part("text/plain", message.text),
    `--${boundary}`,
    ...part("text/html", message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export const googleMailer: Mailer = {
  async send(message) {
    const raw = Buffer.from(buildMime(message), "utf8").toString("base64url");
    await gmail().users.messages.send({ userId: "me", requestBody: { raw } });
  },
};
