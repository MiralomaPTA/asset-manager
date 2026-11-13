"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { removeFromCart, saveCartQuantities } from "@/app/actions/cart";
import { submitRequestAction } from "@/app/actions/requests";
import { freeOver, holdingOverlaps, pendingOverlaps, type Booking } from "@/lib/availability";
import { addDays, formatShortRange, isDay, type Day } from "@/lib/dates";
import { NO_STATE } from "@/lib/form-state";
import { AlertIcon, XIcon } from "@/components/Icons";
import { Stepper } from "@/components/Stepper";

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  ownerName: string;
  qty: number;
}

export interface BookingLabel {
  eventName: string;
  borrower: string;
}

const range = formatShortRange;

/**
 * The request being put together. Availability is worked out here, in the
 * browser, from the same rules the server checks again on submit, so the
 * numbers change as soon as the dates do.
 */
export function RequestForm({
  items,
  bookings,
  labels,
  eventTypes,
  today,
}: {
  items: CartItem[];
  bookings: Booking[];
  labels: Record<string, BookingLabel>;
  eventTypes: string[];
  today: Day;
}) {
  const [state, action, pending] = useActionState(submitRequestAction, NO_STATE);
  const [eventType, setEventType] = useState("");
  const [eventName, setEventName] = useState("");
  const [pickup, setPickup] = useState("");
  const [ret, setRet] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.id, i.qty])));
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Keep typed quantities in the cart cookie, so leaving to add another item doesn't lose them.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void saveCartQuantities(Object.entries(qty).map(([itemId, q]) => ({ itemId, qty: q })));
    }, 600);
    return () => clearTimeout(timer);
  }, [qty]);

  useEffect(() => {
    if (state.attempt) errorRef.current?.focus();
  }, [state.attempt]);

  const datesSet = isDay(pickup) && isDay(ret) && ret >= pickup;
  const lines = useMemo(
    () =>
      items.map((item) => {
        if (!datesSet) return { item, free: item.quantity, holding: [] as Booking[], pending: [] as Booking[] };
        const { free } = freeOver(item.quantity, bookings, item.id, pickup, ret, today);
        return { item, free, holding: holdingOverlaps(bookings, item.id, pickup, ret, today), pending: pendingOverlaps(bookings, item.id, pickup, ret) };
      }),
    [items, bookings, pickup, ret, today, datesSet],
  );
  const fieldError = (name: string) => (state.field === name ? state.error : undefined);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="notice bg-bad-soft font-semibold text-bad">
          <AlertIcon className="mt-0.5 flex-none" />
          {state.error}
        </p>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="h2 mb-3">The event</legend>
        <div>
          <label htmlFor="eventType" className="label">
            Event type
          </label>
          <select id="eventType" name="eventType" required value={eventType} onChange={(e) => setEventType(e.target.value)} className="field" aria-invalid={!!fieldError("eventType") || undefined}>
            <option value="" disabled>
              Choose one
            </option>
            {eventTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="eventName" className="label">
            Event name
          </label>
          <input id="eventName" name="eventName" required maxLength={100} placeholder="Winter Carnival" value={eventName} onChange={(e) => setEventName(e.target.value)} className="field" aria-invalid={!!fieldError("eventName") || undefined} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="h2 mb-3">Dates</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pickupDate" className="label">
              Pick up
            </label>
            <input
              id="pickupDate"
              name="pickupDate"
              type="date"
              required
              min={today}
              value={pickup}
              onChange={(e) => {
                setPickup(e.target.value);
                if (isDay(e.target.value) && (!isDay(ret) || ret < e.target.value)) setRet(e.target.value);
              }}
              className="field px-2"
              aria-invalid={!!fieldError("pickupDate") || undefined}
            />
          </div>
          <div>
            <label htmlFor="returnDate" className="label">
              Return
            </label>
            <input id="returnDate" name="returnDate" type="date" required min={isDay(pickup) ? pickup : today} max={isDay(pickup) ? addDays(pickup, 365) : undefined} value={ret} onChange={(e) => setRet(e.target.value)} className="field px-2" aria-invalid={!!fieldError("returnDate") || undefined} />
          </div>
        </div>
        <p className="hint">Whole days: the items are yours from pickup day through return day.</p>
      </fieldset>

      <section className="flex flex-col gap-2">
        <h2 className="h2">Items ({items.length})</h2>
        <ul className="flex flex-col gap-2.5">
          {lines.map(({ item, free, holding, pending: others }) => {
            const q = qty[item.id] ?? 1;
            const over = datesSet && q > free;
            const serverError = state.lineErrors?.[item.id];
            return (
              <li key={item.id} className={`card flex flex-col gap-2.5 p-3.5 ${over || serverError ? "border-bad" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="flex flex-col">
                    <Link href={`/items/${item.id}`} className="text-[16px] font-bold text-ink no-underline">
                      {item.name}
                    </Link>
                    <span className="text-[13px] text-muted">Owner: {item.ownerName}</span>
                  </span>
                  <button
                    type="submit"
                    formAction={removeFromCart.bind(null, item.id)}
                    formNoValidate
                    className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-page hover:text-bad"
                    aria-label={`Remove ${item.name}`}
                  >
                    <XIcon size={18} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {item.quantity > 1 ? (
                    <Stepper id={`qty-${item.id}`} name={`qty:${item.id}`} value={q} max={datesSet ? Math.max(free, 1) : item.quantity} label={item.name.toLowerCase()} invalid={over} onChange={(n) => setQty((prev) => ({ ...prev, [item.id]: n }))} />
                  ) : (
                    <input type="hidden" name={`qty:${item.id}`} value={1} />
                  )}
                  <span className={`text-sm font-semibold ${!datesSet ? "text-muted" : free <= 0 || over ? "text-bad" : free < item.quantity ? "text-warn" : "text-ok"}`}>
                    {!datesSet
                      ? `${item.quantity} in all · choose dates to check`
                      : free <= 0
                        ? `None free ${range(pickup, ret)}`
                        : free >= item.quantity
                          ? item.quantity === 1
                            ? `Free ${range(pickup, ret)}`
                            : `${free} free ${range(pickup, ret)}`
                          : `${free} of ${item.quantity} free ${range(pickup, ret)}`}
                  </span>
                </div>
                {datesSet && free < item.quantity && holding.length > 0 && (
                  <p className="text-[13px] text-body">
                    Booked:{" "}
                    {holding
                      .map((b) => `${labels[b.requestId]?.eventName ?? "another event"} (${b.qty}, ${range(b.pickup, b.ret)})`)
                      .join("; ")}
                    .
                  </p>
                )}
                {datesSet && others.length > 0 && (
                  <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] leading-snug text-warn">
                    <strong>Also requested:</strong>{" "}
                    {others.map((b) => `${labels[b.requestId]?.eventName ?? "another event"} (${labels[b.requestId]?.borrower ?? "someone"}) wants ${b.qty} on ${range(b.pickup, b.ret)}`).join("; ")}. It&apos;s pending, so{" "}
                    {item.ownerName === "PTA admins" ? "the admins" : item.ownerName} will sort out who gets what.
                  </p>
                )}
                {(over || serverError) && (
                  <p className="text-sm font-semibold text-bad">{serverError ?? (free <= 0 ? "None free on these dates. Remove it or change the dates." : `Only ${free} free on these dates.`)}</p>
                )}
              </li>
            );
          })}
        </ul>
        <Link href="/" className="self-start py-2 text-[15px] font-semibold">
          Add more items
        </Link>
      </section>

      <div>
        <label htmlFor="note" className="label">
          Note to the owners <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="note" name="note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where it's going, when you'll bring it back…" className="field" />
      </div>

      <button type="submit" className="btn-primary h-[52px]" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
