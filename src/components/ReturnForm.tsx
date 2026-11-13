"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { returnAction } from "@/app/actions/requests";
import { type Day } from "@/lib/dates";
import { NO_STATE } from "@/lib/form-state";
import { AlertIcon, PinIcon } from "@/components/Icons";
import { PhotoInput } from "@/components/PhotoInput";

export interface ReturnLine {
  id: string;
  name: string;
  qty: number;
  contents: string[];
  ownerName: string;
}

/**
 * The return form, for one item or several at once ("Return all"). Each item
 * gets its own answer, checklist, notes and photo, because each item keeps
 * its own condition history for the next borrower.
 */
export function ReturnForm({
  requestId,
  lines,
  instructions,
  today,
  earliest,
  back,
}: {
  requestId: string;
  lines: ReturnLine[];
  instructions: { place: string; text: string }[];
  today: Day;
  earliest: Day;
  back: string;
}) {
  const [state, action, pending] = useActionState(returnAction, NO_STATE);
  const [ok, setOk] = useState<Record<string, "yes" | "no" | "">>(() => Object.fromEntries(lines.map((l) => [l.id, ""])));
  const [checked, setChecked] = useState<Record<string, string[]>>(() => Object.fromEntries(lines.map((l) => [l.id, l.contents])));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [returnedOn, setReturnedOn] = useState(today);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.attempt) errorRef.current?.focus();
  }, [state.attempt]);

  const missing = (l: ReturnLine) => l.contents.filter((c) => !checked[l.id]?.includes(c));
  const problem = (l: ReturnLine) => ok[l.id] === "no" || missing(l).length > 0;
  const problems = lines.filter(problem);
  const several = lines.length > 1;

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="back" value={back} />
      {state.error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="notice bg-bad-soft font-semibold text-bad">
          <AlertIcon className="mt-0.5 flex-none" />
          {state.error}
        </p>
      )}

      {instructions.map((i) => (
        <p key={i.place} className="notice bg-brand-soft text-brand-ink">
          <PinIcon className="mt-0.5 flex-none" />
          <span>
            <strong>How to return{instructions.length > 1 ? ` to ${i.place}` : ""}:</strong> {i.text}
          </span>
        </p>
      ))}

      {lines.map((line) => {
        const lineMissing = missing(line);
        const isProblem = problem(line);
        const error = state.lineErrors?.[line.id];
        return (
          <section key={line.id} className={several ? "card flex flex-col gap-5 p-4" : "flex flex-col gap-5"} aria-labelledby={`h-${line.id}`}>
            <input type="hidden" name="lineId" value={line.id} />
            {several && (
              <h2 id={`h-${line.id}`} className="text-[19px] font-extrabold">
                {line.name} × {line.qty}
              </h2>
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="h2 mb-2.5" id={several ? undefined : `h-${line.id}`}>
                Everything OK?
              </legend>
              {(["yes", "no"] as const).map((value) => {
                const on = ok[line.id] === value;
                const bad = value === "no";
                return (
                  <label
                    key={value}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3.5 text-[16px] font-semibold ${
                      on && bad ? "border-2 border-bad bg-bad-faint font-bold text-bad" : on ? "border-2 border-brand bg-brand-soft font-bold" : "border border-field bg-white"
                    }`}
                  >
                    <input type="radio" name={`ok:${line.id}`} value={value} checked={on} onChange={() => setOk((p) => ({ ...p, [line.id]: value }))} style={bad ? { accentColor: "var(--color-bad)" } : undefined} />
                    {bad ? "There's a problem" : "Yes, all good"}
                  </label>
                );
              })}
            </fieldset>

            {line.contents.length > 0 && (
              <fieldset className="flex flex-col gap-1.5">
                <legend className="h2 mb-1">What&apos;s coming back?</legend>
                <p className="hint mb-1">Untick anything that&apos;s missing.</p>
                <div className="card divide-y divide-rule">
                  {line.contents.map((part) => {
                    const on = checked[line.id]?.includes(part) ?? false;
                    return (
                      <label key={part} className="flex min-h-[50px] cursor-pointer items-center gap-3 px-3.5 text-[16px] font-semibold">
                        <input
                          type="checkbox"
                          name={`part:${line.id}`}
                          value={part}
                          checked={on}
                          onChange={() => setChecked((p) => ({ ...p, [line.id]: on ? p[line.id].filter((c) => c !== part) : [...(p[line.id] ?? []), part] }))}
                        />
                        <span className="flex-1">{part}</span>
                        {!on && <span className="text-[13px] font-bold text-bad">Missing</span>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`notes-${line.id}`} className="h2">
                Notes for the next person
              </label>
              <p className="hint -mt-0.5">Shown on the item page. {isProblem ? "Required: say what's wrong." : "Optional: tips, quirks, anything worth knowing."}</p>
              <textarea
                id={`notes-${line.id}`}
                name={`notes:${line.id}`}
                rows={3}
                maxLength={2000}
                value={notes[line.id] ?? ""}
                onChange={(e) => setNotes((p) => ({ ...p, [line.id]: e.target.value }))}
                aria-invalid={!!error || undefined}
                className={`field ${error ? "border-bad" : ""}`}
                placeholder={lineMissing.length > 0 ? `What happened to the ${lineMissing.join(", ").toLowerCase()}?` : isProblem ? "What's wrong?" : "Takes 5 minutes to heat up, so turn it on early."}
              />
              {error && <p className="text-sm font-semibold text-bad">{error}</p>}
            </div>

            <PhotoInput name={`photo:${line.id}`} label="Photo (optional)" hint={isProblem ? "A photo helps the owner see what's wrong." : undefined} />
          </section>
        );
      })}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="returnedOn" className="h2">
          Returned on
        </label>
        <input id="returnedOn" name="returnedOn" type="date" min={earliest} max={today} value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} className="field px-2" aria-invalid={state.field === "returnedOn" || undefined} />
        <p className="hint">Change it if it went back on an earlier day.</p>
      </div>

      {problems.length > 0 && (
        <p className="notice bg-bad-soft text-bad">
          <AlertIcon className="mt-0.5 flex-none" />
          <span>
            {problems
              .map((l) => {
                const m = missing(l);
                return `${l.ownerName} will get an email about ${m.length > 0 ? `the missing ${m.join(", ").toLowerCase()}` : `the ${l.name.toLowerCase()}`}`;
              })
              .join("; ")}
            , and {problems.length === 1 ? `the ${problems[0].name.toLowerCase()} will` : "those items will"} show <strong>Problem reported</strong> until it&apos;s sorted.
          </span>
        </p>
      )}

      <button type="submit" className="btn-primary h-[52px]" disabled={pending || lines.some((l) => !ok[l.id])}>
        {pending ? "Saving…" : several ? `Mark ${lines.length} items returned` : "Mark returned"}
      </button>
      {lines.some((l) => !ok[l.id]) && <p className="hint -mt-4 text-center">Answer “Everything OK?” {several ? "for each item " : ""}first.</p>}
    </form>
  );
}
