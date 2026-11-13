import type { Deps } from "@/server/adapters";
import { createApprovalToken, createMagicToken, verifyMagicToken } from "@/server/auth/tokens";
import { config } from "@/server/config";
import { byKey } from "@/server/db/db";
import { blankRow, type UserRow } from "@/server/db/schema";
import { accessRequestEmail, approvedEmail, signInEmail } from "@/server/email/auth";
import { sendEmail } from "@/server/email/send";
import { adminEmails, findUser } from "@/server/users";
import { safeNextPath } from "@/lib/next-path";

/**
 * Who may sign in, and what happens when someone asks for a link.
 *
 * - Approved address: email a sign-in link (at most one a minute, durably).
 *   The link works once: using it records `signed_in_at` on the row, and any
 *   link issued before that time is refused.
 * - Unknown address: the page asks for their name, phone and connection to
 *   the school. That adds a pending row and emails every admin once. Nothing
 *   is ever emailed to the unknown address itself, so the form can't be used
 *   to spam strangers.
 * - Pending or denied address: nothing is sent.
 * - An approval link works until a decision is on the row. After that it
 *   does nothing, so the second admin to click, or a forwarded email, can't
 *   reverse the first admin's decision.
 */

export type AccessDeps = Pick<Deps, "db" | "mailer" | "now">;

export type SignInOutcome = "sent" | "unknown" | "pending";

function signInLink(base: string, token: string, next?: string): string {
  const url = new URL("/auth/callback", base);
  url.searchParams.set("token", token);
  const path = safeNextPath(next);
  if (path) url.searchParams.set("next", path);
  return url.toString();
}

async function usersTab(deps: AccessDeps): Promise<UserRow[]> {
  return (await deps.db.load("users")).users;
}

async function saveUser(deps: AccessDeps, user: UserRow, exists: boolean): Promise<void> {
  if (exists) {
    const { email, ...patch } = user;
    await deps.db.update("users", [{ match: byKey("users", email), patch }]);
  } else {
    await deps.db.append("users", [user]);
  }
}

export async function requestSignIn(input: { email: string; linkBase: string; next?: string }, deps: AccessDeps): Promise<SignInOutcome> {
  const email = input.email.trim().toLowerCase();
  const now = deps.now();
  const user = findUser(await usersTab(deps), email);
  if (!user) return "unknown";
  if (user.status !== "approved") return "pending"; // pending or denied: say nothing more, send nothing more

  const last = user.last_link_at ? Date.parse(user.last_link_at) : 0;
  if (now.getTime() - last < config.linkCooldownSeconds * 1000) return "sent"; // the earlier link is still good
  const link = signInLink(input.linkBase, await createMagicToken(email), input.next);
  await sendEmail(deps.mailer, { to: [email] }, signInEmail(link));
  await saveUser(deps, { ...user, last_link_at: now.toISOString() }, true);
  return "sent";
}

export interface AccessRequest {
  email: string;
  name: string;
  phone: string;
  connection: string;
  linkBase: string;
  next?: string;
}

/** Records a new address as pending and asks the admins. An address already on the list is treated as a sign-in. */
export async function requestAccess(input: AccessRequest, deps: AccessDeps): Promise<SignInOutcome> {
  const email = input.email.trim().toLowerCase();
  const now = deps.now();
  const users = await usersTab(deps);
  if (findUser(users, email)) return requestSignIn({ email, linkBase: input.linkBase, next: input.next }, deps);

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const recent = users.filter((u) => u.status === "pending" && u.requested_at >= since).length;
  if (recent >= config.maxNewPendingPerDay) {
    console.warn(`[access] daily cap on new access requests reached; not recording ${email}`);
    return "pending";
  }
  await saveUser(
    deps,
    { ...blankRow("users"), email, name: input.name.trim(), phone: input.phone.trim(), connection: input.connection.trim(), status: "pending", role: "borrower", requested_at: now.toISOString() },
    false,
  );
  const url = new URL("/auth/approve", input.linkBase);
  url.searchParams.set("token", await createApprovalToken(email));
  await sendEmail(
    deps.mailer,
    { to: adminEmails(users) },
    accessRequestEmail({ email, name: input.name.trim(), phone: input.phone.trim(), connection: input.connection.trim(), requestedAt: now, approveUrl: url.toString() }),
  );
  return "pending";
}

/** Why a clicked sign-in link was refused. */
export type SignInFailure = "invalid" | "used" | "not-approved";
export type SignInCompletion = { ok: true; email: string } | { ok: false; reason: SignInFailure };

/**
 * Turns a clicked sign-in link into a signed-in address. The row must still
 * be approved, and the link must be newer than the row's last sign-in: that
 * is what makes each link work once.
 */
export async function completeSignIn(token: string, deps: AccessDeps): Promise<SignInCompletion> {
  const verified = await verifyMagicToken(token);
  if (!verified) return { ok: false, reason: "invalid" };
  deps.db.invalidate(); // another server may have just used this link
  const user = findUser(await usersTab(deps), verified.email);
  if (user?.status !== "approved") return { ok: false, reason: "not-approved" };
  const lastSignIn = user.signed_in_at ? Date.parse(user.signed_in_at) : 0;
  if (verified.issuedAt.getTime() < lastSignIn) return { ok: false, reason: "used" };
  await saveUser(deps, { ...user, signed_in_at: deps.now().toISOString() }, true);
  return { ok: true, email: user.email };
}

export type AccessDecision = "approve" | "deny";
export type AccessOutcome = "approved" | "denied" | "unchanged" | "already-decided" | "unknown";

/** An approval link made before the row's last decision does nothing. */
export function approvalLinkIsStale(issuedAt: Date, user: Pick<UserRow, "decided_at">): boolean {
  const decidedAt = user.decided_at ? Date.parse(user.decided_at) : NaN;
  return Number.isFinite(decidedAt) && issuedAt.getTime() < decidedAt;
}

/**
 * Applies an admin's decision. Approving emails the person a sign-in link;
 * denying is silent. `issuedAt` is when an emailed approval link was made: a
 * link older than the row's last decision is refused. An admin deciding from
 * the admin page passes no `issuedAt`, and can change an earlier decision.
 */
export async function decideAccess(
  input: { email: string; decision: AccessDecision; decidedBy: string; linkBase: string; issuedAt?: Date },
  deps: AccessDeps,
): Promise<{ outcome: AccessOutcome; user: UserRow | null }> {
  const email = input.email.trim().toLowerCase();
  const now = deps.now();
  deps.db.invalidate(); // two admins may click at once; decide on the freshest row
  const user = findUser(await usersTab(deps), email);
  if (!user) return { outcome: "unknown", user: null };
  if (input.issuedAt && approvalLinkIsStale(input.issuedAt, user)) return { outcome: "already-decided", user };

  if (input.decision === "deny") {
    const denied: UserRow = { ...user, status: "denied", decided_at: now.toISOString(), decided_by: input.decidedBy };
    await saveUser(deps, denied, true);
    return { outcome: "denied", user: denied };
  }
  if (user.status === "approved") return { outcome: "unchanged", user };
  const approved: UserRow = { ...user, status: "approved", decided_at: now.toISOString(), decided_by: input.decidedBy, last_link_at: now.toISOString() };
  await saveUser(deps, approved, true);
  await sendEmail(deps.mailer, { to: [email] }, approvedEmail(signInLink(input.linkBase, await createMagicToken(email))));
  return { outcome: "approved", user: approved };
}
