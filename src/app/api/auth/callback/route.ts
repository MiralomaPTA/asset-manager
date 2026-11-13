import { cookies } from "next/headers";
import { getDeps } from "@/server/adapters";
import { completeSignIn } from "@/server/auth/access";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { createSessionToken } from "@/server/auth/tokens";
import { seeOther } from "@/server/http";
import { safeNextPath } from "@/lib/next-path";

/**
 * The sign-in page POSTs the token here (a tap, not a GET), so link scanners
 * that open URLs in email don't use up the sign-in.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const result = await completeSignIn(String(form.get("token") ?? ""), await getDeps());
  // Relative Location headers: the browser resolves them against whatever host
  // and port it is actually using.
  if (!result.ok) return seeOther(result.reason === "not-approved" ? "/?unapproved=1" : "/?expired=1");
  const session = await createSessionToken({ email: result.email, method: "email-link", signedInAt: new Date().toISOString() });
  (await cookies()).set(SESSION_COOKIE, session, sessionCookieOptions);
  return seeOther(safeNextPath(form.get("next")) ?? "/");
}
