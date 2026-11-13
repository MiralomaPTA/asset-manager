import { config } from "@/server/config";

export default async function PendingPage(props: PageProps<"/auth/pending">) {
  const query = await props.searchParams;
  const email = typeof query.email === "string" ? query.email : "your address";
  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="h1">Waiting for approval</h1>
      <p className="text-body">
        We&apos;ve asked the PTA to approve <strong>{email}</strong>. Once they do, you&apos;ll get an email with your sign-in link. There&apos;s
        nothing else to do right now.
      </p>
      <p className="hint">
        Asked a while ago and still waiting? Email <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
      </p>
    </div>
  );
}
