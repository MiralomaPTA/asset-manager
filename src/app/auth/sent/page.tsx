import { config } from "@/server/config";

export default async function SentPage(props: PageProps<"/auth/sent">) {
  const query = await props.searchParams;
  const email = typeof query.email === "string" ? query.email : "your address";
  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="h1">Check your email</h1>
      <p className="text-body">
        We sent a sign-in link to <strong>{email}</strong>. Open it on this phone or computer to continue. It works for {config.magicLinkMinutes} minutes.
      </p>
      <p className="hint">Not there? Check spam, or go back and try again in a minute.</p>
    </div>
  );
}
