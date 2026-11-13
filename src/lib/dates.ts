/**
 * Whole days in Pacific time, written as "YYYY-MM-DD" strings.
 *
 * Bookings are by day, never by time, so every date in the app is one of these
 * strings. They sort and compare as plain strings, and day arithmetic is done
 * in UTC, where there are no daylight-saving gaps.
 */

export const TIME_ZONE = "America/Los_Angeles";

/** "2026-12-11" */
export type Day = string;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: unknown): value is Day {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  return toUtc(value).toISOString().slice(0, 10) === value;
}

function toUtc(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

const pacificDay = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The Pacific calendar day an instant falls on. */
export function dayOf(instant: Date): Day {
  return pacificDay.format(instant);
}

export function today(now: Date = new Date()): Day {
  return dayOf(now);
}

export function addDays(day: Day, n: number): Day {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

/** Whole days from `a` to `b`: 1 for consecutive days, negative when `b` is earlier. */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** Every day from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function eachDay(from: Day, to: Day): Day[] {
  const days: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: Day): number {
  return toUtc(day).getUTCDay();
}

export function isWeekend(day: Day): boolean {
  const w = weekday(day);
  return w === 0 || w === 6;
}

/** The Sunday on or before `day`. */
export function startOfWeek(day: Day): Day {
  return addDays(day, -weekday(day));
}

/**
 * Reads a day typed into the Sheet by hand: "2026-12-11", or "12/11/2026" as
 * Sheets displays dates in a US locale. Anything else is "".
 */
export function parseDay(raw: string): Day | "" {
  const value = raw.trim();
  if (isDay(value)) return value;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (us) {
    const day = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    if (isDay(day)) return day;
  }
  return "";
}

const utcFormat = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });
const weekdayShort = utcFormat({ weekday: "short" });
const monthShort = utcFormat({ month: "short" });
const monthLong = utcFormat({ month: "long" });
const weekdayLong = utcFormat({ weekday: "long" });

/** "Fri Dec 11" */
export function formatDay(day: Day): string {
  const date = toUtc(day);
  return `${weekdayShort.format(date)} ${monthShort.format(date)} ${date.getUTCDate()}`;
}

/** "Friday, December 11" */
export function formatDayLong(day: Day): string {
  const date = toUtc(day);
  return `${weekdayLong.format(date)}, ${monthLong.format(date)} ${date.getUTCDate()}`;
}

/** "Dec 11" */
export function formatMonthDay(day: Day): string {
  const date = toUtc(day);
  return `${monthShort.format(date)} ${date.getUTCDate()}`;
}

/** "Dec 11–14", "Nov 30–Dec 2", or "Dec 11" for one day. */
export function formatShortRange(from: Day, to: Day): string {
  if (from === to) return formatMonthDay(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${formatMonthDay(from)}–${toUtc(to).getUTCDate()}`;
  return `${formatMonthDay(from)}–${formatMonthDay(to)}`;
}

/** "December 2026" */
export function formatMonth(day: Day): string {
  const date = toUtc(day);
  return `${monthLong.format(date)} ${date.getUTCFullYear()}`;
}

/** "Fri Dec 11 – Mon Dec 14", or just "Fri Dec 11" for a one-day booking. */
export function formatDayRange(from: Day, to: Day): string {
  return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}

/** "Dec 5, 3:20 PM" in Pacific time. */
export function formatDateTime(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(instant);
}
