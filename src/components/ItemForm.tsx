"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveItemAction } from "@/app/actions/items";
import { NO_STATE } from "@/lib/form-state";
import { AlertIcon } from "@/components/Icons";
import { PhotoInput } from "@/components/PhotoInput";

export interface ItemFormValues {
  id: string;
  name: string;
  description: string;
  tags: string[];
  location: string;
  quantity: number | "";
  ownerEmail: string;
  contents: string[];
  photoId: string;
}

export function ItemForm({
  item,
  locations,
  knownTags,
  owners,
  canSetOwner,
}: {
  item: ItemFormValues;
  /** Names from the Locations tab; empty means free text. */
  locations: string[];
  knownTags: string[];
  /** Approved users who could own it: value is the email. */
  owners: { email: string; label: string }[];
  canSetOwner: boolean;
}) {
  const [state, action, pending] = useActionState(saveItemAction, NO_STATE);
  const [v, setV] = useState({
    name: item.name,
    description: item.description,
    tags: item.tags.join(", "),
    location: item.location,
    quantity: String(item.quantity),
    ownerEmail: item.ownerEmail,
    contents: item.contents.join("\n"),
  });
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [key]: e.target.value }));
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.attempt) errorRef.current?.focus();
  }, [state.attempt]);
  const current = v.tags.split(",").map((t) => t.trim().toLowerCase());
  const suggestions = knownTags.filter((t) => !current.includes(t.toLowerCase()));
  const invalid = (field: string) => (state.field === field ? true : undefined);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="itemId" value={item.id} />
      {state.error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="notice bg-bad-soft font-semibold text-bad">
          <AlertIcon className="mt-0.5 flex-none" />
          {state.error}
        </p>
      )}
      <div>
        <label htmlFor="name" className="label">
          Name
        </label>
        <input id="name" name="name" required maxLength={80} value={v.name} onChange={set("name")} className="field" placeholder="Folding table, 6 ft" aria-invalid={invalid("name")} />
      </div>
      <PhotoInput name="photo" label="Photo" current={item.photoId ? `/photos/${item.photoId}` : undefined} hint="Take one now or choose from your photos. Big photos are shrunk before they're sent." />
      <div>
        <label htmlFor="description" className="label">
          Description <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="description" name="description" rows={3} maxLength={2000} value={v.description} onChange={set("description")} className="field" placeholder="Size, what it's good for, anything borrowers should know." />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label htmlFor="location" className="label">
            Kept at
          </label>
          {locations.length > 0 ? (
            <select id="location" name="location" required value={v.location} onChange={set("location")} className="field" aria-invalid={invalid("location")}>
              <option value="" disabled>
                Choose a place
              </option>
              {!locations.includes(v.location) && v.location && <option value={v.location}>{v.location} (not in the Locations tab)</option>}
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          ) : (
            <input id="location" name="location" required value={v.location} onChange={set("location")} className="field" aria-invalid={invalid("location")} />
          )}
        </div>
        <div>
          <label htmlFor="quantity" className="label">
            How many
          </label>
          <input id="quantity" name="quantity" type="number" inputMode="numeric" min={0} max={9999} required value={v.quantity} onChange={set("quantity")} className="field w-24 text-center font-bold" aria-invalid={invalid("quantity")} />
        </div>
      </div>
      <p className="hint -mt-3">Set the count to 0 to stop lending it for a while, for example while it&apos;s broken.</p>
      <div>
        <label htmlFor="tags" className="label">
          Tags <span className="font-normal text-muted">(comma between each)</span>
        </label>
        <input id="tags" name="tags" value={v.tags} onChange={set("tags")} className="field" placeholder="Tables & chairs, Outdoor" />
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                className="pill cursor-pointer bg-white py-1.5 text-[13px] text-body ring-1 ring-line hover:ring-field"
                onClick={() => setV((p) => ({ ...p, tags: [p.tags.trim().replace(/,$/, ""), t].filter(Boolean).join(", ") }))}
              >
                + {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label htmlFor="contents" className="label">
          What&apos;s in the box <span className="font-normal text-muted">(optional, one per line)</span>
        </label>
        <textarea id="contents" name="contents" rows={4} value={v.contents} onChange={set("contents")} className="field" placeholder={"Kettle\nScoop\nPower cord"} aria-describedby="contents_hint" />
        <p id="contents_hint" className="hint mt-1">
          Borrowers see this at pickup and tick it off at return. Anything unticked is reported to the owner.
        </p>
      </div>
      {canSetOwner && (
        <div>
          <label htmlFor="ownerEmail" className="label">
            Owner
          </label>
          <select id="ownerEmail" name="ownerEmail" value={v.ownerEmail} onChange={set("ownerEmail")} className="field" aria-invalid={invalid("ownerEmail")}>
            <option value="">No owner: the admins approve requests</option>
            {owners.map((o) => (
              <option key={o.email} value={o.email}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="hint mt-1">The owner approves requests for it, gets told about problems, and can edit it.</p>
        </div>
      )}
      <button type="submit" className="btn-primary h-[52px]" disabled={pending}>
        {pending ? "Saving…" : item.id ? "Save changes" : "Add item"}
      </button>
    </form>
  );
}
