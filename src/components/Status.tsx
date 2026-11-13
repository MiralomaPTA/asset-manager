import type { ItemStatus } from "@/lib/availability";
import { formatDay, formatMonthDay, formatShortRange, type Day } from "@/lib/dates";
import type { LineStatus, RequestStatus } from "@/lib/status";
import { AlertIcon } from "@/components/Icons";

const TONES = {
  ok: "bg-ok-soft text-ok",
  info: "bg-brand-soft text-brand-ink",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  quiet: "bg-rule text-muted",
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ tone, children, dot = true }: { tone: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`pill ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function itemStatusText(status: ItemStatus): { tone: Tone; text: string } {
  switch (status.kind) {
    case "available":
      return { tone: "ok", text: "Available" };
    case "partial":
      return { tone: "info", text: `${status.free} of ${status.total} free today` };
    case "out":
      return { tone: "warn", text: status.backOn ? `Out · back ${formatDay(status.backOn)}` : "Out" };
    case "overdue":
      return { tone: "bad", text: `Overdue since ${formatMonthDay(status.since)}` };
    case "unavailable":
      return { tone: "quiet", text: "Not available" };
  }
}

export function ItemStatusPill({ status }: { status: ItemStatus }) {
  const { tone, text } = itemStatusText(status);
  return <Pill tone={tone}>{text}</Pill>;
}

/** Availability over a chosen range, for the "Free between" filter. */
export function RangePill({ free, total, from, to }: { free: number; total: number; from: Day; to: Day }) {
  const range = formatShortRange(from, to);
  if (free <= 0) return <Pill tone="warn">None free {range}</Pill>;
  return <Pill tone={free >= total ? "ok" : "info"}>{free >= total ? `All ${total} free ${range}` : `${free} of ${total} free ${range}`}</Pill>;
}

export function ProblemBadge() {
  return (
    <span className="pill border border-bad bg-white text-bad">
      <AlertIcon size={12} />
      Problem reported
    </span>
  );
}

const LINE_TONE: Record<LineStatus, Tone> = {
  Pending: "warn",
  Approved: "info",
  Declined: "quiet",
  Cancelled: "quiet",
  Expired: "quiet",
  "Picked up": "info",
  Returned: "ok",
};

const LINE_TEXT: Record<LineStatus, string> = {
  Pending: "Waiting",
  Approved: "Approved",
  Declined: "Declined",
  Cancelled: "Cancelled",
  Expired: "Expired",
  "Picked up": "Out",
  Returned: "Returned",
};

export function LineStatusPill({ status, overdue = false }: { status: LineStatus; overdue?: boolean }) {
  if (overdue) return <Pill tone="bad">Overdue</Pill>;
  return <Pill tone={LINE_TONE[status]}>{LINE_TEXT[status]}</Pill>;
}

const REQUEST_TONE: Record<RequestStatus, Tone> = {
  "Waiting for approval": "warn",
  Approved: "info",
  Out: "info",
  Closed: "quiet",
};

export function RequestStatusPill({ status, overdue = false }: { status: RequestStatus; overdue?: boolean }) {
  if (overdue) return <Pill tone="bad">Overdue</Pill>;
  return <Pill tone={REQUEST_TONE[status]}>{status}</Pill>;
}
