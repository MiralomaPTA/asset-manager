import { config } from "@/server/config";
import { Db } from "@/server/db/db";
import type { Adapters, FileStore, Mailer } from "@/server/adapters/types";

/**
 * What the domain code works with: the typed Sheet, the photo store, the
 * mailer and a clock. Tests build their own with in-memory adapters and a
 * fixed clock.
 */
export interface Deps {
  db: Db;
  files: FileStore;
  mailer: Mailer;
  now: () => Date;
}

let adapters: Adapters | null = null;
let deps: Deps | null = null;

/** The backends selected by the ADAPTERS env var. */
export async function getAdapters(): Promise<Adapters> {
  if (adapters) return adapters;
  if (config.adapters === "google") {
    const [{ googleSheetStore }, { googleFileStore }, { googleMailer }] = await Promise.all([
      import("@/server/adapters/google/sheets"),
      import("@/server/adapters/google/files"),
      import("@/server/adapters/google/mailer"),
    ]);
    adapters = { sheets: googleSheetStore, files: googleFileStore, mailer: googleMailer };
  } else {
    // On Vercel the local adapter writes to the function's temporary disk: every
    // request would look saved and then vanish. Refuse unless someone is
    // knowingly trying a production build on their own machine.
    if (config.isProduction && process.env.ALLOW_LOCAL_ADAPTERS_IN_PRODUCTION !== "1") {
      throw new Error("ADAPTERS=local in production would lose every request. Set ADAPTERS=google, or ALLOW_LOCAL_ADAPTERS_IN_PRODUCTION=1 to try a production build on a laptop.");
    }
    const [{ localSheetStore }, { localFileStore }, { localMailer }] = await Promise.all([
      import("@/server/adapters/local/sheets"),
      import("@/server/adapters/local/files"),
      import("@/server/adapters/local/mailer"),
    ]);
    adapters = { sheets: localSheetStore, files: localFileStore, mailer: localMailer };
  }
  return adapters;
}

export async function getDeps(): Promise<Deps> {
  if (deps) return deps;
  const a = await getAdapters();
  deps = { db: new Db(a.sheets, config.sheetCacheMs), files: a.files, mailer: a.mailer, now: () => new Date() };
  return deps;
}
