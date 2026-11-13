"use client";

import { useActionState } from "react";
import { clearProblemAction } from "@/app/actions/items";
import { NO_STATE } from "@/lib/form-state";

/** For the owner: say what was done about a reported problem, and lower the count if something broke. */
export function ClearProblemForm({ itemId, lineId, quantity }: { itemId: string; lineId: string; quantity: number }) {
  const [state, action, pending] = useActionState(clearProblemAction, NO_STATE);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 border-t border-bad/20 pt-3">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="lineId" value={lineId} />
      <div>
        <label htmlFor="clear-note" className="label">
          What was done?
        </label>
        <textarea id="clear-note" name="note" rows={2} required maxLength={500} className="field" placeholder="Found the scoop in the cooler bin. Back in the box." />
      </div>
      <div>
        <label htmlFor="clear-qty" className="label">
          Quantity now <span className="font-normal text-muted">(lower it if something broke)</span>
        </label>
        <input id="clear-qty" name="quantity" type="number" inputMode="numeric" min={0} max={9999} defaultValue={quantity} className="field w-32" />
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-secondary self-start" disabled={pending}>
        {pending ? "Saving…" : "Clear the problem"}
      </button>
    </form>
  );
}
