"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { decideAction } from "@/app/actions/requests";
import { formatMonthDay, type Day } from "@/lib/dates";
import { NO_STATE } from "@/lib/form-state";
import { AlertIcon } from "@/components/Icons";
import { Stepper } from "@/components/Stepper";

export interface DecideLine {
  id: string;
  name: string;
  requested: number;
  /** Units the item has in all. */
  quantity: number;
  /** Fewest free on any day of the request, ignoring this line. */
  free: number;
  tightestDay: Day;
  heldOnTightestDay: number;
  /** "16 of 16 free Dec 11–14" */
  freeText: string;
  /** Other requests wanting the same item on overlapping days. */
  overlaps: string[];
  /** Set when the viewer decides as an admin for someone else's item. */
  ownerName?: string;
}

export function ReviewForm({ requestId, lines, borrowerFirstName, afterSave }: { requestId: string; lines: DecideLine[]; borrowerFirstName: string; afterSave: string }) {
  const [state, action, pending] = useActionState(decideAction, NO_STATE);
  const [choice, setChoice] = useState<Record<string, "approve" | "decline" | "">>(() => Object.fromEntries(lines.map((l) => [l.id, ""])));
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.id, Math.max(1, Math.min(l.requested, l.free))])));
  const [reason, setReason] = useState<Record<string, string>>({});
  const [overbook, setOverbook] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.attempt) errorRef.current?.focus();
  }, [state.attempt]);

  const own = lines.filter((l) => !l.ownerName);
  const others = lines.filter((l) => l.ownerName);
  const anyChosen = Object.values(choice).some(Boolean);

  const renderLine = (line: DecideLine) => {
    const c = choice[line.id];
    const q = qty[line.id] ?? line.requested;
    const over = c === "approve" && q > line.free;
    const error = state.lineErrors?.[line.id];
    return (
      <li key={line.id} className={`card flex flex-col gap-3 p-3.5 ${error ? "border-bad" : ""}`}>
        <input type="hidden" name="lineId" value={line.id} />
        <div className="flex items-start justify-between gap-2">
          <span className="text-[16px] font-bold">{line.name}</span>
          <span className="flex-none text-sm font-semibold text-muted">{line.requested} requested</span>
        </div>
        {line.ownerName && <p className="-mt-2 text-[13px] text-muted">{line.ownerName}&apos;s item. You can decide it as an admin.</p>}
        <p className={`-mt-1 text-sm font-semibold ${line.free < line.requested ? "text-warn" : "text-ok"}`}>{line.freeText}</p>
        {line.overlaps.map((o) => (
          <p key={o} className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] leading-snug text-warn">
            <strong>Overlaps</strong> {o}
          </p>
        ))}
        <div role="radiogroup" aria-label={`Decision for ${line.name}`} className="grid grid-cols-2 gap-2">
          {(["approve", "decline"] as const).map((value) => (
            <label
              key={value}
              className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-[15px] font-bold ${
                c === value ? (value === "approve" ? "border-ok bg-ok-soft text-ok" : "border-bad bg-bad-faint text-bad") : "border-field bg-white text-ink"
              }`}
            >
              <input type="radio" name={`action:${line.id}`} value={value} checked={c === value} onChange={() => setChoice((p) => ({ ...p, [line.id]: value }))} className="sr-only" />
              {value === "approve" ? "Approve" : "Decline"}
            </label>
          ))}
        </div>
        {c === "approve" && line.requested > 1 && (
          <div className="flex flex-wrap items-center gap-3">
            <Stepper id={`qty-${line.id}`} name={`qty:${line.id}`} value={q} max={line.requested} label={`${line.name.toLowerCase()} to approve`} onChange={(n) => setQty((p) => ({ ...p, [line.id]: n }))} invalid={over} />
            <span className="text-sm text-body">{q < line.requested ? `Approving ${q} of ${line.requested}` : "Approving all"}</span>
          </div>
        )}
        {c === "approve" && line.requested === 1 && <input type="hidden" name={`qty:${line.id}`} value={1} />}
        {over && (
          <div className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] leading-snug text-bad">
            <p>
              Approving {q} would overbook {formatMonthDay(line.tightestDay)} by {q - line.free}. Approved bookings hold {line.heldOnTightestDay} of {line.quantity}.
            </p>
            <label className="mt-2 flex items-center gap-2 font-semibold">
              <input type="checkbox" name={`overbook:${line.id}`} value="1" checked={overbook[line.id] ?? false} onChange={(e) => setOverbook((p) => ({ ...p, [line.id]: e.target.checked }))} />
              Approve anyway
            </label>
          </div>
        )}
        {c === "decline" && (
          <div>
            <label htmlFor={`reason-${line.id}`} className="label">
              Why? <span className="font-normal text-muted">({borrowerFirstName} will see this)</span>
            </label>
            <textarea id={`reason-${line.id}`} name={`reason:${line.id}`} rows={2} maxLength={500} required value={reason[line.id] ?? ""} onChange={(e) => setReason((p) => ({ ...p, [line.id]: e.target.value }))} className="field" placeholder="Already lent out that weekend" />
          </div>
        )}
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
      </li>
    );
  };

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      {state.error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="notice bg-bad-soft font-semibold text-bad">
          <AlertIcon className="mt-0.5 flex-none" />
          {state.error}
        </p>
      )}
      {own.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Your items</h2>
          <ul className="flex flex-col gap-2.5">{own.map(renderLine)}</ul>
        </section>
      )}
      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Other owners&apos; items</h2>
          <ul className="flex flex-col gap-2.5">{others.map(renderLine)}</ul>
        </section>
      )}
      <div>
        <label htmlFor="ownerNote" className="label">
          Note to {borrowerFirstName} <span className="font-normal text-muted">(optional; goes in the confirmation email)</span>
        </label>
        <textarea id="ownerNote" name="ownerNote" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="field" placeholder="Tables and chairs are on rack B. Please stack chairs 10 high when you bring them back." />
      </div>
      <button type="submit" className="btn-primary h-[52px]" disabled={pending || !anyChosen}>
        {pending ? "Saving…" : "Save decisions"}
      </button>
      <p className="hint -mt-3 text-center">{anyChosen ? afterSave : "Choose Approve or Decline for each item. Items you leave stay pending."}</p>
    </form>
  );
}
