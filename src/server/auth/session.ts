import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDeps } from "@/server/adapters";
import type { UserRow } from "@/server/db/schema";
import { config } from "@/server/config";
import { verifySessionToken, type Session } from "@/server/auth/tokens";
import { loadCore } from "@/server/data";
import { findUser, isAdmin } from "@/server/users";

export const SESSION_COOKIE = "am_session";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProduction,
  path: "/",
  maxAge: config.sessionDays * 24 * 60 * 60,
};

/** The address in the session cookie, or null. Says nothing about whether it is still approved. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export interface Me {
  email: string;
  user: UserRow;
  isAdmin: boolean;
}

/**
 * The signed-in user, if their row in the Users tab is still approved. Every
 * page checks the row, so removing someone takes effect at once rather than
 * when their 30-day cookie runs out.
 */
export async function getMe(): Promise<Me | null> {
  const session = await getSession();
  if (!session) return null;
  const { users } = await loadCore(await getDeps());
  const user = findUser(users, session.email);
  if (user?.status !== "approved") return null;
  return { email: user.email, user, isAdmin: isAdmin(user) };
}

/** For pages: the signed-in user, or a redirect to the sign-in screen that comes back to `nextPath`. */
export async function requireMe(nextPath?: string): Promise<Me> {
  const me = await getMe();
  if (me) return me;
  const session = await getSession();
  // A cookie for an address that is no longer approved: the sign-in page explains.
  if (session) redirect("/");
  redirect(nextPath ? `/?next=${encodeURIComponent(nextPath)}` : "/");
}

/** For server actions: like requireMe, but an action can't usefully redirect a stale form, so it throws. */
export async function actionMe(): Promise<Me> {
  const me = await getMe();
  if (!me) throw new Error("Your sign-in has expired. Reload the page to sign in again.");
  return me;
}
