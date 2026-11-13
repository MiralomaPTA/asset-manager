import { Readable } from "node:stream";
import { drive as driveApi, type drive_v3 } from "@googleapis/drive";
import { googleConfig } from "@/server/config";
import { googleAuth } from "@/server/adapters/google/auth";
import type { FileKind, FileStore } from "@/server/adapters/types";

/**
 * Google Drive implementation. Everything lives under the "PTA equipment"
 * folder owned by equipment@: item photos and thumbnails in photos/, photos
 * taken at return in returns/. Nothing is shared publicly; the app serves
 * photos itself to signed-in users.
 *
 * Each file is tagged with `appProperties.kind`, and `get` refuses anything
 * without one, so a file ID can only ever reach a file the app stored.
 */

const FOLDER = "application/vnd.google-apps.folder";
const KINDS: readonly FileKind[] = ["photo", "thumb", "return"];
const FOLDER_FOR: Record<FileKind, string> = { photo: "photos", thumb: "photos", return: "returns" };

let api: drive_v3.Drive | null = null;

function drive(): drive_v3.Drive {
  if (!api) api = driveApi({ version: "v3", auth: googleAuth() });
  return api;
}

/** The subfolder's ID, creating it on first use. Looked up each time: uploads are rare, and a trashed folder must not linger in a cache. */
async function folderId(name: string): Promise<string> {
  const parent = googleConfig().rootFolderId;
  const found = await drive().files.list({
    q: `name='${name}' and '${parent}' in parents and mimeType='${FOLDER}' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const id = found.data.files?.[0]?.id;
  if (id) return id;
  const created = await drive().files.create({
    requestBody: { name, mimeType: FOLDER, parents: [parent] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Could not create Drive folder ${name}`);
  return created.data.id;
}

export const googleFileStore: FileStore = {
  async put({ name, mimeType, bytes, kind, uploader }) {
    const parent = await folderId(FOLDER_FOR[kind]);
    const { data } = await drive().files.create({
      requestBody: { name, mimeType, parents: [parent], appProperties: { kind, uploader } },
      media: { mimeType, body: Readable.from(Buffer.from(bytes)) },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!data.id) throw new Error("Drive did not return a file id");
    return { id: data.id };
  },

  async get(id) {
    let meta: drive_v3.Schema$File;
    try {
      meta = (await drive().files.get({ fileId: id, fields: "mimeType,appProperties,trashed", supportsAllDrives: true })).data;
    } catch {
      return null;
    }
    const kind = meta.appProperties?.kind as FileKind | undefined;
    if (meta.trashed || !kind || !KINDS.includes(kind)) return null;
    const { data } = await drive().files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    return { mimeType: meta.mimeType ?? "application/octet-stream", kind, bytes: new Uint8Array(data as ArrayBuffer) };
  },
};
