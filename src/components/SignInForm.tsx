"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export const CONNECTIONS = ["Parent or guardian", "Staff", "Volunteer", "Other"] as const;

/**
 * Step one asks only for an email. An approved address gets a link; an
 * unknown one is asked who they are, so the admins can recognize them.
 */
export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "details">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [connection, setConnection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: object): Promise<string> {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
    return data.status as string;
  }

  function go(status: string) {
    if (status === "unknown") {
      setStep("details");
      setBusy(false);
      return;
    }
    router.push(`${status === "sent" ? "/auth/sent" : "/auth/pending"}?email=${encodeURIComponent(email)}`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      go(step === "email" ? await post("/api/auth/request-link", { email, next }) : await post("/api/auth/request-access", { email, name, phone, connection, next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Your email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="field"
          value={email}
          readOnly={step === "details"}
          onChange={(e) => setEmail(e.target.value)}
        />
        {step === "details" && (
          <button type="button" className="mt-1 cursor-pointer text-sm text-brand hover:underline" onClick={() => setStep("email")}>
            Use a different email
          </button>
        )}
      </div>

      {step === "details" && (
        <>
          <p className="notice bg-brand-soft text-brand-ink">
            This email isn&apos;t on the list yet. Tell us who you are and the PTA will approve it, usually within a day.
          </p>
          <div>
            <label htmlFor="name" className="label">
              Your name
            </label>
            <input id="name" autoComplete="name" required maxLength={80} className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="phone" className="label">
              Mobile phone
            </label>
            <input id="phone" type="tel" autoComplete="tel" required maxLength={30} className="field" value={phone} onChange={(e) => setPhone(e.target.value)} aria-describedby="phone_hint" />
            <p id="phone_hint" className="hint mt-1">
              So an item&apos;s owner can text you about pickup.
            </p>
          </div>
          <fieldset>
            <legend className="label">How you&apos;re connected to the school</legend>
            <div className="grid grid-cols-2 gap-2">
              {CONNECTIONS.map((c) => (
                <label key={c} className="flex min-h-12 items-center gap-2.5 rounded-xl border border-field bg-white px-3 text-[15px] font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="radio" name="connection" value={c} required checked={connection === c} onChange={() => setConnection(c)} />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-bad">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Sending…" : step === "email" ? "Email me a sign-in link" : "Ask for access"}
      </button>
    </form>
  );
}
