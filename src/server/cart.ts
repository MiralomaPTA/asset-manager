import { cookies } from "next/headers";

/**
 * The request being put together, like a shopping cart: item IDs and
 * quantities in a cookie. A cookie (rather than browser storage) lets the
 * server render the request page with availability already worked out, and
 * keeps "Add to request" working without JavaScript.
 */

export const CART_COOKIE = "am_cart";

export interface CartLine {
  itemId: string;
  qty: number;
}

const MAX_LINES = 60;

export function parseCart(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CartLine[] = [];
    for (const entry of parsed) {
      if (!Array.isArray(entry)) continue;
      const [itemId, qty] = entry;
      if (typeof itemId !== "string" || !/^[\w-]{1,40}$/.test(itemId)) continue;
      if (!Number.isInteger(qty) || qty < 1 || qty > 9999) continue;
      if (!out.some((l) => l.itemId === itemId)) out.push({ itemId, qty });
    }
    return out.slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

export async function readCart(): Promise<CartLine[]> {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

export async function writeCart(lines: CartLine[]): Promise<void> {
  const jar = await cookies();
  if (lines.length === 0) {
    jar.delete(CART_COOKIE);
    return;
  }
  jar.set(CART_COOKIE, JSON.stringify(lines.slice(0, MAX_LINES).map((l) => [l.itemId, l.qty])), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
}
