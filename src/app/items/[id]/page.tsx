import Link from "next/link";
import { notFound } from "next/navigation";
import { addToCart } from "@/app/actions/cart";
import { archiveAction } from "@/app/actions/items";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { readCart } from "@/server/cart";
import { bookings, conditionHistory, lineQty, loadCore, locationOf, openProblem, todayOf } from "@/server/data";
import { canManageItem, isAdmin, ownerOf, shortNameOf } from "@/server/users";
import { isOverdue, statusToday } from "@/lib/availability";
import { formatDayRange, formatMonthDay, dayOf } from "@/lib/dates";
import { AlertIcon, BackIcon, CheckIcon } from "@/components/Icons";
import { ItemPhoto } from "@/components/ItemPhoto";
import { ClearProblemForm } from "@/components/ClearProblemForm";
import { ItemStatusPill, LineStatusPill } from "@/components/Status";

export default async function ItemPage(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const me = await requireMe(`/items/${id}`);
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const item = core.items.find((i) => i.id === id);
  if (!item) notFound();
  const manage = canManageItem(me.user, item, core.users);
  if (item.archived && !manage) notFound();

  const location = locationOf(core, item.location);
  const owner = ownerOf(item, core.users);
  const all = bookings(core);
  const status = statusToday(item.quantity, all, item.id, today);
  const problem = openProblem(core, item.id);
  const inCart = (await readCart()).find((l) => l.itemId === item.id);
  const requests = new Map(core.requests.map((r) => [r.id, r]));

  const upcoming = all
    .filter((b) => b.itemId === item.id && (b.ret >= today || isOverdue(b, today)))
    .sort((a, b) => a.pickup.localeCompare(b.pickup))
    .map((b) => ({ booking: b, request: requests.get(b.requestId)! }));

  const history = conditionHistory(core, item.id);
  const showAll = query.history === "all";
  const shown = showAll ? history : history.slice(0, 3);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href="/" className="-mb-2 inline-flex h-11 items-center gap-1 self-start text-[15px] font-semibold no-underline">
        <BackIcon />
        Catalog
      </Link>

      {query.added === "1" && inCart && (
        <p className="notice bg-ok-soft text-ok" role="status">
          <CheckIcon size={18} />
          <span>
            Added {inCart.qty > 1 ? `${inCart.qty} ` : ""}to your request. <Link href="/request" className="font-bold text-ok">Open your request</Link> or keep browsing.
          </span>
        </p>
      )}
      {query.saved === "1" && <p className="notice bg-ok-soft text-ok" role="status">Saved.</p>}
      {query.cleared === "1" && <p className="notice bg-ok-soft text-ok" role="status">Problem cleared.</p>}
      {item.archived && (
        <p className="notice bg-rule text-body">Archived: hidden from the catalog and the request form. Its history is kept.</p>
      )}

      {problem && (
        <section id="problem" className="rounded-[14px] border-2 border-bad bg-bad-faint p-4 text-bad">
          <h2 className="flex items-center gap-2 font-extrabold">
            <AlertIcon />
            Problem reported {formatMonthDay(problem.returned_on || dayOf(new Date(problem.returned_at)))}
          </h2>
          <p className="mt-1 text-[15px] text-ink">
            {problem.missing_parts.length > 0 && <strong>Missing: {problem.missing_parts.join(", ")}. </strong>}
            {problem.return_notes}
          </p>
          {problem.return_photo_id && (
            <a href={`/photos/${problem.return_photo_id}`} className="mt-2 inline-block text-sm font-semibold">
              See the photo
            </a>
          )}
          <p className="mt-2 text-[13px] text-body">It can still be requested. The owner clears this once it&apos;s sorted.</p>
          {manage && <ClearProblemForm itemId={item.id} lineId={problem.id} quantity={item.quantity} />}
        </section>
      )}

      <ItemPhoto id={item.photo_id} name={item.name} className="aspect-[4/3] w-full rounded-[14px] border border-line" iconSize={72} />

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="h1">{item.name}</h1>
          {manage && (
            <Link href={`/items/${item.id}/edit`} className="btn-secondary btn-small flex-none">
              Edit
            </Link>
          )}
        </div>
        {item.description && <p className="text-[15px] leading-relaxed whitespace-pre-line text-body">{item.description}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <ItemStatusPill status={status} />
          {item.tags.map((t) => (
            <Link key={t} href={`/?tag=${encodeURIComponent(t)}`} className="pill bg-white text-body no-underline ring-1 ring-line">
              {t}
            </Link>
          ))}
        </div>
      </div>

      <dl className="card divide-y divide-rule text-[15px]">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Location</dt>
          <dd className="text-right font-semibold">
            {item.location || "Not set"}
            {location?.address && <span className="block text-[13px] font-normal text-muted">{location.address}</span>}
          </dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Owner, approves requests</dt>
          <dd className="text-right font-semibold">{owner ? shortNameOf(core.users, owner.email) : "PTA admins"}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Quantity</dt>
          <dd className="font-semibold">{item.quantity}</dd>
        </div>
      </dl>

      {!item.archived && item.quantity > 0 && (
        <form action={addToCart} className="flex gap-2">
          <input type="hidden" name="itemId" value={item.id} />
          {item.quantity > 1 && (
            <label className="flex flex-col">
              <span className="sr-only">How many</span>
              <input name="qty" type="number" inputMode="numeric" min={1} max={item.quantity} defaultValue={inCart?.qty ?? 1} className="field w-24 text-center text-lg font-bold" />
            </label>
          )}
          <button type="submit" className="btn-primary h-[52px] flex-1">
            {inCart ? "Update request" : "Add to request"}
          </button>
        </form>
      )}

      {item.contents.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">In the box</h2>
          <p className="hint">Check these are all there at pickup. You&apos;ll tick them off when you return it.</p>
          <ul className="flex flex-wrap gap-2">
            {item.contents.map((part) => (
              <li key={part} className="pill bg-white py-1.5 text-sm font-semibold text-ink ring-1 ring-line">
                <CheckIcon size={14} className="text-ok" />
                {part}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="h2">Upcoming bookings</h2>
          <Link href={`/calendar?item=${item.id}`} className="text-sm font-semibold">
            See on calendar
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="hint">Nothing booked. Pending requests show here too.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map(({ booking, request }) => (
              <li key={booking.lineId} className={`flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 ${booking.status === "Pending" ? "hatch" : "bg-white"}`}>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-bold">{formatDayRange(booking.pickup, booking.ret)}</span>
                  <span className="truncate text-[13px] text-body">
                    {request.event_name} · {shortNameOf(core.users, request.borrower_email)}
                    {item.quantity > 1 ? ` · ×${booking.qty}` : ""}
                  </span>
                </span>
                <LineStatusPill status={booking.status} overdue={isOverdue(booking, today)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="h2">Notes from past borrowers</h2>
        {history.length === 0 ? (
          <p className="hint">No returns yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {shown.map((line) => {
              const request = requests.get(line.request_id);
              const problemLine = line.return_ok === "no";
              return (
                <li key={line.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] text-muted">
                      {formatMonthDay(line.returned_on || dayOf(new Date(line.returned_at)))} · {request?.event_name ?? line.request_id} ·{" "}
                      {shortNameOf(core.users, request?.borrower_email ?? line.returned_by)}
                      {lineQty(line) > 1 ? ` · ×${lineQty(line)}` : ""}
                    </span>
                    {problemLine ? (
                      <span className={`pill flex-none ${line.problem_cleared_at ? "bg-rule text-body" : "bg-bad-soft text-bad"}`}>{line.problem_cleared_at ? "Problem · fixed" : "Problem"}</span>
                    ) : (
                      <span className="pill flex-none bg-ok-soft text-ok">OK</span>
                    )}
                  </div>
                  {(line.return_notes || line.missing_parts.length > 0) && (
                    <p className="mt-1.5 text-[15px] leading-snug">
                      {line.missing_parts.length > 0 && <strong>Missing: {line.missing_parts.join(", ")}. </strong>}
                      {line.return_notes}
                    </p>
                  )}
                  {line.problem_cleared_note && (
                    <p className="mt-1.5 text-[14px] text-body">
                      <strong className="text-ink">
                        {shortNameOf(core.users, line.problem_cleared_by)}, {formatMonthDay(dayOf(new Date(line.problem_cleared_at)))}:
                      </strong>{" "}
                      {line.problem_cleared_note}
                    </p>
                  )}
                  {line.return_photo_id && (
                    <a href={`/photos/${line.return_photo_id}`} className="mt-1.5 inline-block text-sm font-semibold">
                      Photo
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!showAll && history.length > 3 && (
          <Link href={`/items/${item.id}?history=all`} className="text-sm font-semibold">
            Show all {history.length} returns
          </Link>
        )}
      </section>

      {isAdmin(me.user) && (
        <form action={archiveAction} className="border-t border-line pt-4">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="archived" value={item.archived ? "0" : "1"} />
          <button type="submit" className="btn-secondary btn-small">
            {item.archived ? "Unarchive" : "Archive this item"}
          </button>
          <p className="hint mt-1">{item.archived ? "Puts it back in the catalog." : "Hides it from the catalog and the request form. Its history is kept."}</p>
        </form>
      )}
    </div>
  );
}
