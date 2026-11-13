"use client";

import { MinusIcon, PlusIcon } from "@/components/Icons";

/** A quantity with big − and + buttons, for thumbs. The input stays typeable. */
export function Stepper({
  id,
  name,
  value,
  min = 1,
  max,
  label,
  onChange,
  invalid = false,
}: {
  id: string;
  name: string;
  value: number;
  min?: number;
  max: number;
  /** "folding chairs": read out as "Fewer folding chairs" and "More folding chairs". */
  label: string;
  onChange: (value: number) => void;
  invalid?: boolean;
}) {
  const set = (n: number) => onChange(Math.max(min, Math.min(Math.max(max, min), n)));
  const button = "flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl border border-field bg-white text-ink disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={button} aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => set(value - 1)}>
        <MinusIcon />
      </button>
      <label htmlFor={id} className="sr-only">
        How many {label}
      </label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={Math.max(max, min)}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Math.trunc(Number(e.target.value)))}
        aria-invalid={invalid || undefined}
        className={`h-11 w-16 rounded-xl border bg-white text-center text-lg font-bold [appearance:textfield] focus:border-brand focus:outline-none [&::-webkit-inner-spin-button]:appearance-none ${invalid ? "border-bad" : "border-field"}`}
      />
      <button type="button" className={button} aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
        <PlusIcon />
      </button>
    </div>
  );
}
