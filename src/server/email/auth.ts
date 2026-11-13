import { config } from "@/server/config";
import { formatDateTime } from "@/lib/dates";
import { b, button, fine, items, p, type Email } from "@/server/email/render";

export function signInEmail(link: string): Email {
  return {
    subject: "Your PTA Equipment sign-in link",
    blocks: [
      p("Use this link to sign in to Miraloma PTA Equipment:"),
      button("Sign in", link),
      fine(`It works once, for ${config.magicLinkMinutes} minutes. If you didn't ask for this, you can ignore this email.`),
    ],
  };
}

export interface AccessRequestInput {
  email: string;
  name: string;
  phone: string;
  connection: string;
  requestedAt: Date;
  approveUrl: string;
}

export function accessRequestEmail(input: AccessRequestInput): Email {
  return {
    subject: `Access request: ${input.name} (${input.email})`,
    blocks: [
      p(b(input.name), ` asked to use PTA Equipment on ${formatDateTime(input.requestedAt)}.`),
      items([
        { title: "Email", qty: input.email },
        { title: "Phone", qty: input.phone },
        { title: "Connection to the school", qty: input.connection },
      ]),
      p("If you know them, approve them here. You can also deny on that page."),
      button("Approve or deny", input.approveUrl),
      fine(
        `Every admin got this email; the first to decide settles it. The link works for ${config.approvalLinkDays} days. Approving lets them browse and request equipment; each request still goes to the item's owner.`,
      ),
    ],
  };
}

export function approvedEmail(link: string): Email {
  return {
    subject: "You're approved for PTA Equipment",
    blocks: [
      p("The PTA approved your email for borrowing equipment. Sign in here:"),
      button("Sign in", link),
      fine(`This link works once, for ${config.magicLinkMinutes} minutes. After that, ask for a new one on the sign-in page.`),
    ],
  };
}
