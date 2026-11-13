"use server";

import { redirect } from "next/navigation";
import { getDeps } from "@/server/adapters";
import { actionMe } from "@/server/auth/session";
import { readCart, writeCart, type CartLine } from "@/server/cart";
import { loadCore } from "@/server/data";
import { safeNextPath } from "@/lib/next-path";

/** "Add to request" on an item page: sets that item's quantity in the request being put together. */
export async function addToCart(formData: FormData): Promise<void> {
  await actionMe();
  const itemId = String(formData.get("itemId") ?? "");
  const qty = Math.max(1, Math.min(9999, Math.trunc(Number(formData.get("qty")) || 1)));
  const { items } = await loadCore(await getDeps());
  const item = items.find((i) => i.id === itemId && !i.archived);
  if (!item) redirect("/");
  const cart = (await readCart()).filter((l) => l.itemId !== itemId);
  await writeCart([...cart, { itemId, qty: Math.min(qty, Math.max(item.quantity, 1)) }]);
  redirect(safeNextPath(formData.get("back")) ?? `/items/${itemId}?added=1`);
}

export async function removeFromCart(formData: FormData): Promise<void> {
  await actionMe();
  const itemId = String(formData.get("itemId") ?? "");
  await writeCart((await readCart()).filter((l) => l.itemId !== itemId));
  redirect("/request");
}

/** Keeps the quantities typed on the request page, so leaving to add more items doesn't lose them. */
export async function saveCartQuantities(lines: CartLine[]): Promise<void> {
  await actionMe();
  const current = await readCart();
  const wanted = new Map(lines.map((l) => [l.itemId, l.qty]));
  await writeCart(current.map((l) => ({ itemId: l.itemId, qty: Math.max(1, Math.min(9999, Math.trunc(wanted.get(l.itemId) ?? l.qty))) })));
}
