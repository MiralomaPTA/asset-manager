import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cancelAction, pickupAction } from "@/app/actions/requests";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { canDecide, deciderOf, isRequestOverdue, lineQty, linesOf, loadCore, requestStatusOf, todayOf } from "@/server/data";
import { shortNameOf } from "@/server/users";
import { byPlace, requestHistory } from "@/server/views";
import { daysBetween, formatDay, dayOf } from "@/lib/dates";
import { plural } from "@/lib/names";
import type { LineRow } from "@/server/db/schema";
import { ActionForm } from "@/components/ActionForm";
import { AlertIcon, BackIcon, CheckIcon, InfoIcon, PinIcon } from "@/components/Icons";
import { LineStatusPill, RequestStatusPill } from "@/components/Status";

export default async function RequestPage(props: PageProps<"/requests/[id]">) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const me = await requireMe(`/requests/${id}`);
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const request = core.requests.find((r) => r.id === id);
  if (!request) notFound();
  const lines = linesOf(core, request.id);
  if (request.borrower_email !== me.email) {
    if (me.isAdmin || lines.some((l) => canDecide(core, me.user, l))) redirect(`/review/${request.id}`);
    notFound();
  }

  const status = requestStatusOf(core, request.id);
  const overdue = isRequestOverdue(core, request, today);
  const active = lines.filter((l) => l.status === "Pending" || l.status === "Approved" || l.status === "Picked up" || l.status === "Returned");
  const gone = lines.filter((l) => l.status === "Declined" || l.status === "Cancelled" || l.status === "Expired");
  const approved = lines.filter((l) => l.status === "Approved");
  const returnable = lines.filter((l) => l.status === "Picked up" || (l.status === "Approved" && request.pickup_date <= today));
  const cancellable = lines.filter((l) => l.status === "Pending" || l.status === "Approved");
  const waitingOn = [...new Set(lines.filter((l) => l.status === "Pending").map((l) => deciderOf(core, l)?.email ?? ""))].map((e) => (e ? shortNameOf(core.users, e) : "the PTA admins"));
  const notes = [...new Map(lines.filter((l) => l.owner_note).map((l) => [`${l.decided_by}\n${l.owner_note}`, l])).values()];
  const history = requestHistory(core, request, lines, me.email);
  const contentsOf = (line: LineRow) => core.items.find((i) => i.id === line.item_id)?.contents ?? [];

  let callout: { tone: string; text: React.ReactNode } | null = null;
  if (overdue) callout = { tone: "bg-bad-soft text-bad", text: <><strong>Overdue:</strong> it was due back {formatDay(request.return_date)}. Please return it, then tap Returned for each item.</> };
  else if (status === "Out" && request.return_date === today) callout = { tone: "bg-warn-soft text-warn", text: <><strong>Due back today.</strong> Tap Returned for each item and leave a note for the next person.</> };
  else if (status === "Out") callout = { tone: "bg-brand-soft text-brand-ink", text: <>Due back {formatDay(request.return_date)}.</> };
  else if (status === "Waiting for approval") callout = { tone: "bg-warn-soft text-warn", text: <>Waiting for {new Intl.ListFormat("en").format(waitingOn)}. You&apos;ll get one email once everything is decided.</> };
  else if (status === "Approved" && approved.length > 0) {
    const d = daysBetween(today, request.pickup_date);
    callout = { tone: "bg-ok-soft text-ok", text: d <= 0 ? <><strong>Pick up {d === 0 ? "today" : "now"}.</strong> Tap Picked up once you have everything.</> : <>Approved. Pick up on {formatDay(request.pickup_date)}.</> };
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href="/requests" className="-mb-2 inline-flex h-11 items-center gap-1 self-start text-[15px] font-semibold no-underline">
        <BackIcon />
        My requests
      </Link>

      {query.sent === "1" && (
        <p className="notice bg-ok-soft text-ok" role="status">
          <CheckIcon size={18} className="mt-0.5 flex-none" />
          <span>
            Request {request.id} sent. {status === "Waiting for approval" ? "The owners have been emailed; you'll hear back once everything is decided." : "Everything was approved."}
          </span>
        </p>
      )}
      {query.picked && <p className="notice bg-ok-soft text-ok" role="status">Marked {plural(Number(query.picked), "item")} picked up. Check everything in the box is there.</p>}
      {query.returned && (
        <p className="notice bg-ok-soft text-ok" role="status">
          Thanks! {plural(Number(query.returned), "item")} marked returned.{Number(query.problems) > 0 ? " The owner has been told about the problem." : ""}
        </p>
      )}
      {query.cancelled && <p className="notice bg-ok-soft text-ok" role="status">Cancelled {plural(Number(query.cancelled), "item")}. The owners have been told.</p>}

      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="h1">{request.event_name}</h1>
          <RequestStatusPill status={status} overdue={overdue} />
        </div>
        <p className="text-sm text-muted">
          {request.id} · {request.event_type} · {formatDay(request.pickup_date)} → {formatDay(request.return_date)}
        </p>
      </div>

      {callout && (
        <p className={`notice ${callout.tone}`}>
          <InfoIcon className="mt-0.5 flex-none" />
          <span>{callout.text}</span>
        </p>
      )}

      {byPlace(core, active).map((group) => {
        const showPickup = group.lines.some((l) => l.status === "Approved") && group.location?.pickup_instructions;
        const showReturn = group.lines.some((l) => l.status === "Picked up") && group.location?.return_instructions;
        return (
          <section key={group.name} className="flex flex-col gap-2">
            <h2 className="h2 flex items-center gap-1.5">
              <PinIcon className="text-brand" />
              {group.name}
            </h2>
            {showPickup && (
              <p className="rounded-xl bg-white px-3.5 py-2.5 text-sm leading-snug text-body ring-1 ring-line">
                <strong className="text-ink">Pickup:</strong> {group.location!.pickup_instructions}
              </p>
            )}
            <ul className="card divide-y divide-rule">
              {group.lines.map((line) => {
                const contents = contentsOf(line);
                const lineOverdue = (line.status === "Picked up" || line.status === "Approved") && request.return_date < today;
                return (
                  <li key={line.id} className="flex flex-col gap-2 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex flex-col">
                        <span className="text-[16px] font-bold">
                          {line.item_name} × {lineQty(line)}
                        </span>
                        <span className="text-[13px] text-muted">
                          {line.status === "Pending" && `Waiting for ${deciderOf(core, line) ? shortNameOf(core.users, deciderOf(core, line)!.email) : "the PTA admins"}`}
                          {line.status === "Approved" && (line.qty_approved < line.qty_requested ? `Approved ${line.qty_approved} of the ${line.qty_requested} you asked for` : "Approved")}
                          {line.status === "Picked up" && `Picked up ${formatDay(dayOf(new Date(line.picked_up_at)))}`}
                          {line.status === "Returned" && `Returned ${formatDay(line.returned_on)} · ${line.return_ok === "no" ? "problem reported" : "all OK"}`}
                        </span>
                      </span>
                      <LineStatusPill status={line.status} overdue={lineOverdue} />
                    </div>
                    {contents.length > 0 && (line.status === "Approved" || line.status === "Picked up") && (
                      <p className="text-[13px] text-body">In the box: {contents.join(", ")}</p>
                    )}
                    {(line.status === "Approved" || line.status === "Picked up" || line.status === "Pending") && (
                      <div className="flex flex-wrap items-start gap-2">
                        {line.status === "Approved" && <ActionForm action={pickupAction} values={{ requestId: request.id, lineId: line.id }} label="Picked up" className="btn-primary btn-small" />}
                        {returnable.includes(line) && (
                          <Link href={`/requests/${request.id}/return?lines=${line.id}`} className={line.status === "Picked up" ? "btn-primary btn-small" : "btn-secondary btn-small"}>
                            Returned
                          </Link>
                        )}
                        {(line.status === "Pending" || line.status === "Approved") && (
                          <ActionForm action={cancelAction} values={{ requestId: request.id, lineId: line.id }} label="Cancel" className="btn-secondary btn-small" confirm={`Cancel the ${line.item_name.toLowerCase()}? The owner will be told.`} confirmLabel="Yes, cancel it" />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {showReturn && (
              <p className="notice bg-brand-soft text-brand-ink">
                <PinIcon className="mt-0.5 flex-none" />
                <span>
                  <strong>How to return:</strong> {group.location!.return_instructions}
                </span>
              </p>
            )}
          </section>
        );
      })}

      {(approved.length > 1 || returnable.length > 1) && (
        <div className="flex flex-col gap-2">
          {approved.length > 1 && <ActionForm action={pickupAction} values={{ requestId: request.id }} label={`All ${approved.length} picked up`} className="btn-primary h-[52px] w-full" />}
          {returnable.length > 1 && (
            <Link href={`/requests/${request.id}/return`} className={approved.length > 1 ? "btn-secondary h-[52px] w-full" : "btn-primary h-[52px] w-full"}>
              Return all {returnable.length} items
            </Link>
          )}
        </div>
      )}

      {notes.map((l) => (
        <div key={l.id} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px]">
          <span className="block text-xs font-bold text-muted uppercase">Note from {shortNameOf(core.users, l.decided_by)}</span>
          {l.owner_note}
        </div>
      ))}

      {gone.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Not going ahead</h2>
          <ul className="card divide-y divide-rule">
            {gone.map((l) => (
              <li key={l.id} className="flex flex-col gap-0.5 p-3.5">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-bold">
                    {l.item_name} × {l.qty_requested}
                  </span>
                  <LineStatusPill status={l.status} />
                </span>
                {l.status === "Declined" && l.decision_note && <span className="text-sm text-body">{shortNameOf(core.users, l.decided_by)}: {l.decision_note}</span>}
                {l.status === "Cancelled" && (
                  <span className="text-sm text-body">
                    {l.cancelled_by === me.email ? "You cancelled it" : `${shortNameOf(core.users, l.cancelled_by)} cancelled it`}
                    {l.cancel_note ? `: ${l.cancel_note}` : ""}
                  </span>
                )}
                {l.status === "Expired" && <span className="text-sm text-body">No one decided before pickup.</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {request.borrower_note && (
        <div className="text-[15px] text-body">
          <span className="block text-xs font-bold text-muted uppercase">Your note to the owners</span>
          {request.borrower_note}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="h2">History</h2>
        <ol className="flex flex-col gap-2 border-l-2 border-line pl-4">
          {history.map((h, i) => (
            <li key={i} className="text-[15px]">
              <span className="mr-2 text-[13px] font-semibold text-muted">{h.day}</span>
              {h.text}
            </li>
          ))}
        </ol>
      </section>

      {cancellable.length > 0 && !lines.some((l) => l.status === "Picked up") && (
        <div className="border-t border-line pt-4">
          <ActionForm
            action={cancelAction}
            values={{ requestId: request.id }}
            label="Cancel the whole request"
            className="btn-danger btn-small"
            confirm="Cancel everything on this request? The owners will be told. To change dates or items, cancel and send a new request."
            confirmLabel="Yes, cancel the request"
          />
        </div>
      )}
      {overdue && (
        <p className="hint flex items-center gap-1.5">
          <AlertIcon size={14} /> The owner can also mark it returned for you once it&apos;s back.
        </p>
      )}
    </div>
  );
}
