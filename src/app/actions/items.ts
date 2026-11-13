"use server";

import { redirect } from "next/navigation";
import { getDeps } from "@/server/adapters";
import { actionMe } from "@/server/auth/session";
import { saveItem, setArchived } from "@/server/domain/items";
import { clearProblem } from "@/server/domain/requests";
import type { FormState } from "@/lib/form-state";

const lines = (value: FormDataEntryValue | null) => String(value ?? "").split(/\r?\n/);

/** Add or edit an item. The photo, already shrunk by the browser, comes in the same form. */
export async function saveItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actionMe();
  const photo = formData.get("photo");
  const bytes = photo instanceof File && photo.size > 0 ? new Uint8Array(await photo.arrayBuffer()) : undefined;
  const result = await saveItem(
    {
      actorEmail: me.email,
      itemId: String(formData.get("itemId") ?? ""),
      fields: {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        tags: String(formData.get("tags") ?? "").split(","),
        location: String(formData.get("location") ?? ""),
        quantity: Number(String(formData.get("quantity") ?? "").trim() || NaN),
        ownerEmail: String(formData.get("ownerEmail") ?? ""),
        contents: lines(formData.get("contents")),
      },
      photo: bytes,
    },
    await getDeps(),
  );
  if (!result.ok) return { error: result.error, field: result.field, attempt: Date.now() };
  redirect(`/items/${result.itemId}?saved=1`);
}

export async function archiveAction(formData: FormData): Promise<void> {
  const me = await actionMe();
  const itemId = String(formData.get("itemId") ?? "");
  const archived = formData.get("archived") === "1";
  const result = await setArchived({ actorEmail: me.email, itemId, archived }, await getDeps());
  if (!result.ok) throw new Error(result.error);
  redirect(`/items/${itemId}`);
}

export async function clearProblemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await actionMe();
  const itemId = String(formData.get("itemId") ?? "");
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const result = await clearProblem(
    { actorEmail: me.email, lineId: String(formData.get("lineId") ?? ""), note: String(formData.get("note") ?? ""), quantity: quantityRaw === "" ? undefined : Number(quantityRaw) },
    await getDeps(),
  );
  if (!result.ok) return { error: result.error, field: result.field, attempt: Date.now() };
  redirect(`/items/${itemId}?cleared=1`);
}
