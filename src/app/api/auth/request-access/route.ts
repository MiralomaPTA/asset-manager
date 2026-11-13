import { z } from "zod";
import { getDeps } from "@/server/adapters";
import { requestAccess } from "@/server/auth/access";
import { linkBase } from "@/server/auth/links";
import { clientIp, rateLimited } from "@/server/auth/rate-limit";

const bodySchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1, "Enter your name.").max(80),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a phone number owners can text.")
    .max(30)
    .regex(/^[\d\s()+.-]+$/, "Enter a phone number owners can text."),
  connection: z.string().trim().min(1, "Say how you're connected to the school.").max(40),
  next: z.string().max(200).optional(),
});

/** An unknown address asking for access: recorded as pending, and every admin is emailed. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const { email, name, phone, connection, next } = parsed.data;
  if (rateLimited(`ip:${clientIp(request)}`, 20, 15 * 60_000) || rateLimited(`email:${email.toLowerCase()}`, 5, 15 * 60_000)) {
    return Response.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }
  try {
    const status = await requestAccess({ email, name, phone, connection, linkBase: linkBase(request), next }, await getDeps());
    return Response.json({ ok: true, status });
  } catch (error) {
    console.error("[auth] access request failed:", error);
    return Response.json({ error: "We couldn't send your request. Please try again." }, { status: 502 });
  }
}
