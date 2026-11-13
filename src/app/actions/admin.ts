"use server";

import { redirect } from "next/navigation";
import { getDeps } from "@/server/adapters";
import { decideAccess } from "@/server/auth/access";
import { actionLinkBase } from "@/server/auth/links";
import { actionMe } from "@/server/auth/session";

/** Approve or deny an access request from the Admin page. Unlike the emailed link, this can change an earlier decision. */
export async function decideAccessAction(formData: FormData): Promise<void> {
  const me = await actionMe();
  if (!me.isAdmin) throw new Error("Only admins approve access.");
  const email = String(formData.get("email") ?? "");
  const decision = formData.get("decision") === "deny" ? "deny" : "approve";
  const { outcome } = await decideAccess({ email, decision, decidedBy: me.email, linkBase: await actionLinkBase() }, await getDeps());
  redirect(`/admin?${new URLSearchParams({ decided: outcome, email })}`);
}
