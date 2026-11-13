import type { NextRequest } from "next/server";
import { getDeps } from "@/server/adapters";
import { getMe } from "@/server/auth/session";

/**
 * Item and return photos, for signed-in users only. Every new photo is a new
 * file with a new ID, so a photo never changes and browsers may keep it for
 * a year; `private` keeps shared caches from storing it.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/photos/[id]">) {
  if (!(await getMe())) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return new Response("Not found", { status: 404 });
  const file = await (await getDeps()).files.get(id);
  if (!file) return new Response("Not found", { status: 404 });
  const type = file.mimeType === "image/jpeg" || file.mimeType === "image/png" ? file.mimeType : "application/octet-stream";
  return new Response(new Blob([file.bytes.slice()], { type }), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": type === "application/octet-stream" ? "attachment" : "inline",
    },
  });
}
