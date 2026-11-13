import Link from "next/link";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { isRequestOverdue, linesOf, loadCore, requestStatusOf, todayOf } from "@/server/data";
import { linesSummary } from "@/server/views";
import { formatDayRange } from "@/lib/dates";
import { RequestStatusPill } from "@/components/Status";

export default async function MyRequestsPage() {
  const me = await requireMe("/requests");
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const mine = core.requests
    .filter((r) => r.borrower_email === me.email)
    .map((r) => ({ request: r, status: requestStatusOf(core, r.id), lines: linesOf(core, r.id), overdue: isRequestOverdue(core, r, today) }));
  const open = mine.filter((m) => m.status !== "Closed").sort((a, b) => a.request.pickup_date.localeCompare(b.request.pickup_date));
  const closed = mine.filter((m) => m.status === "Closed").sort((a, b) => b.request.pickup_date.localeCompare(a.request.pickup_date));

  const card = (m: (typeof mine)[number]) => {
    const shown = m.lines.filter((l) => l.status !== "Cancelled" && l.status !== "Expired" && l.status !== "Declined");
    return (
      <li key={m.request.id}>
        <Link href={`/requests/${m.request.id}`} className="card flex flex-col gap-1.5 p-4 text-ink no-underline hover:border-field hover:text-ink">
          <span className="flex items-start justify-between gap-2">
            <span className="text-[17px] font-bold">{m.request.event_name}</span>
            <RequestStatusPill status={m.status} overdue={m.overdue} />
          </span>
          <span className="text-sm text-body">
            {formatDayRange(m.request.pickup_date, m.request.return_date)} · {m.request.id}
          </span>
          <span className="text-[13px] text-muted">{linesSummary(shown.length > 0 ? shown : m.lines)}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="h1">My requests</h1>
      {mine.length === 0 && (
        <div className="card p-6 text-body">
          You haven&apos;t asked to borrow anything yet. <Link href="/">Browse the catalog</Link>.
        </div>
      )}
      {open.length > 0 && <ul className="flex flex-col gap-2.5">{open.map(card)}</ul>}
      {closed.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="h2 mt-2">Past</h2>
          <ul className="flex flex-col gap-2.5">{closed.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
