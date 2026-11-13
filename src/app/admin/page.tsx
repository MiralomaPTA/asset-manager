import Link from "next/link";
import { notFound } from "next/navigation";
import { decideAccessAction } from "@/app/actions/admin";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { loadCore, locationOf } from "@/server/data";
import { findUser } from "@/server/users";
import { formatDateTime } from "@/lib/dates";
import { plural } from "@/lib/names";
import { PlusIcon } from "@/components/Icons";

const DECIDED: Record<string, string> = {
  approved: "Approved. They've been emailed a sign-in link.",
  denied: "Denied. They weren't told.",
  unchanged: "They were already approved.",
  unknown: "That address isn't in the Users tab any more.",
};

export default async function AdminPage(props: PageProps<"/admin">) {
  const query = await props.searchParams;
  const me = await requireMe("/admin");
  if (!me.isAdmin) notFound();
  const core = await loadCore(await getDeps());

  const pending = core.users.filter((u) => u.status === "pending").sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const live = core.items.filter((i) => !i.archived);
  const archived = core.items.filter((i) => i.archived);
  const open = new Set(core.lines.filter((l) => l.status === "Pending" || l.status === "Approved" || l.status === "Picked up").map((l) => l.item_id));
  const itemIds = new Set(core.items.map((i) => i.id));

  const issues: { href: string; title: string; detail: string }[] = [];
  for (const item of live) {
    if (core.locations.length > 0 && !locationOf(core, item.location)) {
      issues.push({ href: `/items/${item.id}/edit`, title: item.name, detail: item.location ? `Kept at “${item.location}”, which isn't in the Locations tab` : "No location set" });
    }
    if (item.owner_email && findUser(core.users, item.owner_email)?.status !== "approved") {
      issues.push({ href: `/items/${item.id}/edit`, title: item.name, detail: `Owner ${item.owner_email} isn't an approved user, so the admins decide its requests` });
    }
  }
  for (const item of archived) {
    if (open.has(item.id)) issues.push({ href: `/items/${item.id}`, title: item.name, detail: "Archived, but still has open bookings" });
  }
  const orphans = core.lines.filter((l) => !itemIds.has(l.item_id));
  if (orphans.length > 0) {
    issues.push({ href: "/admin", title: `${plural(orphans.length, "request line")} for missing items`, detail: `Item IDs ${[...new Set(orphans.map((l) => l.item_id))].join(", ")} aren't in the Items tab. Items should be archived, not deleted.` });
  }
  const noPhoto = live.filter((i) => !i.photo_id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="h1">Admin</h1>
        <Link href="/items/new" className="btn-secondary btn-small">
          <PlusIcon size={16} />
          Add item
        </Link>
      </div>
      {typeof query.decided === "string" && DECIDED[query.decided] && (
        <p className="notice bg-ok-soft text-ok" role="status">
          {typeof query.email === "string" ? `${query.email}: ` : ""}
          {DECIDED[query.decided]}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="h2">Asking for access ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="hint">No one is waiting.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {pending.map((u) => (
              <li key={u.email} className="card flex flex-col gap-2 p-4">
                <span className="flex flex-col">
                  <span className="font-bold">{u.name || u.email}</span>
                  <span className="text-sm break-all text-body">
                    {u.email}
                    {u.phone && ` · ${u.phone}`}
                  </span>
                  <span className="text-[13px] text-muted">
                    {u.connection || "Connection not given"}
                    {u.requested_at && ` · asked ${formatDateTime(new Date(u.requested_at))}`}
                  </span>
                </span>
                <form action={decideAccessAction} className="flex gap-2">
                  <input type="hidden" name="email" value={u.email} />
                  <button type="submit" name="decision" value="approve" className="btn-primary btn-small flex-1">
                    Approve
                  </button>
                  <button type="submit" name="decision" value="deny" className="btn-secondary btn-small flex-1">
                    Deny
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="h2">Needs attention ({issues.length})</h2>
        {issues.length === 0 ? (
          <p className="hint">Every item has a known location and an approved owner (or none).</p>
        ) : (
          <ul className="card divide-y divide-rule">
            {issues.map((i, n) => (
              <li key={n}>
                <Link href={i.href} className="flex flex-col p-3.5 text-ink no-underline hover:bg-page hover:text-ink">
                  <span className="font-bold">{i.title}</span>
                  <span className="text-sm text-body">{i.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {noPhoto.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">No photo yet ({noPhoto.length})</h2>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[15px]">
            {noPhoto.map((i) => (
              <Link key={i.id} href={`/items/${i.id}/edit`}>
                {i.name}
              </Link>
            ))}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="h2">Archived ({archived.length})</h2>
        {archived.length === 0 ? (
          <p className="hint">None. Archive an item from its page to hide it from the catalog while keeping its history.</p>
        ) : (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[15px]">
            {archived.map((i) => (
              <Link key={i.id} href={`/items/${i.id}`}>
                {i.name}
              </Link>
            ))}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1.5 text-sm text-body">
        <h2 className="h2">In the Sheet</h2>
        <p>
          Change roles, phone numbers and locations in the “PTA equipment” spreadsheet: set <strong>role</strong> to <em>admin</em> in the Users tab to make
          someone an admin, and paste addresses with status <em>approved</em> to let people in without waiting. Edit pickup and return instructions in the
          Locations tab.
        </p>
        <p>
          {plural(live.length, "item")} lent · {plural(core.users.filter((u) => u.status === "approved").length, "approved user")} ·{" "}
          {plural(core.requests.length, "request")} so far
        </p>
      </section>
    </div>
  );
}
