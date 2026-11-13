"use client";

import { useActionState, useState } from "react";
import { NO_STATE, type FormState } from "@/lib/form-state";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * One button that runs a server action with fixed hidden values, showing any
 * error next to it. With `confirm`, the first tap asks "are you sure" and
 * only the second runs it; with `reason`, the confirm step also asks why.
 */
export function ActionForm({
  action,
  values,
  label,
  pendingLabel,
  className = "btn-secondary btn-small",
  confirm,
  confirmLabel,
  reason,
}: {
  action: Action;
  values: Record<string, string | string[]>;
  label: string;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
  confirmLabel?: string;
  /** The label of a required reason box shown at the confirm step. */
  reason?: string;
}) {
  const [state, run, pending] = useActionState(action, NO_STATE);
  const [asking, setAsking] = useState(false);
  const hidden = Object.entries(values).flatMap(([name, v]) => (Array.isArray(v) ? v : [v]).map((value) => <input key={`${name}=${value}`} type="hidden" name={name} value={value} />));

  if ((confirm || reason) && !asking) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className={className} onClick={() => setAsking(true)}>
          {label}
        </button>
      </div>
    );
  }
  return (
    <form action={run} className="flex flex-col gap-2">
      {hidden}
      {confirm && <p className="text-sm font-semibold text-body">{confirm}</p>}
      {reason && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {reason}
          <textarea name="reason" rows={2} required maxLength={500} className="field font-normal" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={confirm || reason ? "btn-danger btn-small" : className} disabled={pending}>
          {pending ? (pendingLabel ?? "Saving…") : (confirmLabel ?? label)}
        </button>
        {(confirm || reason) && (
          <button type="button" className="btn-secondary btn-small" onClick={() => setAsking(false)}>
            Keep it
          </button>
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
