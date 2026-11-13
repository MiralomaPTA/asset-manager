/**
 * Emails are written once as a list of blocks and rendered twice: as plain
 * text, which every client shows, and as simple HTML with inline styles, which
 * most do. Every piece of text is escaped, since event names, notes and item
 * names come from users.
 */

export type Inline = string | { bold: string } | { link: string; href: string };

export interface ItemRow {
  title: string;
  /** "× 6" */
  qty?: string;
  /** A second line: "20 of the 30 you asked for", "In the box: kettle, scoop". */
  detail?: string;
  /** Draws attention to the detail, e.g. fewer approved than asked. */
  warn?: boolean;
  mark?: "ok" | "no";
}

export type Block =
  | { kind: "p"; parts: Inline[] }
  | { kind: "h"; text: string }
  | { kind: "items"; rows: ItemRow[] }
  /** Shaded instructions, e.g. "Pickup: side door by the auditorium…" */
  | { kind: "box"; label: string; text: string }
  /** Bordered note from a person, e.g. "Note from Dana L." */
  | { kind: "note"; label: string; text: string }
  | { kind: "button"; label: string; href: string }
  | { kind: "fine"; text: string };

export interface Email {
  subject: string;
  blocks: Block[];
}

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

export const p = (...parts: Inline[]): Block => ({ kind: "p", parts });
export const h = (text: string): Block => ({ kind: "h", text });
export const items = (rows: ItemRow[]): Block => ({ kind: "items", rows });
export const box = (label: string, text: string): Block => ({ kind: "box", label, text });
export const note = (label: string, text: string): Block => ({ kind: "note", label, text });
export const button = (label: string, href: string): Block => ({ kind: "button", label, href });
export const fine = (text: string): Block => ({ kind: "fine", text });
export const b = (bold: string): Inline => ({ bold });

function inlineText(parts: Inline[]): string {
  return parts.map((part) => (typeof part === "string" ? part : "bold" in part ? part.bold : `${part.link} (${part.href})`)).join("");
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
      return inlineText(block.parts);
    case "h":
      return `${block.text}\n${"-".repeat(Math.min(block.text.length, 60))}`;
    case "items":
      return block.rows
        .map((r) => {
          const mark = r.mark === "no" ? "✗ " : "";
          const first = `- ${mark}${r.title}${r.qty ? ` ${r.qty}` : ""}`;
          return r.detail ? `${first}\n  ${r.detail}` : first;
        })
        .join("\n");
    case "box":
    case "note":
      return `${block.label}: ${block.text}`;
    case "button":
      return `${block.label}:\n${block.href}`;
    case "fine":
      return block.text;
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>");

const C = {
  ink: "#1B1D21",
  muted: "#5B606B",
  body: "#3A3F48",
  line: "#EEEDE8",
  border: "#E2E1DC",
  shade: "#F6F5F1",
  blue: "#1F5FBF",
  green: "#116149",
  amber: "#8A4A00",
  red: "#A12A1E",
};

function inlineHtml(parts: Inline[]): string {
  return parts
    .map((part) => {
      if (typeof part === "string") return multiline(part);
      if ("bold" in part) return `<strong>${multiline(part.bold)}</strong>`;
      return `<a href="${escapeHtml(part.href)}" style="color:${C.blue}">${escapeHtml(part.link)}</a>`;
    })
    .join("");
}

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "p":
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${C.ink}">${inlineHtml(block.parts)}</p>`;
    case "h":
      return `<h2 style="margin:8px 0 10px;font-size:17px;font-weight:800;color:${C.ink}">${escapeHtml(block.text)}</h2>`;
    case "items":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse">${block.rows
        .map((r, i) => {
          const border = i < block.rows.length - 1 ? `border-bottom:1px solid ${C.line};` : "";
          const mark = r.mark === "ok" ? `<span style="color:${C.green};font-weight:800">✓</span>` : r.mark === "no" ? `<span style="color:${C.red};font-weight:800">✗</span>` : "";
          const detail = r.detail ? `<br><span style="font-size:13px;font-weight:600;color:${r.warn ? C.amber : C.muted}">${multiline(r.detail)}</span>` : "";
          return `<tr><td style="${border}padding:9px 8px 9px 0;width:18px;vertical-align:top">${mark}</td><td style="${border}padding:9px 0;font-size:15px;font-weight:600;color:${C.ink}">${escapeHtml(r.title)}${detail}</td><td style="${border}padding:9px 0;text-align:right;vertical-align:top;font-size:15px;font-weight:700;white-space:nowrap">${escapeHtml(r.qty ?? "")}</td></tr>`;
        })
        .join("")}</table>`;
    case "box":
      return `<div style="margin:0 0 16px;padding:10px 12px;border-radius:10px;background:${C.shade};font-size:14px;line-height:1.45;color:${C.body}"><strong style="color:${C.ink}">${escapeHtml(block.label)}:</strong> ${multiline(block.text)}</div>`;
    case "note":
      return `<div style="margin:0 0 16px;padding:10px 12px;border-radius:10px;border:1px solid ${C.border};font-size:14px;line-height:1.45;color:${C.ink}"><div style="font-size:12px;font-weight:700;color:${C.muted};text-transform:uppercase;margin-bottom:2px">${escapeHtml(block.label)}</div>${multiline(block.text)}</div>`;
    case "button":
      return `<p style="margin:8px 0 20px"><a href="${escapeHtml(block.href)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:${C.blue};color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none">${escapeHtml(block.label)}</a></p>`;
    case "fine":
      return `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${C.muted}">${multiline(block.text)}</p>`;
  }
}

export function render(email: Email, footer: string): Rendered {
  const text = [...email.blocks.map(blockText), footer].join("\n\n") + "\n";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${C.shade}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.shade}"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${C.border};border-radius:14px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="background:${C.blue};color:#FFFFFF;padding:14px 18px;font-size:15px;font-weight:800;border-radius:14px 14px 0 0">PTA Equipment</td></tr>
<tr><td style="padding:18px 18px 4px">${email.blocks.map(blockHtml).join("\n")}</td></tr>
</table>
<p style="max-width:560px;margin:12px auto 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${C.muted}">${multiline(footer)}</p>
</td></tr></table></body></html>`;
  return { subject: email.subject, text, html };
}
