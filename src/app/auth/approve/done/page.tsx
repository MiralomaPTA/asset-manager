const OUTCOMES = ["approved", "denied", "unchanged", "already-decided", "unknown"] as const;
type Outcome = (typeof OUTCOMES)[number];

const TITLES: Record<Outcome, string> = {
  approved: "Approved",
  denied: "Denied",
  unchanged: "Already approved",
  "already-decided": "Already decided",
  unknown: "Not found",
};

export default async function ApproveDonePage(props: PageProps<"/auth/approve/done">) {
  const query = await props.searchParams;
  const email = typeof query.email === "string" ? query.email : "that address";
  const outcome: Outcome = OUTCOMES.find((o) => o === query.outcome) ?? "already-decided";
  const by = typeof query.by === "string" && query.by !== "approval email link" ? ` by ${query.by}` : "";
  const messages: Record<Outcome, string> = {
    approved: `${email} can now borrow equipment. We emailed them a sign-in link.`,
    denied: `${email} won't be able to sign in. They weren't told. You can change this on the Admin page.`,
    unchanged: `${email} was already approved, so nothing was sent.`,
    "already-decided": `Another admin already decided about ${email}${by}, so nothing changed. To change it, use the Admin page.`,
    unknown: `${email} isn't in the Users tab any more.`,
  };
  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="h1">{TITLES[outcome]}</h1>
      <p className="text-body">{messages[outcome]}</p>
    </div>
  );
}
