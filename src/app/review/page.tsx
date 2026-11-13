import Link from "next/link";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { canDecide, deciderOf, lineQty, linesToDecide, loadCore, openProblem, todayOf, type Core } from "@/server/data";
import type { LineRow, RequestRow } from "@/server/db/schema";
import { canManageItem, shortNameOf } from "@/server/users";
import { addDays, daysBetween, dayOf, formatDay, formatDayRange, formatMonthDay } from "@/lib/dates";
import { plural } from "@/lib/names";
import { AlertIcon } from "@/components/Icons";
import { Pill } from "@/components/Status";

interface Group {
  request: RequestRow;
  lines: LineRow[];
}

function groupByRequest(core: Core, lines: LineRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const line of lines) {
    const request = core.requests.find((r) => r.id === line.request_id);
    if (!request) continue;
    if (!map.has(request.id)) map.set(request.id, { request, lines: [] });
    map.get(request.id)!.lines.push(line);
  }
  return [...map.values()];
}

const summary = (lines: LineRow[]) => lines.map((l) => (lineQty(l) > 1 ? `${l.item_name} × ${lineQty(l)}` : l.item_name)).join(", ");

/** An owner's or admin's to-do list: lines to decide, what is out or overdue, problems to clear. */
export default async function ReviewPage() {
  const me = await requireMe("/review");
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const requests = new Map(core.requests.map((r) => [r.id, r]));

  const toDecide = groupByRequest(core, linesToDecide(core, me.user)).sort((a, b) => a.request.created_at.localeCompare(b.request.created_at));
  const othersPending = me.isAdmin
    ? groupByRequest(
        core,
        core.lines.filter((l) => l.status === "Pending" && !linesToDecide(core, me.user).includes(l)),
      )
    : [];
  const managed = core.lines.filter((l) => canDecide(core, me.user, l));
  const outLines = managed.filter((l) => {
    const r = requests.get(l.request_id);
    return r && (l.status === "Picked up" || (l.status === "Approved" && r.return_date < today));
  });
  const out = groupByRequest(core, outLines).sort((a, b) => a.request.return_date.localeCompare(b.request.return_date));
  const soon = groupByRequest(
    core,
    managed.filter((l) => {
      const r = requests.get(l.request_id);
      return r && l.status === "Approved" && r.return_date >= today && r.pickup_date <= addDays(today, 14);
    }),
  ).sort((a, b) => a.request.pickup_date.localeCompare(b.request.pickup_date));
  const problems = core.items
    .filter((i) => canManageItem(me.user, i, core.users))
    .map((item) => ({ item, line: openProblem(core, item.id) }))
    .filter((p): p is { item: (typeof core.items)[number]; line: LineRow } => !!p.line);

  const card = (g: Group, detail: React.ReactNode, pill?: React.ReactNode) => (
    <li key={g.request.id}>
      <Link href={`/review/${g.request.id}`} className="card flex flex-col gap-1 p-4 text-ink no-underline hover:border-field hover:text-ink">
        <span className="flex items-start justify-between gap-2">
          <span className="text-[16px] font-bold">{g.request.event_name}</span>
          {pill}
        </span>
        <span className="text-sm text-body">
          {shortNameOf(core.users, g.request.borrower_email)} · {formatDayRange(g.request.pickup_date, g.request.return_date)}
        </span>
        <span className="text-[13px] text-muted">{detail}</span>
      </Link>
    </li>
  );

  const nothing = toDecide.length + out.length + problems.length + soon.length + othersPending.length === 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="h1">Review</h1>
      {nothing && <div className="card p-6 text-body">Nothing to do. New requests for your items will show here, and you&apos;ll get an email for each.</div>}

      {toDecide.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">To decide ({toDecide.length})</h2>
          <ul className="flex flex-col gap-2.5">
            {toDecide.map((g) => {
              const age = daysBetween(dayOf(new Date(g.request.created_at)), today);
              const late = g.request.pickup_date <= addDays(today, 1);
              return card(
                g,
                summary(g.lines),
                <Pill tone={late ? "bad" : age >= 2 ? "warn" : "info"}>{late ? `Pickup ${g.request.pickup_date <= today ? "today" : "tomorrow"}` : age === 0 ? "New today" : `Sent ${plural(age, "day")} ago`}</Pill>,
              );
            })}
          </ul>
        </section>
      )}

      {problems.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Problems to clear</h2>
          <ul className="flex flex-col gap-2.5">
            {problems.map(({ item, line }) => (
              <li key={item.id}>
                <Link href={`/items/${item.id}#problem`} className="flex flex-col gap-1 rounded-[14px] border-2 border-bad bg-bad-faint p-4 text-ink no-underline hover:text-ink">
                  <span className="flex items-center gap-2 font-bold text-bad">
                    <AlertIcon size={16} />
                    {item.name}
                  </span>
                  <span className="text-sm text-body">
                    {line.missing_parts.length > 0 ? `Missing: ${line.missing_parts.join(", ")}. ` : ""}
                    {line.return_notes}
                  </span>
                  <span className="text-[13px] text-muted">
                    Reported {formatMonthDay(line.returned_on)} by {shortNameOf(core.users, requests.get(line.request_id)?.borrower_email ?? line.returned_by)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {out.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Out now</h2>
          <ul className="flex flex-col gap-2.5">
            {out.map((g) => {
              const overdue = g.request.return_date < today;
              return card(g, summary(g.lines), overdue ? <Pill tone="bad">Overdue since {formatMonthDay(addDays(g.request.return_date, 1))}</Pill> : <Pill tone="info">Back {formatDay(g.request.return_date)}</Pill>);
            })}
          </ul>
        </section>
      )}

      {soon.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Pickups in the next two weeks</h2>
          <ul className="flex flex-col gap-2.5">{soon.map((g) => card(g, summary(g.lines), <Pill tone="ok">Approved</Pill>))}</ul>
        </section>
      )}

      {othersPending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">Waiting on other owners</h2>
          <p className="hint -mt-1">As an admin you can decide these too.</p>
          <ul className="flex flex-col gap-2.5">
            {othersPending.map((g) =>
              card(
                g,
                `${summary(g.lines)} · ${[...new Set(g.lines.map((l) => (deciderOf(core, l) ? shortNameOf(core.users, deciderOf(core, l)!.email) : "admins")))].join(", ")} to decide`,
                <Pill tone="warn">Waiting</Pill>,
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
