/**
 * How people are shown. The catalog, calendar and condition history are seen
 * by every approved user, so there a borrower is a first name and last
 * initial: "Jordan R.". Full names, emails and phones are only shown to the
 * owners of the items requested and to admins.
 */

/** "Jordan Rivera" → "Jordan R."; one word stays as is; no name falls back to the email's local part. */
export function shortName(name: string, email = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return email.split("@")[0] ?? "";
  if (words.length === 1) return words[0];
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
}

export function firstName(name: string, email = ""): string {
  return name.trim().split(/\s+/)[0] || email.split("@")[0] || "there";
}

/** "6 tables, 30 chairs" style summary: "Folding table × 6, Folding chair × 30". */
export function itemSummary(lines: { name: string; qty: number }[]): string {
  return lines.map((l) => (l.qty === 1 ? l.name : `${l.name} × ${l.qty}`)).join(", ");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
