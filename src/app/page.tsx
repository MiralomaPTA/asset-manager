import Image from "next/image";
import Link from "next/link";
import logo from "@/images/miraloma-logo.png";
import { getDeps } from "@/server/adapters";
import { getMe, getSession, type Me } from "@/server/auth/session";
import { config } from "@/server/config";
import { bookings, itemViews, loadCore, todayOf } from "@/server/data";
import { freeOver } from "@/lib/availability";
import { formatDay, isDay } from "@/lib/dates";
import { safeNextPath } from "@/lib/next-path";
import { plural } from "@/lib/names";
import { CalendarIcon, PlusIcon, SearchIcon } from "@/components/Icons";
import { ItemPhoto } from "@/components/ItemPhoto";
import { ItemStatusPill, ProblemBadge, RangePill } from "@/components/Status";
import { SignInForm } from "@/components/SignInForm";

type Query = Awaited<PageProps<"/">["searchParams"]>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function Home(props: PageProps<"/">) {
  const query = await props.searchParams;
  const me = await getMe();
  if (!me) return <SignIn query={query} />;
  return <Catalog me={me} query={query} />;
}

async function SignIn({ query }: { query: Query }) {
  const session = await getSession();
  const next = safeNextPath(query.next) ?? undefined;
  const notice = "notice mb-4 bg-warn-soft text-warn";
  return (
    <div className="mx-auto max-w-md pt-4">
      <Image src={logo} alt="Miraloma Elementary" width={120} height={120} priority className="mx-auto mb-4 h-28 w-28 rounded-full bg-white" />
      <h1 className="h1 mb-2 text-center">Borrow PTA equipment</h1>
      <p className="mb-6 text-center text-body">
        Tables, chairs, coolers, the popcorn machine and more, for school events. Enter your email and we&apos;ll send you a sign-in link. No password
        needed.
      </p>
      {session && (
        <p className={notice}>
          You&apos;re signed in as {session.email}, but that address is no longer approved. Email {config.contactEmail} if that&apos;s a mistake.
        </p>
      )}
      {query.expired === "1" && <p className={notice}>That sign-in link has expired or was already used. Ask for a new one below.</p>}
      {query.unapproved === "1" && <p className={notice}>That address isn&apos;t approved. If it was before, the PTA may have removed it.</p>}
      <div className="card p-5">
        <SignInForm next={next} />
      </div>
      <p className="mt-4 text-center text-sm">
        <Link href="/help">How borrowing works</Link>
      </p>
    </div>
  );
}

function catalogHref(query: Query, change: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const key of ["q", "tag", "loc", "from", "to"]) {
    const value = key in change ? change[key] : one(query[key]);
    if (value) params.set(key, value);
  }
  const s = params.toString();
  return s ? `/?${s}` : "/";
}

async function Catalog({ me, query }: { me: Me; query: Query }) {
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const q = one(query.q).trim().toLowerCase();
  const tag = one(query.tag);
  const loc = one(query.loc);
  let from = one(query.from);
  let to = one(query.to);
  const range = isDay(from) && (isDay(to) || to === "");
  if (range && !isDay(to)) to = from;
  if (range && to < from) [from, to] = [to, from];

  const live = core.items.filter((i) => !i.archived);
  const tags = [...new Set(live.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b));
  const locations = [...new Set(live.map((i) => i.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const all = bookings(core);
  const views = itemViews(core, today)
    .filter(({ item }) => !item.archived)
    .filter(({ item }) => !tag || item.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
    .filter(({ item }) => !loc || item.location.toLowerCase() === loc.toLowerCase())
    .filter(({ item }) => !q || `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes(q))
    .map((v) => ({ ...v, range: range ? freeOver(v.item.quantity, all, v.item.id, from, to, today).free : null }))
    .filter((v) => v.range === null || v.range > 0)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="h1">What the PTA can lend</h1>
        {me.isAdmin && (
          <Link href="/items/new" className="btn-secondary btn-small flex-none">
            <PlusIcon size={16} />
            Add item
          </Link>
        )}
      </div>

      <form action="/" className="flex flex-col gap-2 sm:flex-row">
        {tag && <input type="hidden" name="tag" value={tag} />}
        {loc && <input type="hidden" name="loc" value={loc} />}
        <label className="flex h-12 items-center gap-2 rounded-xl border border-chip sm:flex-1 bg-white px-3.5 text-muted focus-within:border-brand">
          <SearchIcon />
          <span className="sr-only">Search equipment</span>
          <input name="q" type="search" defaultValue={one(query.q)} placeholder="Search tables, coolers…" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none" />
        </label>
        <details className="group relative" open={range || undefined}>
          <summary className="flex h-12 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-chip bg-white px-3.5 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <CalendarIcon />
            {range ? (from === to ? `Free ${formatDay(from)}` : `Free ${formatDay(from)} – ${formatDay(to)}`) : "Free on…"}
          </summary>
          <div className="card mt-2 flex flex-col gap-3 p-3 sm:absolute sm:right-0 sm:z-10 sm:w-72 sm:shadow-lg">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-semibold">
                From
                <input type="date" name="from" defaultValue={range ? from : ""} min={today} className="field mt-1 h-11 px-2" />
              </label>
              <label className="text-sm font-semibold">
                To
                <input type="date" name="to" defaultValue={range ? to : ""} min={today} className="field mt-1 h-11 px-2" />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary btn-small flex-1">
                Show what&apos;s free
              </button>
              {range && (
                <Link href={catalogHref(query, { from: "", to: "" })} className="btn-secondary btn-small">
                  Clear
                </Link>
              )}
            </div>
          </div>
        </details>
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>

      {tags.length > 0 && (
        <div role="group" aria-label="Filter by tag" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={catalogHref(query, { tag: "" })} aria-current={!tag ? "true" : undefined} className={`chip ${!tag ? "chip-on" : ""}`}>
            All
          </Link>
          {tags.map((t) => {
            const on = t.toLowerCase() === tag.toLowerCase();
            return (
              <Link key={t} href={catalogHref(query, { tag: on ? "" : t })} aria-current={on ? "true" : undefined} className={`chip ${on ? "chip-on" : ""}`}>
                {t}
              </Link>
            );
          })}
        </div>
      )}
      {locations.length > 1 && (
        <div role="group" aria-label="Filter by location" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {locations.map((l) => {
            const on = l.toLowerCase() === loc.toLowerCase();
            return (
              <Link key={l} href={catalogHref(query, { loc: on ? "" : l })} aria-current={on ? "true" : undefined} className={`chip h-9 text-[13px] ${on ? "chip-on" : ""}`}>
                {l}
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-[13px] text-muted">
        {plural(views.length, "item")} · {range ? `free ${from === to ? `on ${formatDay(from)}` : `every day ${formatDay(from)} – ${formatDay(to)}`}` : `status as of today, ${formatDay(today)}`}
      </p>

      {views.length === 0 ? (
        <div className="card p-6 text-center text-body">
          {live.length === 0 ? "No equipment has been added yet." : "Nothing matches. Try another search, tag or date."}
          {(q || tag || loc || range) && (
            <p className="mt-2">
              <Link href="/">Show everything</Link>
            </p>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {views.map(({ item, status, problem, range: free }) => (
            <li key={item.id}>
              <Link href={`/items/${item.id}`} className="card flex h-full flex-col overflow-hidden text-ink no-underline hover:border-field hover:text-ink">
                <ItemPhoto id={item.thumb_id} name={item.name} className="aspect-[4/3] w-full" />
                <div className="flex flex-1 flex-col items-start gap-1.5 px-3 pt-2.5 pb-3">
                  <span className="text-[15px] leading-tight font-bold">{item.name}</span>
                  <span className="text-xs text-muted">
                    {item.location || "Location not set"} · ×{item.quantity}
                  </span>
                  {free === null ? <ItemStatusPill status={status} /> : <RangePill free={free} total={item.quantity} from={from} to={to} />}
                  {problem && <ProblemBadge />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
