"use server";

import { redirect } from "next/navigation";
import { getDeps } from "@/server/adapters";
import { actionLinkBase } from "@/server/auth/links";
import { actionMe } from "@/server/auth/session";
import { readCart, writeCart } from "@/server/cart";
import { cancelLines, decideLines, markPickedUp, returnLines, submitRequest, type Decision, type ReturnEntry } from "@/server/domain/requests";
import type { FormState } from "@/lib/form-state";

const str = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const failed = (r: { error: string; field?: string; lineErrors?: Record<string, string>; overbook?: string[] }): FormState => ({
  error: r.error,
  field: r.field,
  lineErrors: r.lineErrors,
  overbook: r.overbook,
  attempt: Date.now(),
});

export async function submitRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actionMe();
  const cart = await readCart();
  const lines = cart.map((l) => ({ itemId: l.itemId, qty: Math.trunc(Number(formData.get(`qty:${l.itemId}`) ?? l.qty)) }));
  const result = await submitRequest(
    {
      borrowerEmail: me.email,
      eventType: str(formData, "eventType"),
      eventName: str(formData, "eventName"),
      pickupDate: str(formData, "pickupDate"),
      returnDate: str(formData, "returnDate"),
      note: str(formData, "note"),
      lines,
      linkBase: await actionLinkBase(),
    },
    await getDeps(),
  );
  if (!result.ok) return failed(result);
  await writeCart([]);
  redirect(`/requests/${result.requestId}?sent=1`);
}

export async function decideAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actionMe();
  const requestId = str(formData, "requestId");
  const decisions: Decision[] = [];
  for (const lineId of formData.getAll("lineId").map(String)) {
    const action = str(formData, `action:${lineId}`);
    if (action !== "approve" && action !== "decline") continue; // left undecided
    decisions.push({
      lineId,
      action,
      qty: Math.trunc(Number(str(formData, `qty:${lineId}`))),
      reason: str(formData, `reason:${lineId}`),
      overbook: formData.get(`overbook:${lineId}`) === "1",
    });
  }
  const result = await decideLines({ actorEmail: me.email, requestId, decisions, ownerNote: str(formData, "ownerNote"), linkBase: await actionLinkBase() }, await getDeps());
  if (!result.ok) return failed(result);
  redirect(`/review/${requestId}?saved=${result.confirmed ? "confirmed" : "1"}`);
}

/** Borrower cancels lines or the whole request; or an owner cancels an approved line with a reason. */
export async function cancelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actionMe();
  const requestId = str(formData, "requestId");
  const ids = formData.getAll("lineId").map(String);
  const result = await cancelLines(
    { actorEmail: me.email, requestId, lineIds: ids.length > 0 ? ids : "all", reason: str(formData, "reason"), linkBase: await actionLinkBase() },
    await getDeps(),
  );
  if (!result.ok) return failed(result);
  redirect(`${str(formData, "back") === "review" ? "/review" : "/requests"}/${requestId}?cancelled=${result.cancelled}`);
}

export async function pickupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actionMe();
  const requestId = str(formData, "requestId");
  const ids = formData.getAll("lineId").map(String);
  const result = await markPickedUp({ actorEmail: me.email, requestId, lineIds: ids.length > 0 ? ids : "all" }, await getDeps());
  if (!result.ok) return failed(result);
  redirect(`/requests/${requestId}?picked=${result.count}`);
}

export async function returnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actionMe();
  const requestId = str(formData, "requestId");
  const entries: ReturnEntry[] = [];
  for (const lineId of formData.getAll("lineId").map(String)) {
    const photo = formData.get(`photo:${lineId}`);
    entries.push({
      lineId,
      ok: str(formData, `ok:${lineId}`) !== "no",
      checked: formData.getAll(`part:${lineId}`).map(String),
      notes: str(formData, `notes:${lineId}`),
      photo: photo instanceof File && photo.size > 0 ? new Uint8Array(await photo.arrayBuffer()) : undefined,
    });
  }
  const result = await returnLines({ actorEmail: me.email, requestId, entries, returnedOn: str(formData, "returnedOn"), linkBase: await actionLinkBase() }, await getDeps());
  if (!result.ok) return failed(result);
  const back = str(formData, "back") === "review" ? `/review/${requestId}` : `/requests/${requestId}`;
  redirect(`${back}?returned=${entries.length}&problems=${result.problems}`);
}
