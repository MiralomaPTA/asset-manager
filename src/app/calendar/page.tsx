import Link from "next/link";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { bookings, canDecide, loadCore, todayOf, type Core } from "@/server/data";
import type { RequestRow } from "@/server/db/schema";
import { shortNameOf } from "@/server/users";
import { addDays, eachDay, formatDay, formatDayLong, formatMonthDay, isDay, isWeekend, startOfWeek, type Day } from "@/lib/dates";
import { isOverdue, type Booking } from "@/lib/availability";
import { BackIcon, NextIcon } from "@/components/Icons";

type Query = Awaited<PageProps<"/calendar">["searchParams"]>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

interface Row {
  request: RequestRow;
  bookings: Booking[];
  label: string;
  pending: boolean;
  overdue: boolean;
  /** Last day drawn: the return date, or today for an overdue booking. */
  end: Day;
  href: string | null;
}

function rowsFor(core: Core, all: Booking[], today: Day, viewer: Parameters<typeof canDecide>[1], viewerEmail: string): Row[] {
  const byRequest = new Map<string, Booking[]>();
  for (const b of all) byRequest.set(b.requestId, [...(byRequest.get(b.requestId) ?? []), b]);
  const items = new Map(core.items.map((i) => [i.id, i]));
  const rows: Row[] = [];
  for (const [id, list] of byRequest) {
    const request = core.requests.find((r) => r.id === id);
    if (!request) continue;
    const overdue = list.some((b) => isOverdue(b, today));
    const summary = list.map((b) => `${items.get(b.itemId)?.name ?? "Item"}${b.qty > 1 ? ` × ${b.qty}` : ""}`).join(", ");
    const lines = core.lines.filter((l) => l.request_id === id);
    const href = request.borrower_email === viewerEmail ? `/requests/${id}` : lines.some((l) => canDecide(core, viewer, l)) ? `/review/${id}` : null;
    rows.push({
      request,
      bookings: list,
      label: `${request.event_name} · ${shortNameOf(core.users, request.borrower_email)} · ${summary}`,
      pending: list.every((b) => b.status === "Pending"),
      overdue,
      end: overdue && today > request.return_date ? today : request.return_date,
      href,
    });
  }
  return rows.sort((a, b) => a.request.pickup_date.localeCompare(b.request.pickup_date) || a.request.id.localeCompare(b.request.id));
}

function Timeline({ rows, start, days, today }: { rows: Row[]; start: Day; days: number; today: Day }) {
  const end = addDays(start, days - 1);
  const range = eachDay(start, end);
  const visible = rows.filter((r) => r.request.pickup_date <= end && r.end >= start);
  const cols = { gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` };
  const col = (day: Day) => range.indexOf(day < start ? start : day > end ? end : day) + 1;
  return (
    <div className="card overflow-hidden">
      <div className="grid border-b border-line" style={cols}>
        {range.map((d) => (
          <div key={d} className={`flex flex-col items-center py-1.5 text-[11px] ${isWeekend(d) ? "bg-page" : ""}`}>
            <span className="text-muted">{formatDay(d).slice(0, 2)}</span>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${d === today ? "bg-brand text-white" : ""}`}>{Number(d.slice(8))}</span>
          </div>
        ))}
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 grid" style={cols} aria-hidden="true">
          {range.map((d) => (
            <div key={d} className={`${isWeekend(d) ? "bg-page" : ""} ${d === today ? "border-x-2 border-brand/30" : ""}`} />
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="relative px-4 py-8 text-center text-sm text-muted">No bookings in these {days} days.</p>
        ) : (
          <ul className="relative flex flex-col gap-1.5 py-2">
            {visible.map((row) => {
              const from = col(row.request.pickup_date);
              const to = col(row.request.return_date < start ? start : row.request.return_date);
              const lateFrom = row.overdue ? col(addDays(row.request.return_date, 1)) : 0;
              const lateTo = row.overdue ? col(today) : 0;
              const showMain = row.request.return_date >= start;
              // A booking starting late in the window gets its label ending at the bar, so it isn't cut to "R…".
              const nearEnd = from > days * 0.6;
              const bar = `h-3 rounded-full ${row.pending ? "hatch ring-1 ring-[#e3b878]" : "bg-brand"}`;
              const body = (
                <>
                  <span
                    className={`block truncate px-1 text-[12px] leading-tight font-semibold text-ink ${nearEnd ? "text-right" : ""}`}
                    style={{ gridColumn: nearEnd ? `1 / ${Math.max(to, lateTo) + 1}` : `${from} / ${days + 1}` }}
                  >
                    {row.pending && <span className="font-bold text-warn">Pending · </span>}
                    {row.overdue && <span className="font-bold text-bad">Overdue · </span>}
                    {row.label}
                  </span>
                  {showMain && <span className={bar} style={{ gridColumn: `${from} / ${to + 1}`, gridRow: 2 }} />}
                  {row.overdue && lateTo >= lateFrom && <span className="h-3 rounded-full bg-bad" style={{ gridColumn: `${lateFrom} / ${lateTo + 1}`, gridRow: 2 }} />}
                </>
              );
              return (
                <li key={row.request.id}>
                  {row.href ? (
                    <Link href={row.href} className="grid gap-y-1 px-0.5 no-underline" style={cols} title={row.label}>
                      {body}
                    </Link>
                  ) : (
                    <div className="grid gap-y-1 px-0.5" style={cols} title={row.label}>
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const query: Query = await props.searchParams;
  const me = await requireMe("/calendar");
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const start = isDay(one(query.start)) ? startOfWeek(one(query.start)) : startOfWeek(today);
  const tag = one(query.tag);
  const itemId = one(query.item);
  const loc = one(query.loc);

  const items = core.items.filter((i) => (!tag || i.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) && (!itemId || i.id === itemId) && (!loc || i.location.toLowerCase() === loc.toLowerCase()));
  const wanted = new Set(items.map((i) => i.id));
  const all = bookings(core).filter((b) => wanted.has(b.itemId));
  const rows = rowsFor(core, all, today, me.user, me.email);

  const live = core.items.filter((i) => !i.archived);
  const tags = [...new Set(live.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b));
  const locations = [...new Set(live.map((i) => i.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const href = (change: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const key of ["start", "tag", "item", "loc"]) {
      const value = key in change ? change[key] : one(query[key]);
      if (value) params.set(key, value);
    }
    const s = params.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };

  // This week's pickups and returns, from today.
  const week = eachDay(today, addDays(today, 6)).map((day) => {
    const pickups = rows.filter((r) => r.request.pickup_date === day);
    const returns = rows.filter((r) => r.request.return_date === day && r.bookings.some((b) => b.status !== "Pending"));
    return { day, pickups, returns };
  });
  const anyThisWeek = week.some((w) => w.pickups.length + w.returns.length > 0);
  const filterItem = core.items.find((i) => i.id === itemId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-2">
        <h1 className="h1">Calendar</h1>
        <div className="flex items-center gap-1">
          <Link href={href({ start: addDays(start, -14) })} aria-label="Two weeks earlier" className="btn-secondary btn-small w-11 px-0">
            <BackIcon />
          </Link>
          <Link href={href({ start: "" })} className="btn-secondary btn-small">
            Today
          </Link>
          <Link href={href({ start: addDays(start, 14) })} aria-label="Two weeks later" className="btn-secondary btn-small w-11 px-0">
            <NextIcon />
          </Link>
        </div>
      </div>

      <form action="/calendar" className="flex flex-wrap gap-2">
        {one(query.start) && <input type="hidden" name="start" value={one(query.start)} />}
        <label className="flex-1">
          <span className="sr-only">Tag</span>
          <select name="tag" defaultValue={tag} className="field h-11 min-w-32 text-[15px]">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="sr-only">Location</span>
          <select name="loc" defaultValue={loc} className="field h-11 min-w-32 text-[15px]">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="w-full sm:w-auto sm:flex-1">
          <span className="sr-only">Item</span>
          <select name="item" defaultValue={itemId} className="field h-11 text-[15px]">
            <option value="">All items</option>
            {live.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-secondary btn-small h-11">
          Filter
        </button>
      </form>
      {(tag || loc || itemId) && (
        <p className="-mt-2 text-sm text-body">
          Showing {filterItem ? filterItem.name : [tag, loc].filter(Boolean).join(" · ")} only. <Link href={href({ tag: "", loc: "", item: "" })}>Show everything</Link>
        </p>
      )}

      <p className="text-sm font-semibold text-body">
        <span className="sm:hidden">
          {formatMonthDay(start)} – {formatMonthDay(addDays(start, 13))}
        </span>
        <span className="hidden sm:inline">
          {formatMonthDay(start)} – {formatMonthDay(addDays(start, 27))}
        </span>
      </p>
      <div className="sm:hidden">
        <Timeline rows={rows} start={start} days={14} today={today} />
      </div>
      <div className="hidden sm:block">
        <Timeline rows={rows} start={start} days={28} today={today} />
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-body" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-full bg-brand" /> Approved or out
        </li>
        <li className="flex items-center gap-1.5">
          <span className="hatch h-3 w-6 rounded-full ring-1 ring-[#e3b878]" /> Pending
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-full bg-bad" /> Overdue
        </li>
      </ul>

      <section className="mt-2 flex flex-col gap-2">
        <h2 className="h2">Pickups and returns this week</h2>
        {!anyThisWeek ? (
          <p className="hint">None in the next seven days.</p>
        ) : (
          <ul className="card divide-y divide-rule">
            {week
              .filter((w) => w.pickups.length + w.returns.length > 0)
              .map((w) => (
                <li key={w.day} className="flex flex-col gap-1 p-3.5">
                  <span className="text-[15px] font-bold">{w.day === today ? `Today, ${formatDayLong(w.day)}` : formatDayLong(w.day)}</span>
                  {w.pickups.map((r) => (
                    <span key={`p${r.request.id}`} className="text-sm text-body">
                      <strong className={r.pending ? "text-warn" : "text-ok"}>{r.pending ? "Pickup, pending:" : "Pickup:"}</strong> {r.label}
                    </span>
                  ))}
                  {w.returns.map((r) => (
                    <span key={`r${r.request.id}`} className="text-sm text-body">
                      <strong className="text-brand-ink">Return:</strong> {r.label}
                    </span>
                  ))}
                </li>
              ))}
          </ul>
        )}
      </section>
      <p className="hint">Everyone signed in sees the calendar, with borrowers shown by first name and last initial.</p>
    </div>
  );
}
