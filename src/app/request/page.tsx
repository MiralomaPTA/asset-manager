import Link from "next/link";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { readCart } from "@/server/cart";
import { bookings, loadCore, todayOf } from "@/server/data";
import { eventTypeNames } from "@/server/domain/common";
import { ownerOf, shortNameOf } from "@/server/users";
import { RequestForm, type BookingLabel, type CartItem } from "@/components/RequestForm";

export default async function RequestPage() {
  const me = await requireMe("/request");
  const deps = await getDeps();
  const core = await loadCore(deps);
  const cart = await readCart();
  const items: CartItem[] = [];
  for (const line of cart) {
    const item = core.items.find((i) => i.id === line.itemId && !i.archived);
    if (!item) continue;
    const owner = ownerOf(item, core.users);
    items.push({ id: item.id, name: item.name, quantity: item.quantity, qty: Math.min(line.qty, Math.max(item.quantity, 1)), ownerName: owner ? shortNameOf(core.users, owner.email) : "PTA admins" });
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3">
        <h1 className="h1">Your request</h1>
        <div className="card p-6 text-body">
          <p>Nothing here yet. Find what you need in the catalog and tap <strong>Add to request</strong> on each item.</p>
          <Link href="/" className="btn-primary mt-4">
            Browse the catalog
          </Link>
        </div>
      </div>
    );
  }

  // Only what the form needs: bookings of these items, and who they're for.
  const ids = new Set(items.map((i) => i.id));
  const relevant = bookings(core).filter((b) => ids.has(b.itemId));
  const labels: Record<string, BookingLabel> = {};
  for (const b of relevant) {
    const r = core.requests.find((x) => x.id === b.requestId);
    if (r) labels[r.id] = { eventName: r.event_name, borrower: r.borrower_email === me.email ? "you" : shortNameOf(core.users, r.borrower_email) };
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="h1">Your request</h1>
        <p className="mt-1 text-[15px] text-body">Each item&apos;s owner reviews their part. You&apos;ll get one email once everything is decided.</p>
      </div>
      <RequestForm items={items} bookings={relevant} labels={labels} eventTypes={eventTypeNames(core)} today={todayOf(deps)} />
      <p className="hint text-center">Signed in as {me.email}</p>
    </div>
  );
}
