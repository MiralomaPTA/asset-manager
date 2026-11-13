/**
 * How each column's cells turn into values and back. Every cell is stored as
 * text, and the Sheet may be edited by hand, so parsing is forgiving: stray
 * spaces, odd casing, "TRUE" or "yes", and dates in Sheets' US display format
 * are all understood.
 */

import { parseDay } from "@/lib/dates";

export interface Codec<T> {
  parse(raw: string): T;
  format(value: T): string;
}

export type CodecValue<C> = C extends Codec<infer T> ? T : never;

export const text: Codec<string> = {
  parse: (raw) => raw.trim(),
  format: (value) => value,
};

/** Email addresses compare case-insensitively, so they are stored lowercased. */
export const email: Codec<string> = {
  parse: (raw) => raw.trim().toLowerCase(),
  format: (value) => value.trim().toLowerCase(),
};

/** A whole number; blank or unreadable is 0. "1,200" reads as 1200. */
export const int: Codec<number> = {
  parse: (raw) => {
    const n = Number.parseInt(raw.replace(/[,\s]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  },
  format: (value) => String(value),
};

const TRUE = new Set(["true", "yes", "y", "1", "x"]);

/** Blank reads as `blank`: "active" is true until someone marks a row inactive. */
export function bool(blank = false): Codec<boolean> {
  return {
    parse: (raw) => (raw.trim() === "" ? blank : TRUE.has(raw.trim().toLowerCase())),
    format: (value) => (value ? "TRUE" : "FALSE"),
  };
}

/** "Tables & chairs, Outdoor": trimmed, blanks and repeats dropped. */
export const csv: Codec<string[]> = {
  parse: (raw) => unique(raw.split(",")),
  format: (value) => value.join(", "),
};

/** One entry per line within the cell, as in a contents checklist. */
export const multiline: Codec<string[]> = {
  parse: (raw) => unique(raw.split(/\r?\n/)),
  format: (value) => value.join("\n"),
};

function unique(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const value = part.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

/** A Pacific calendar day, "2026-12-11"; "" when blank or unreadable. */
export const day: Codec<string> = {
  parse: (raw) => parseDay(raw),
  format: (value) => value,
};

/**
 * One of a fixed set of values, matched ignoring case and spaces, so a status
 * typed as "picked up" or "PickedUp" still reads as "Picked up".
 */
export function oneOf<const T extends string>(values: readonly T[], fallback: T): Codec<T> {
  const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const lookup = new Map(values.map((v) => [squash(v), v]));
  return {
    parse: (raw) => lookup.get(squash(raw)) ?? fallback,
    format: (value) => value,
  };
}
