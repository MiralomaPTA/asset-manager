import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { canDecide, deciderOf, lineQty, linesOf, loadCore, todayOf } from "@/server/data";
import { earliestReturn } from "@/server/domain/requests";
import { shortNameOf } from "@/server/users";
import { byPlace } from "@/server/views";
import { BackIcon } from "@/components/Icons";
import { ReturnForm, type ReturnLine } from "@/components/ReturnForm";

/**
 * Marking items returned: the borrower, from their request page, or an
 * item's owner or an admin doing it for a borrower who forgot (`back=review`).
 */
export default async function ReturnPage(props: PageProps<"/requests/[id]/return">) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const me = await requireMe(`/requests/${id}/return`);
  const deps = await getDeps();
  const core = await loadCore(deps);
  const today = todayOf(deps);
  const request = core.requests.find((r) => r.id === id);
  if (!request) notFound();
  const isBorrower = request.borrower_email === me.email;
  const wanted = typeof query.lines === "string" ? query.lines.split(",") : null;
  const lines = linesOf(core, request.id)
    .filter((l) => l.status === "Picked up" || (l.status === "Approved" && (request.pickup_date <= today || !isBorrower)))
    .filter((l) => isBorrower || canDecide(core, me.user, l))
    .filter((l) => !wanted || wanted.includes(l.id));
  const back = isBorrower ? "request" : "review";
  const backHref = isBorrower ? `/requests/${request.id}` : `/review/${request.id}`;

  if (lines.length === 0) {
    if (!isBorrower && !me.isAdmin && !linesOf(core, request.id).some((l) => canDecide(core, me.user, l))) notFound();
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3">
        <h1 className="h1">Nothing to return</h1>
        <p className="text-body">Everything on this request is already returned, or hasn&apos;t been picked up yet.</p>
        <Link href={backHref}>Back to the request</Link>
      </div>
    );
  }

  const returnLines: ReturnLine[] = lines.map((l) => {
    const owner = deciderOf(core, l);
    return {
      id: l.id,
      name: l.item_name,
      qty: lineQty(l),
      contents: core.items.find((i) => i.id === l.item_id)?.contents ?? [],
      ownerName: owner ? shortNameOf(core.users, owner.email) : "The PTA admins",
    };
  });
  const instructions = byPlace(core, lines)
    .filter((g) => g.location?.return_instructions)
    .map((g) => ({ place: g.name, text: g.location!.return_instructions }));
  const earliest = lines.map((l) => earliestReturn(request, l)).reduce((a, b) => (a > b ? a : b));
  const title = lines.length === 1 ? `Return the ${lines[0].item_name.charAt(0).toLowerCase()}${lines[0].item_name.slice(1)}` : `Return ${lines.length} items`;
  const place = byPlace(core, lines);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link href={backHref} className="-mb-2 inline-flex h-11 items-center gap-1 self-start text-[15px] font-semibold no-underline">
        <BackIcon />
        {request.event_name}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="h1">{title}</h1>
        <p className="text-sm text-muted">
          {lines.length === 1 ? `× ${lineQty(lines[0])} · ${place[0]?.name} · owner ${returnLines[0].ownerName}` : `${request.id} · ${place.map((p) => p.name).join(", ")}`}
          {!isBorrower && ` · for ${shortNameOf(core.users, request.borrower_email)}`}
        </p>
      </div>
      <ReturnForm requestId={request.id} lines={returnLines} instructions={instructions} today={today} earliest={earliest > today ? today : earliest} back={back} />
    </div>
  );
}
