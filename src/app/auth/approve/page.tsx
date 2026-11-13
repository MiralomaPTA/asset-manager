import { getDeps } from "@/server/adapters";
import { approvalLinkIsStale } from "@/server/auth/access";
import { verifyApprovalToken } from "@/server/auth/tokens";
import { loadCore } from "@/server/data";
import { findUser } from "@/server/users";
import { formatDateTime } from "@/lib/dates";

/** Opened from the access-request email. A tap, not the GET, applies the decision. */
export default async function ApprovePage(props: PageProps<"/auth/approve">) {
  const query = await props.searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const verified = token ? await verifyApprovalToken(token) : null;
  if (!verified) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <h1 className="h1">This approval link isn&apos;t valid</h1>
        <p className="text-body">
          It may have expired (links work for 7 days) or been copied incompletely. Pending requests are also listed on the Admin page.
        </p>
      </div>
    );
  }
  const { users } = await loadCore(await getDeps());
  const user = findUser(users, verified.email);
  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <h1 className="h1">No one to approve</h1>
        <p className="text-body">{verified.email} is no longer in the Users tab.</p>
      </div>
    );
  }
  if (approvalLinkIsStale(verified.issuedAt, user)) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <h1 className="h1">Already decided</h1>
        <p className="text-body">
          <strong>{user.name || user.email}</strong> was {user.status === "denied" ? "denied" : "approved"}
          {user.decided_by && user.decided_by !== "approval email link" ? ` by ${user.decided_by}` : ""} on {formatDateTime(new Date(user.decided_at))}. To change
          that, use the Admin page or the Users tab.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="h1">Approve {user.name || user.email}?</h1>
      <dl className="card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-[15px]">
        <dt className="text-muted">Email</dt>
        <dd className="font-semibold break-all">{user.email}</dd>
        <dt className="text-muted">Phone</dt>
        <dd className="font-semibold">{user.phone || "not given"}</dd>
        <dt className="text-muted">Connection</dt>
        <dd className="font-semibold">{user.connection || "not given"}</dd>
        <dt className="text-muted">Asked</dt>
        <dd className="font-semibold">{user.requested_at ? formatDateTime(new Date(user.requested_at)) : "unknown"}</dd>
      </dl>
      <p className="hint">Approving lets them browse the catalog and request equipment. Each request still goes to the item&apos;s owner.</p>
      <form action="/api/auth/approve" method="post" className="flex flex-wrap gap-3">
        <input type="hidden" name="token" value={token} />
        <button type="submit" name="decision" value="approve" className="btn-primary flex-1">
          Approve
        </button>
        <button type="submit" name="decision" value="deny" className="btn-secondary flex-1">
          Deny
        </button>
      </form>
    </div>
  );
}
