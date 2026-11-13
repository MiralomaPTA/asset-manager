import { getDeps } from "@/server/adapters";
import { decideAccess } from "@/server/auth/access";
import { linkBase } from "@/server/auth/links";
import { getMe } from "@/server/auth/session";
import { verifyApprovalToken } from "@/server/auth/tokens";
import { seeOther } from "@/server/http";

/** An admin's tap on the approve page. The emailed token is the authorization. */
export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const decision = form.get("decision") === "deny" ? "deny" : "approve";
  const verified = await verifyApprovalToken(token);
  if (!verified) return seeOther("/auth/approve?expired=1");
  // The email went to every admin; record who it was when they're signed in.
  const me = await getMe();
  const { outcome, user } = await decideAccess(
    { email: verified.email, decision, issuedAt: verified.issuedAt, decidedBy: me?.isAdmin ? me.email : "approval email link", linkBase: linkBase(request) },
    await getDeps(),
  );
  const done = new URLSearchParams({ outcome, email: user?.email ?? verified.email });
  if (user?.decided_by && outcome === "already-decided") done.set("by", user.decided_by);
  return seeOther(`/auth/approve/done?${done}`);
}
