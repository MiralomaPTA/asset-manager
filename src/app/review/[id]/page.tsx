import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelAction } from "@/app/actions/requests";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { bookings, canDecide, deciderOf, lineQty, linesOf, linesToDecide, loadCore, todayOf } from "@/server/data";
import { findUser, shortNameOf } from "@/server/users";
import { daysBetween, dayOf, formatDay, formatShortRange } from "@/lib/dates";
import { firstName, plural } from "@/lib/names";
import { freeOver, holdingOverlaps, pendingOverlaps, type Booking } from "@/lib/availability";
import { ActionForm } from "@/components/ActionForm";
import { BackIcon, CheckIcon } from "@/components/Icons";
import { ReviewForm, type DecideLine } from "@/components/ReviewForm";
import { LineStatusPill } from "@/components/Status";

/** One request, seen by an owner or admin: decide pending lines, cancel approved ones, mark returns. */
export default async function DecidePage(props: PageProps<"/review/[id]">) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const me = await requireMe(`/review/${id}`);
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const request = core.requests.find((r) => r.id === id);
  if (!request) notFound();
  const lines = linesOf(core, request.id);
  const mine = lines.filter((l) => canDecide(core, me.user, l));
  if (mine.length === 0) notFound();

  const borrower = findUser(core.users, request.borrower_email);
  const all = bookings(core);
  const requests = new Map(core.requests.map((r) => [r.id, r]));
  const items = new Map(core.items.map((i) => [i.id, i]));
  const range = formatShortRange(request.pickup_date, request.return_date);

  const describe = (b: Booking, state: string) => {
    const other = requests.get(b.requestId);
    return `${other?.event_name ?? b.requestId} (${other ? shortNameOf(core.users, other.borrower_email) : "?"}), ${state}: ${b.qty} on ${formatShortRange(b.pickup, b.ret)}.`;
  };
  const decide: DecideLine[] = mine
    .filter((l) => l.status === "Pending")
    .map((l) => {
      const item = items.get(l.item_id);
      const quantity = item?.quantity ?? 0;
      const r = freeOver(quantity, all, l.item_id, request.pickup_date, request.return_date, today, l.id);
      const decider = deciderOf(core, l);
      return {
        id: l.id,
        name: l.item_name,
        requested: l.qty_requested,
        quantity,
        free: r.free,
        tightestDay: r.tightestDay,
        heldOnTightestDay: r.heldOnTightestDay,
        freeText: r.free <= 0 ? `None free ${range}` : `${r.free} of ${quantity} free ${range}`,
        overlaps: [
          ...holdingOverlaps(all, l.item_id, request.pickup_date, request.return_date, today, request.id).map((b) => describe(b, b.status === "Picked up" ? "out" : "approved")),
          ...pendingOverlaps(all, l.item_id, request.pickup_date, request.return_date, request.id).map((b) => describe(b, "pending")),
        ],
        ownerName: decider && decider.email !== me.email ? shortNameOf(core.users, decider.email) : undefined,
      };
    });
  const decided = mine.filter((l) => l.status !== "Pending");
  const othersPending = lines.filter((l) => l.status === "Pending" && !canDecide(core, me.user, l));
  const otherLines = lines.filter((l) => !canDecide(core, me.user, l));
  const waitingNames = [...new Set(othersPending.map((l) => (deciderOf(core, l) ? shortNameOf(core.users, deciderOf(core, l)!.email) : "the admins")))];
  const borrowerFirst = firstName(borrower?.name ?? "", request.borrower_email);
  const afterSave =
    waitingNames.length > 0
      ? `${borrowerFirst} gets one email once ${new Intl.ListFormat("en").format(waitingNames)} ${waitingNames.length === 1 ? "has" : "have"} decided too.`
      : `${borrowerFirst} gets the confirmation email once every item is decided.`;
  const toDecide = linesToDecide(core, me.user);
  const toDecideRequests = new Set(toDecide.map((l) => l.request_id)).size;
  const days = daysBetween(request.pickup_date, request.return_date) + 1;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href="/review" className="-mb-2 inline-flex h-11 items-center gap-1 self-start text-[15px] font-semibold no-underline">
        <BackIcon />
        To decide ({toDecideRequests})
      </Link>

      {query.saved && (
        <p className="notice bg-ok-soft text-ok" role="status">
          <CheckIcon size={18} className="mt-0.5 flex-none" />
          {query.saved === "confirmed" ? `Saved. Everything is decided, so ${borrowerFirst} has been emailed the confirmation.` : "Saved."}
        </p>
      )}
      {query.cancelled && <p className="notice bg-ok-soft text-ok" role="status">Cancelled. {borrowerFirst} has been emailed your note.</p>}
      {query.returned && <p className="notice bg-ok-soft text-ok" role="status">Marked returned.</p>}

      <div className="flex flex-col gap-1">
        <h1 className="h1">{request.event_name}</h1>
        <p className="text-sm text-muted">
          {request.id} · {request.event_type} · sent {formatDay(dayOf(new Date(request.created_at)))}
        </p>
      </div>

      <div className="card flex flex-col gap-1 p-4">
        <span className="text-[16px] font-bold">{borrower?.name || request.borrower_email}</span>
        <span className="text-sm text-body">
          <a href={`mailto:${request.borrower_email}`}>{request.borrower_email}</a>
          {borrower?.phone && (
            <>
              {" · "}
              <a href={`tel:${borrower.phone.replace(/[^\d+]/g, "")}`}>{borrower.phone}</a>
            </>
          )}
        </span>
        <span className="mt-2 text-[15px] font-semibold">
          {formatDay(request.pickup_date)} → {formatDay(request.return_date)} <span className="font-normal text-muted">· {plural(days, "day")}</span>
        </span>
        {request.borrower_note && <blockquote className="mt-2 border-l-[3px] border-line pl-3 text-[15px] text-body italic">“{request.borrower_note}”</blockquote>}
      </div>

      {decide.length > 0 && <ReviewForm requestId={request.id} lines={decide} borrowerFirstName={borrowerFirst} afterSave={afterSave} />}

      {decided.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">{decide.length > 0 ? "Already decided" : "Your items"}</h2>
          <ul className="card divide-y divide-rule">
            {decided.map((l) => {
              const overdue = (l.status === "Picked up" || l.status === "Approved") && request.return_date < today;
              const returnable = l.status === "Picked up" || (l.status === "Approved" && request.pickup_date <= today);
              return (
                <li key={l.id} className="flex flex-col gap-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex flex-col">
                      <span className="font-bold">
                        {l.item_name} × {lineQty(l) || l.qty_requested}
                      </span>
                      <span className="text-[13px] text-muted">
                        {l.status === "Approved" && l.qty_approved < l.qty_requested && `${l.qty_approved} of ${l.qty_requested} requested · `}
                        {l.decided_by && l.status !== "Cancelled" && `${l.status === "Declined" ? "Declined" : "Approved"} by ${l.decided_by === me.email ? "you" : shortNameOf(core.users, l.decided_by)}`}
                        {l.status === "Declined" && l.decision_note && `: ${l.decision_note}`}
                        {l.status === "Picked up" && ` · picked up ${formatDay(dayOf(new Date(l.picked_up_at)))}`}
                        {l.status === "Returned" && ` · returned ${formatDay(l.returned_on)}, ${l.return_ok === "no" ? "problem reported" : "all OK"}`}
                        {l.status === "Cancelled" && `Cancelled by ${l.cancelled_by === me.email ? "you" : shortNameOf(core.users, l.cancelled_by)}${l.cancel_note ? `: ${l.cancel_note}` : ""}`}
                      </span>
                    </span>
                    <LineStatusPill status={l.status} overdue={overdue} />
                  </div>
                  {(l.status === "Approved" || returnable) && (
                    <div className="flex flex-wrap items-start gap-2">
                      {returnable && (
                        <Link href={`/requests/${request.id}/return?lines=${l.id}`} className="btn-secondary btn-small">
                          Mark returned
                        </Link>
                      )}
                      {l.status === "Approved" && (
                        <ActionForm
                          action={cancelAction}
                          values={{ requestId: request.id, lineId: l.id, back: "review" }}
                          label="Cancel this booking"
                          className="btn-secondary btn-small"
                          reason={`Why? ${borrowerFirst} will be emailed this.`}
                          confirmLabel="Cancel and email"
                        />
                      )}
                    </div>
                  )}
                  {l.return_ok === "no" && !l.problem_cleared_at && (
                    <Link href={`/items/${l.item_id}#problem`} className="text-sm font-semibold">
                      See the problem and clear it
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {otherLines.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Others on this request</h2>
          <ul className="card divide-y divide-rule">
            {otherLines.map((l) => {
              const decider = deciderOf(core, l);
              return (
                <li key={l.id} className="flex items-start justify-between gap-2 p-3.5">
                  <span className="flex flex-col">
                    <span className="font-bold">
                      {l.item_name} × {lineQty(l) || l.qty_requested}
                    </span>
                    <span className="text-[13px] text-muted">{decider ? `${shortNameOf(core.users, decider.email)} decides` : "The admins decide"}</span>
                  </span>
                  <LineStatusPill status={l.status} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
