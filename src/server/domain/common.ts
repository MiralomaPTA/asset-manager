import type { Deps } from "@/server/adapters";
import type { Core } from "@/server/data";
import { blankRow, type ActivityRow } from "@/server/db/schema";
import type { Email } from "@/server/email/render";
import { sendEmail, type Envelope } from "@/server/email/send";

export type DomainDeps = Pick<Deps, "db" | "mailer" | "now" | "files">;

/**
 * What a change returns to the page. `error` is shown at the top of the form;
 * `field` and `lineErrors` point at the inputs to fix.
 */
export type Failure = {
  ok: false;
  error: string;
  field?: string;
  /** Keyed by item ID on the request form, by line ID elsewhere. */
  lineErrors?: Record<string, string>;
  /** Lines the owner must confirm overbooking for before they can be approved. */
  overbook?: string[];
};
export type Result<T extends object = object> = ({ ok: true } & T) | Failure;

export const fail = (error: string, extra: Omit<Failure, "ok" | "error"> = {}): Failure => ({ ok: false, error, ...extra });

/** Shown when a row changed between the page loading and the form being sent. */
export const CHANGED = "This request changed since you opened it. Reload the page to see the latest, then try again.";

/** Used until the Event types tab has rows. */
export const DEFAULT_EVENT_TYPES = ["PTA event", "Signup party", "Classroom", "Other"];

export function eventTypeNames(core: Pick<Core, "eventTypes">): string[] {
  const active = core.eventTypes.filter((t) => t.active).map((t) => t.name);
  return active.length > 0 ? active : DEFAULT_EVENT_TYPES;
}

/** Highest number used after `prefix` in `ids`: "R-0141" → 141. */
export function maxSequence(ids: readonly string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!id.toUpperCase().startsWith(prefix.toUpperCase())) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

export function formatId(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function logActivity(deps: DomainDeps, actor: string, rows: Partial<ActivityRow>[]): Promise<void> {
  const at = deps.now().toISOString();
  await deps.db.append(
    "activity",
    rows.map((r) => ({ ...blankRow("activity"), at, actor_email: actor, ...r })),
  );
}

/**
 * Sends an email without letting a mail failure undo a change that is
 * already saved. The failure is logged; the daily job's reminders are the
 * backstop for anything that didn't arrive.
 */
export async function trySend(deps: Pick<Deps, "mailer">, envelope: Envelope, email: Email): Promise<void> {
  try {
    await sendEmail(deps.mailer, envelope, email);
  } catch (error) {
    console.error(`[email] could not send "${email.subject}" to ${envelope.to.join(", ")}:`, error);
  }
}
